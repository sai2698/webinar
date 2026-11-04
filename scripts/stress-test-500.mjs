import { io } from 'socket.io-client';

const TARGET = 'https://sainaveen.in';
const SLUG = 'advanced-sfu-masterclass';
const TARGET_COUNT = 500;
const HOLD_DURATION_SEC = 300; // 5 minutes

async function getHealth() {
  try {
    const t0 = Date.now();
    const res = await fetch(`${TARGET}/api/health`, { timeout: 6000 });
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
  console.log(`=======================================================`);
  console.log(`  500-PARTICIPANT 5-MINUTE SUSTAINED ENDURANCE TEST`);
  console.log(`  Target: ${TARGET}/room/${SLUG}`);
  console.log(`  Participants: ${TARGET_COUNT} concurrent connections`);
  console.log(`  Duration: ${HOLD_DURATION_SEC} seconds (5 minutes)`);
  console.log(`=======================================================\n`);

  const initial = await getHealth();
  console.log(`Pre-test Server Health: ${initial.ok ? `OK (latency: ${initial.latency}ms)` : initial.error}`);

  // Phase 1: Fetch tokens in controlled parallel batches
  console.log(`\n[Phase 1/3] Minting ${TARGET_COUNT} participant session tokens...`);
  const tokenStart = Date.now();
  const tokens = [];
  const tokenErrors = [];
  const batchSize = 20;

  for (let i = 0; i < TARGET_COUNT; i += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, TARGET_COUNT - i) }, (_, k) => i + k);
    const results = await Promise.allSettled(batch.map((idx) => getGuestToken(idx)));
    for (const r of results) {
      if (r.status === 'fulfilled') tokens.push(r.value);
      else tokenErrors.push(r.reason.message);
    }
    process.stdout.write(`\r  Tokens minted: ${tokens.length}/${TARGET_COUNT} (failed: ${tokenErrors.length})`);
    await new Promise((r) => setTimeout(r, 60)); // smooth spacing
  }
  console.log(`\n  Done in ${Math.round((Date.now() - tokenStart) / 1000)}s`);

  if (tokens.length === 0) {
    console.error('Fatal: Could not mint any tokens.');
    process.exit(1);
  }

  // Phase 2: Staggered ramp-up of WebSocket connections
  console.log(`\n[Phase 2/3] Connecting ${tokens.length} WebSocket participants (staggered ramp-up)...`);
  const activeSockets = [];
  const joinErrors = [];
  const joinLatencies = [];
  const connectStart = Date.now();

  const connectPromises = tokens.map((token, idx) => {
    return new Promise((resolve) => {
      // Stagger connections every 50ms (20 connections/sec) to avoid synthetic SYN floods
      setTimeout(() => {
        const t0 = Date.now();
        const socket = io(TARGET, {
          transports: ['websocket'],
          path: '/socket.io/',
          auth: { token },
          timeout: 15000,
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
      }, idx * 50);
    });
  });

  await Promise.all(connectPromises);
  const rampDurationSec = Math.round((Date.now() - connectStart) / 1000);
  console.log(`\n  Ramp-up complete in ${rampDurationSec}s!`);
  console.log(`  Active concurrent connections: ${activeSockets.length}`);
  console.log(`  Join rejections/errors: ${joinErrors.length}`);

  // Phase 3: 5-minute sustained hold with periodic health monitoring
  console.log(`\n[Phase 3/3] Holding ${activeSockets.length} connections for ${HOLD_DURATION_SEC} seconds (5 mins)...`);
  const holdStart = Date.now();
  const healthChecks = [];

  const intervalSec = 30;
  const iterations = Math.floor(HOLD_DURATION_SEC / intervalSec);

  for (let i = 1; i <= iterations; i++) {
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
    const elapsed = Math.round((Date.now() - holdStart) / 1000);
    const health = await getHealth();
    healthChecks.push({ elapsed, ...health });

    const connectedNow = activeSockets.filter((s) => s.connected).length;
    console.log(
      `  [+${elapsed}s / 300s] Connected: ${connectedNow}/${activeSockets.length} | API Health: ${
        health.ok ? `200 OK (${health.latency}ms, uptime: ${Math.round(health.data?.uptime || 0)}s)` : `DEGRADED (${health.error})`
      }`
    );
  }

  // Final remaining hold seconds
  const remainingMs = HOLD_DURATION_SEC * 1000 - (Date.now() - holdStart);
  if (remainingMs > 0) {
    await new Promise((r) => setTimeout(r, remainingMs));
  }

  // Summary before teardown
  const finalConnected = activeSockets.filter((s) => s.connected).length;

  console.log(`\n=======================================================`);
  console.log(`  TEARING DOWN CONNECTIONS`);
  console.log(`=======================================================`);
  for (const s of activeSockets) {
    try {
      s.disconnect();
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 2000));

  const postHealth = await getHealth();

  // Metrics calculation
  joinLatencies.sort((a, b) => a - b);
  const minLat = joinLatencies[0] || 0;
  const maxLat = joinLatencies[joinLatencies.length - 1] || 0;
  const avgLat = joinLatencies.length ? Math.round(joinLatencies.reduce((a, b) => a + b, 0) / joinLatencies.length) : 0;
  const p95Lat = joinLatencies[Math.floor(joinLatencies.length * 0.95)] || 0;

  console.log(`\n=======================================================`);
  console.log(`  500-PARTICIPANT 5-MINUTE TEST RESULTS`);
  console.log(`=======================================================`);
  console.log(`Peak Target:           ${TARGET_COUNT}`);
  console.log(`Successfully Joined:   ${activeSockets.length} (${Math.round((activeSockets.length / TARGET_COUNT) * 100)}%)`);
  console.log(`Retained at 5 mins:    ${finalConnected} (${Math.round((finalConnected / activeSockets.length) * 100)}%)`);
  console.log(`Join Latency:          Min=${minLat}ms, Avg=${avgLat}ms, p95=${p95Lat}ms, Max=${maxLat}ms`);
  console.log(`API Health After Test: ${postHealth.ok ? `HEALTHY (${postHealth.latency}ms)` : 'UNHEALTHY'}`);
  console.log(`\nPeriodic 30-Second Health Samples:`);
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

