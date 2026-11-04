import { io } from 'socket.io-client';
import https from 'https';

// WebRTC SFU Media-Consumer Stress Test
// Joins participants, creates real Mediasoup WebRtcTransports, and actively consumes
// all published video and audio tracks from the host.
//
// Usage:
//   node scripts/stress-test-media.mjs [count] [holdSeconds]
// Example:
//   node scripts/stress-test-media.mjs 50 60
//   node scripts/stress-test-media.mjs 100 120

const TARGET = process.env.TARGET_URL || 'https://sainaveen.in';
const SLUG = process.env.SLUG || 'advanced-sfu-masterclass';
const TARGET_COUNT = parseInt(process.argv[2] || '50', 10);
const HOLD_DURATION_SEC = parseInt(process.argv[3] || '60', 10);

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: Infinity,
  maxFreeSockets: 128,
  timeout: 30000,
});

async function getHealth() {
  try {
    const t0 = Date.now();
    const res = await fetch(`${TARGET}/api/health`, { timeout: 8000 });
    const latency = Date.now() - t0;
    const data = await res.json();
    return { ok: true, latency, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function getGuestToken(index) {
  const res = await fetch(`${TARGET}/api/webinars/${SLUG}/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `MediaViewer-${index + 1}` }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.token;
}

function promisifyEmit(socket, event, data) {
  return new Promise((resolve) => {
    socket.emit(event, data, (response) => {
      resolve(response);
    });
  });
}

async function main() {
  console.log(`================================================================`);
  console.log(`  WEBRTC SFU MEDIA-CONSUMER STRESS TEST`);
  console.log(`  Target:       ${TARGET}/room/${SLUG}`);
  console.log(`  Participants: ${TARGET_COUNT} media-consuming viewers`);
  console.log(`  Hold Time:    ${HOLD_DURATION_SEC} seconds`);
  console.log(`================================================================\n`);

  const initial = await getHealth();
  console.log(`Pre-test Server Health: ${initial.ok ? `200 OK (${initial.latency}ms)` : initial.error}`);

  // Phase 1: Mint tokens
  console.log(`\n[Phase 1/4] Minting ${TARGET_COUNT} participant session tokens...`);
  const tokens = [];
  for (let i = 0; i < TARGET_COUNT; i += 20) {
    const batch = Array.from({ length: Math.min(20, TARGET_COUNT - i) }, (_, k) => i + k);
    const results = await Promise.allSettled(batch.map((idx) => getGuestToken(idx)));
    for (const r of results) {
      if (r.status === 'fulfilled') tokens.push(r.value);
    }
    process.stdout.write(`\r  Tokens ready: ${tokens.length}/${TARGET_COUNT}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`\n  Done.`);

  // Phase 2: Connect first participant to discover active producers
  console.log(`\n[Phase 2/4] Inspecting active producers in room...`);
  let discoveredProducers = [];
  const probeSocket = io(TARGET, {
    transports: ['websocket'],
    path: '/socket.io/',
    auth: { token: tokens[0] },
    timeout: 15000,
  });

  const probeRtpCaps = await new Promise((resolve, reject) => {
    probeSocket.on('connect', () => {
      probeSocket.emit('join', { slug: SLUG, token: tokens[0] }, (ack) => {
        if (!ack?.ok) return reject(new Error(ack?.error || 'Probe join failed'));
        const peers = ack?.data?.snapshot?.peers || [];
        for (const p of peers) {
          if (p.producers && p.producers.length > 0) {
            for (const prod of p.producers) {
              discoveredProducers.push({ ...prod, ownerName: p.name });
            }
          }
        }
        resolve(ack?.data?.rtpCapabilities);
      });
    });
    probeSocket.on('connect_error', (err) => reject(err));
  });

  probeSocket.disconnect();

  console.log(`  Active Producers Discovered: ${discoveredProducers.length}`);
  for (const prod of discoveredProducers) {
    console.log(`   - Producer [${prod.kind} / ${prod.source}] from "${prod.ownerName}" (ID: ${prod.producerId})`);
  }

  if (discoveredProducers.length === 0) {
    console.warn(`\n  [WARNING] No active camera, screen, or microphone streams found in the room!`);
    console.warn(`  To test real video/audio load, have the Host start their Camera or Screen Share in the browser first.`);
    console.warn(`  Proceeding with WebRtcTransport creation stress...`);
  }

  // Phase 3: Connect participants, create WebRtcTransports and consume streams
  console.log(`\n[Phase 3/4] Ramping up ${tokens.length} WebRTC viewers & consuming media streams...`);
  const activeSockets = [];
  const createdTransports = [];
  const activeConsumers = [];
  const errors = [];
  const connectStart = Date.now();

  const connectViewer = async (token, idx) => {
    await new Promise((r) => setTimeout(r, idx * 80)); // 12-15 viewers/sec ramp
    return new Promise((resolve) => {
      const socket = io(TARGET, {
        transports: ['websocket'],
        path: '/socket.io/',
        auth: { token },
        timeout: 25000,
        agent,
      });

      socket.on('connect', async () => {
        // Step A: Join room
        const joinRes = await promisifyEmit(socket, 'join', { slug: SLUG, token });
        if (!joinRes?.ok) {
          errors.push(joinRes?.error || 'Join failed');
          socket.disconnect();
          return resolve();
        }
        activeSockets.push(socket);

        // Step B: Create receiving WebRtcTransport on Mediasoup
        const transRes = await promisifyEmit(socket, 'createTransport', { direction: 'recv' });
        if (!transRes?.ok) {
          errors.push(transRes?.error || 'Create transport failed');
          return resolve();
        }
        createdTransports.push(transRes.data.id);

        // Step C: Consume all active producers
        const rtpCapabilities = joinRes.data.rtpCapabilities || probeRtpCaps;
        for (const prod of discoveredProducers) {
          const consumeRes = await promisifyEmit(socket, 'consume', {
            producerId: prod.producerId,
            rtpCapabilities,
          });

          if (consumeRes?.ok) {
            activeConsumers.push(consumeRes.data.id);
            // Step D: Resume consumer on SFU
            await promisifyEmit(socket, 'resumeConsumer', { consumerId: consumeRes.data.id });
          } else {
            errors.push(consumeRes?.error || 'Consume failed');
          }
        }

        resolve();
      });

      socket.on('connect_error', (err) => {
        errors.push(err.message);
        resolve();
      });
    });
  };

  for (let i = 0; i < tokens.length; i += 15) {
    const chunk = tokens.slice(i, i + 15);
    await Promise.all(chunk.map((tok, cIdx) => connectViewer(tok, i + cIdx)));
    process.stdout.write(
      `\r  Ramped: ${activeSockets.length}/${tokens.length} | Transports: ${createdTransports.length} | Active Consumers: ${activeConsumers.length}`
    );
  }

  const rampTime = Math.round((Date.now() - connectStart) / 1000);
  console.log(`\n\n  Ramp complete in ${rampTime}s!`);
  console.log(`  Active Viewers:        ${activeSockets.length}`);
  console.log(`  WebRtcTransports:      ${createdTransports.length}`);
  console.log(`  SFU Active Consumers:  ${activeConsumers.length}`);
  console.log(`  Errors:                ${errors.length}`);

  // Phase 4: Sustained media streaming hold
  console.log(`\n[Phase 4/4] Holding media load for ${HOLD_DURATION_SEC} seconds (monitor your VPS CPU/RAM now)...`);
  const holdStart = Date.now();
  const intervalSec = 15;
  const iterations = Math.floor(HOLD_DURATION_SEC / intervalSec);

  for (let i = 1; i <= iterations; i++) {
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
    const elapsed = Math.round((Date.now() - holdStart) / 1000);
    const health = await getHealth();
    console.log(
      `  [+${elapsed}s / ${HOLD_DURATION_SEC}s] Active Viewers: ${activeSockets.filter((s) => s.connected).length} | SFU Consumers: ${activeConsumers.length} | API Health: ${
        health.ok ? `200 OK (${health.latency}ms)` : `DEGRADED (${health.error})`
      }`
    );
  }

  // Teardown
  console.log(`\n  Cleaning up transports and disconnecting...`);
  for (const s of activeSockets) {
    try { s.disconnect(); } catch {}
  }
  await new Promise((r) => setTimeout(r, 2000));
  const postHealth = await getHealth();
  console.log(`Post-test health: ${postHealth.ok ? 'HEALTHY' : 'DEGRADED'}`);
}

main().catch(console.error);

