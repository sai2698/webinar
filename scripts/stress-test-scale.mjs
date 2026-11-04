import { io } from 'socket.io-client';
import https from 'https';

// Multi-Tier SFU Webinar Stress Test (1,000 / 1,500 / 2,000 participants)
// Usage:
//   node scripts/stress-test-scale.mjs 1000
//   node scripts/stress-test-scale.mjs 1500
//   node scripts/stress-test-scale.mjs 2000

const TARGET = process.env.TARGET_URL || 'https://sainaveen.in';
const SLUG = process.env.SLUG || 'advanced-sfu-masterclass';
const TARGET_COUNT = parseInt(process.argv[2] || '1000', 10);
const HOLD_DURATION_SEC = parseInt(process.env.HOLD_SEC || '180', 10); // 3 minutes sustained hold

// Client-side HTTPS agent pool for high-socket concurrency
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: Infinity,
  maxFreeSockets: 256,
  timeout: 45000,
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
    body: JSON.stringify({ name: `Viewer-${index + 1}` }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function main() {
  console.log(`================================================================`);
  console.log(`  HIGH-SCALE WEBINAR STRESS TEST: ${TARGET_COUNT} PARTICIPANTS`);
  console.log(`  Target:       ${TARGET}/room/${SLUG}`);
  console.log(`  Target Count: ${TARGET_COUNT} concurrent connections`);
  console.log(`  Hold Time:    ${HOLD_DURATION_SEC} seconds`);
  console.log(`================================================================\n`);

  const initial = await getHealth();
  console.log(`Pre-test Server Health: ${initial.ok ? `200 OK (${initial.latency}ms, uptime: ${Math.round(initial.data?.uptime || 0)}s)` : initial.error}`);

  // Phase 1: Fetch tokens in controlled parallel batches
  console.log(`\n[Phase 1/3] Minting ${TARGET_COUNT} session tokens in batches...`);
  const tokenStart = Date.now();
  const tokens = [];
  const tokenErrors = [];
  const batchSize = 30;

  for (let i = 0; i < TARGET_COUNT; i += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, TARGET_COUNT - i) }, (_, k) => i + k);
    const results = await Promise.allSettled(batch.map((idx) => getGuestToken(idx)));
    for (const r of results) {
      if (r.status === 'fulfilled') tokens.push(r.value);
      else tokenErrors.push(r.reason.message);
    }
    process.stdout.write(`\r  Tokens ready: ${tokens.length}/${TARGET_COUNT} (failed: ${tokenErrors.length})`);
    await new Promise((r) => setTimeout(r, 40));
  }
  console.log(`\n  Done in ${Math.round((Date.now() - tokenStart) / 1000)}s`);

  if (tokens.length === 0) {
    console.error('Fatal: Could not mint tokens.');
    process.exit(1);
  }

  // Phase 2: Staggered ramp-up of WebSocket connections
  // Ramp rate: ~25 connections / sec (40ms interval) to prevent synthetic client SYN drops
  console.log(`\n[Phase 2/3] Connecting ${tokens.length} WebSocket participants (staggered ramp-up)...`);
  const activeSockets = [];
  const joinErrors = [];
  const joinLatencies = [];
  const connectStart = Date.now();

  const connectPromises = tokens.map((token, idx) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const t0 = Date.now();
        const socket = io(TARGET, {
          transports: ['websocket'],
          path: '/socket.io/',
          auth: { token },
          timeout: 30000, // 30-second handshake timeout
          reconnection: false,
          agent,
        });

        socket.on('connect', () => {
          socket.emit('join', { slug: SLUG, token }, (res) => {
            const latency = Date.now() - t0;
            if (res?.ok) {
              joinLatencies.push(latency);
              activeSockets.push(socket);
            } else {
              joinErrors.push(res?.error || 'Join rejected');
              socket.disconnect();
            }
            resolve();
          });
        });

        socket.on('connect_error', (err) => {
          joinErrors.push(err.message);
          resolve();
        });

        // Periodic progress indicator every 100 joins
        if ((idx + 1) % 100 === 0 || idx + 1 === tokens.length) {
          process.stdout.write(`\r  Ramped: ${idx + 1}/${tokens.length} | Active: ${activeSockets.length} | Errors: ${joinErrors.length}`);
        }
      }, idx * 40);
    });
  });

  await Promise.all(connectPromises);
  const rampDurationSec = Math.round((Date.now() - connectStart) / 1000);
  console.log(`\n  Ramp-up complete in ${rampDurationSec}s!`);
  console.log(`  Active concurrent connections: ${activeSockets.length} / ${TARGET_COUNT}`);
  console.log(`  Join rejections/errors:        ${joinErrors.length}`);

  // Phase 3: Sustained hold with health telemetry
  console.log(`\n[Phase 3/3] Sustaining ${activeSockets.length} connections for ${HOLD_DURATION_SEC} seconds...`);
  const holdStart = Date.now();
  const healthChecks = [];
  const intervalSec = 20;
  const iterations = Math.floor(HOLD_DURATION_SEC / intervalSec);

  for (let i = 1; i <= iterations; i++) {
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
    const elapsed = Math.round((Date.now() - holdStart) / 1000);
    const health = await getHealth();
    healthChecks.push({ elapsed, ...health });

    const connectedNow = activeSockets.filter((s) => s.connected).length;
    console.log(
      `  [+${elapsed}s / ${HOLD_DURATION_SEC}s] Connected: ${connectedNow}/${activeSockets.length} | Server Health: ${
        health.ok ? `200 OK (${health.latency}ms, uptime: ${Math.round(health.data?.uptime || 0)}s)` : `DEGRADED (${health.error})`
      }`
    );
  }

  const remainingMs = HOLD_DURATION_SEC * 1000 - (Date.now() - holdStart);
  if (remainingMs > 0) await new Promise((r) => setTimeout(r, remainingMs));

  const finalConnected = activeSockets.filter((s) => s.connected).length;

  console.log(`\n================================================================`);
  console.log(`  TEARING DOWN CONNECTIONS`);
  console.log(`================================================================`);
  // Disconnect in batches to avoid local network driver shock
  for (let i = 0; i < activeSockets.length; i += 100) {
    const chunk = activeSockets.slice(i, i + 100);
    chunk.forEach((s) => {
      try { s.disconnect(); } catch {}
    });
    await new Promise((r) => setTimeout(r, 20));
  }
  await new Promise((r) => setTimeout(r, 2000));

  const postHealth = await getHealth();

  // Metrics calculation
  joinLatencies.sort((a, b) => a - b);
  const minLat = joinLatencies[0] || 0;
  const maxLat = joinLatencies[joinLatencies.length - 1] || 0;
  const avgLat = joinLatencies.length ? Math.round(joinLatencies.reduce((a, b) => a + b, 0) / joinLatencies.length) : 0;
  const p95Lat = joinLatencies[Math.floor(joinLatencies.length * 0.95)] || 0;

  console.log(`\n================================================================`);
  console.log(`  STRESS TEST SUMMARY: ${TARGET_COUNT} PARTICIPANTS`);
  console.log(`================================================================`);
  console.log(`Target Peak:             ${TARGET_COUNT}`);
  console.log(`Successfully Joined:     ${activeSockets.length} (${Math.round((activeSockets.length / TARGET_COUNT) * 100)}%)`);
  console.log(`Sustained Through Hold:  ${finalConnected} (${Math.round((finalConnected / (activeSockets.length || 1)) * 100)}%)`);
  console.log(`Join Latency:            Min=${minLat}ms, Avg=${avgLat}ms, p95=${p95Lat}ms, Max=${maxLat}ms`);
  console.log(`Post-Test Server Health: ${postHealth.ok ? `HEALTHY (${postHealth.latency}ms)` : 'UNHEALTHY'}`);
  console.log(`\nPeriodic Health Samples:`);
  console.table(
    healthChecks.map((h) => ({
      'Elapsed (s)': `${h.elapsed}s`,
      'API Status': h.ok ? '200 OK' : 'FAILED',
      'Ping (ms)': h.ok ? `${h.latency}ms` : 'N/A',
      Uptime: h.ok ? `${Math.round(h.data?.uptime || 0)}s` : 'N/A',
    }))
  );
}

main().catch(console.error);

