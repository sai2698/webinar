/**
 * Ensures the mediasoup native worker binary exists.
 *
 * mediasoup ships a prebuilt `mediasoup-worker` binary per platform, but its
 * own postinstall download can fail or fallback to compiling from source.
 * This script checks for the binary and, if missing, downloads the official prebuilt
 * tarball directly from GitHub releases.
 *
 * Safe to run repeatedly — it exits immediately when the binary is present.
 */
import { existsSync, mkdirSync, createWriteStream, unlinkSync, chmodSync, statSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(__dirname, '..');

function findMediasoupRoot() {
  const candidates = [
    join(serverRoot, 'node_modules', 'mediasoup'),
    join(serverRoot, '..', '..', 'node_modules', 'mediasoup'),
  ];
  return candidates.find((p) => existsSync(join(p, 'package.json'))) ?? null;
}

const msRoot = findMediasoupRoot();
if (!msRoot) {
  console.log('[mediasoup] package not installed yet — skipping worker check');
  process.exit(0);
}

const isWin = os.platform() === 'win32';
const binPath = join(
  msRoot,
  'worker',
  'out',
  'Release',
  isWin ? 'mediasoup-worker.exe' : 'mediasoup-worker'
);

if (existsSync(binPath)) {
  console.log('[mediasoup] worker binary present');
  process.exit(0);
}

let pkg = { version: '3.15.5' };
try {
  pkg = JSON.parse(readFileSync(join(msRoot, 'package.json'), 'utf8'));
} catch (e) {
  console.warn('[mediasoup] could not read package.json directly:', e.message);
}

const releaseDir = join(msRoot, 'worker', 'out', 'Release');
mkdirSync(releaseDir, { recursive: true });
const tarPath = join(releaseDir, 'worker.tgz');

// Candidate kernels to try on Linux (exact, then common LTS kernels)
const kernelMajor = Number(os.release().split('.')[0]) || 6;
const kernelCandidates = isWin ? [''] : (kernelMajor === 6 ? ['kernel6', 'kernel5', 'kernel7'] : ['kernel5', 'kernel6']);

let installed = false;
for (const k of kernelCandidates) {
  let tarName = `mediasoup-worker-${pkg.version}-${os.platform()}-${os.arch()}`;
  if (os.platform() === 'linux' && k) {
    tarName += `-${k}`;
  }
  tarName += '.tgz';

  const urls = [
    `https://github.com/versatica/mediasoup/releases/download/${pkg.version}/${tarName}`,
  ];
  if (pkg.version !== '3.15.5' && os.platform() === 'linux') {
    urls.push(`https://github.com/versatica/mediasoup/releases/download/3.15.5/mediasoup-worker-3.15.5-linux-${os.arch()}-${k}.tgz`);
  }

  for (const url of urls) {
    console.log(`[mediasoup] trying prebuilt worker: ${url}`);
    try {
      try {
        execSync(`curl -sSL -f --retry 2 -o "${tarPath}" "${url}"`, { stdio: 'ignore' });
      } catch {
        // Fall back to fetch if curl failed
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) continue;
        await pipeline(Readable.fromWeb(res.body), createWriteStream(tarPath));
      }

      if (existsSync(tarPath) && statSync(tarPath).size > 100_000) {
        execSync(`tar -xzf "${tarPath}" -C "${releaseDir}"`, { stdio: 'ignore' });
        unlinkSync(tarPath);
        if (!isWin && existsSync(binPath)) {
          chmodSync(binPath, 0o775);
        }
        if (existsSync(binPath)) {
          console.log('[mediasoup] prebuilt worker binary installed successfully');
          installed = true;
          break;
        }
      }
    } catch {
      if (existsSync(tarPath)) unlinkSync(tarPath);
    }
  }
  if (installed) break;
}

if (!installed && !existsSync(binPath)) {
  console.warn(
    '[mediasoup] could not automatically fetch prebuilt worker.\n' +
    '  Will skip native C++ compilation to prevent freezing low-memory servers.'
  );
}
