import 'dotenv/config';
import { chromium, type Browser, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type TokenRecord = { token: string; name?: string };
const socketUrl = process.env.SOCKET_URL;
const slug = process.env.WEBINAR_SLUG;
const tokenFile = resolve(process.env.TOKENS_FILE || './tokens.json');
const maxViewers = Number(process.env.MAX_VIEWERS || 10);
const ramp = Math.max(1, Number(process.env.RAMP_UP_PER_SECOND || 1));
const durationSeconds = Number(process.env.RUN_DURATION_SECONDS || 180);
const chatEverySeconds = Number(process.env.CHAT_EVERY_SECONDS || 0);
const headless = process.env.HEADLESS !== 'false';
const confirm = process.env.LOADTEST_CONFIRM_TARGET;

if (confirm !== 'I_OWN_THIS_STAGING_SYSTEM') {
  throw new Error('Refusing to run: set LOADTEST_CONFIRM_TARGET=I_OWN_THIS_STAGING_SYSTEM after verifying this is your isolated staging system.');
}
if (!socketUrl || !slug) throw new Error('SOCKET_URL and WEBINAR_SLUG are required.');
if (!Number.isInteger(maxViewers) || maxViewers < 1 || maxViewers > 250) {
  throw new Error('MAX_VIEWERS must be between 1 and 250 per generator machine.');
}

const records = JSON.parse(await readFile(tokenFile, 'utf8')) as TokenRecord[];
if (!Array.isArray(records) || records.length < maxViewers) {
  throw new Error(`tokens.json must contain at least ${maxViewers} unique viewer JWTs.`);
}
if (new Set(records.slice(0, maxViewers).map((item) => item.token)).size !== maxViewers) {
  throw new Error('Each viewer must have a distinct JWT/user identity. Duplicate tokens are not allowed.');
}

let browser: Browser | undefined;
const pages: Page[] = [];
let stopping = false;

async function openAgent(token: string, mode: 'host' | 'viewer') {
  const page = await browser!.newPage({
    viewport: { width: 640, height: 480 },
    permissions: mode === 'host' ? ['camera', 'microphone'] : [],
  });
  pages.push(page);
  page.on('pageerror', (error) => console.error(`[${mode}] page error:`, error.message));
  const url = new URL('/?agent=1', process.env.WEB_ORIGIN || 'http://127.0.0.1:4173');
  url.searchParams.set('socketUrl', socketUrl!);
  url.searchParams.set('slug', slug!);
  url.searchParams.set('token', token);
  url.searchParams.set('mode', mode);
  url.searchParams.set('chatEverySeconds', String(chatEverySeconds));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const agent = (window as any).__webinarLoadAgent;
    return agent && ['connected', 'failed'].includes(agent.state);
  }, { timeout: 60_000 });
  const result = await page.evaluate(() => (window as any).__webinarLoadAgent);
  if (result.state !== 'connected') throw new Error(`${mode} failed: ${result.error}`);
  return page;
}

async function stop() {
  if (stopping) return;
  stopping = true;
  console.log('Stopping load agents…');
  await Promise.all(pages.map(async (page) => {
    try { await page.evaluate(() => (window as any).__webinarLoadAgent?.stop()); } catch {}
    await page.close().catch(() => undefined);
  }));
  await browser?.close();
}

process.on('SIGINT', () => void stop().then(() => process.exit(0)));
process.on('SIGTERM', () => void stop().then(() => process.exit(0)));

browser = await chromium.launch({
  headless,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
});

try {
  if (process.env.HOST_TOKEN) {
    console.log('Starting the single synthetic host publisher…');
    await openAgent(process.env.HOST_TOKEN, 'host');
  }

  console.log(`Starting ${maxViewers} WebRTC viewers against ${socketUrl} / ${slug}`);
  for (let offset = 0; offset < maxViewers; offset += ramp) {
    const batch = records.slice(offset, Math.min(offset + ramp, maxViewers));
    await Promise.all(batch.map((item) => openAgent(item.token, 'viewer')));
    console.log(`Connected ${Math.min(offset + batch.length, maxViewers)}/${maxViewers} viewers`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }

  const endAt = Date.now() + durationSeconds * 1000;
  while (!stopping && Date.now() < endAt) {
    const snapshot = await Promise.all(pages.map(async (page) => {
      try {
        return await page.evaluate(() => {
          const agent = (window as any).__webinarLoadAgent;
          return agent ? { state: agent.state, consumers: agent.consumers, inboundBytes: agent.inboundBytes, packetLoss: agent.packetLoss } : null;
        });
      } catch { return null; }
    }));
    const viewers = snapshot.filter(Boolean);
    const connected = viewers.filter((item: any) => item.state === 'connected').length;
    const consumers = viewers.reduce((sum: number, item: any) => sum + item.consumers, 0);
    const bytes = viewers.reduce((sum: number, item: any) => sum + item.inboundBytes, 0);
    const lost = viewers.reduce((sum: number, item: any) => sum + item.packetLoss, 0);
    console.log(JSON.stringify({ at: new Date().toISOString(), agents: viewers.length, connected, consumers, inboundBytesCumulative: bytes, packetsLostCumulative: lost }));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
  }
} finally {
  await stop();
}
