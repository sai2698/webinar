import { io } from 'socket.io-client';

const TARGET = 'https://sainaveen.in';
const SLUG = 'advanced-sfu-masterclass';

async function getHealth() {
  try {
    const res = await fetch(`${TARGET}/api/health`, { timeout: 4000 });
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function getGuestToken(index) {
  const res = await fetch(`${TARGET}/api/webinars/${SLUG}/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `StressViewer-${index}` }),
  });
  if (!res.ok) throw new Error(`Guest join HTTP ${res.status}`);
  return await res.json();
}

async function runTier(targetCount, rampMs = 15) {
  console.log(`\n==================================================`);
  console.log(`  RUNNING STRESS TIER: ${targetCount} CONCURRENT PARTICIPANTS`);
  console.log(`==================================================`);

  const initialHealth = await getHealth();
  console.log(`Initial Server Health: Uptime ${Math.round(initialHealth.uptime)}s, Workers: ${initialHealth.workers}, Rooms: ${initialHealth.rooms}`);

  const startTime = Date.now();
  const joinLatencies = [];
  const errors = [];
  const activeSockets = [];

  // 1. Fetch guest tokens in batches
  process.stdout.write(`Fetching ${targetCount} tokens... `);
  const tokenStart = Date.now();
  const tokens = [];
  const batchSize = 10;
  for (let i = 0; i < targetCount; i += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, targetCount - i) }, (_, k) => i + k);
    const results = await Promise.allSettled(batch.map((idx) => getGuestToken(idx)));
    for (const r of results) {
      if (r.status === 'fulfilled') tokens.push(r.value.token);
      else errors.push(r.reason.message);
    }
  }
  console.log(`Done (${Date.now() - tokenStart}ms, ${tokens.length} tokens ready)`);

  // 2. Connect WebSockets and join
  process.stdout.write(`Connecting ${tokens.length} WebSocket participants... `);
  const connectPromises = tokens.map((token, idx) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const t0 = Date.now();
        const socket = io(TARGET, {
          transports: ['websocket'],
          path: '/socket.io/',
          auth: { token },
          timeout: 10000,
        });

        socket.on('connect', () => {
          socket.emit('join', { slug: SLUG, token }, (joinRes) => {
            const latency = Date.now() - t0;
            if (joinRes?.ok) {
              joinLatencies.push(latency);
              activeSockets.push(socket);
            } else {
              errors.push(joinRes?.error || 'Join rejected');
              socket.disconnect();
            }
            resolve();
          });
        });

        socket.on('connect_error', (err) => {
          errors.push(err.message);
          resolve();
        });
      }, idx * rampMs);
    });
  });

  await Promise.all(connectPromises);
  const totalRampTime = Date.now() - startTime;
  console.log(`All connected (${totalRampTime}ms)`);

  // 3. Measure hold stability under peak load
  console.log(`Holding peak load of ${activeSockets.length} concurrent connections for 5 seconds...`);
  await new Promise((r) => setTimeout(r, 5000));

  const peakHealth = await getHealth();

  // 4. Teardown
  for (const s of activeSockets) {
    s.disconnect();
  }
  await new Promise((r) => setTimeout(r, 1000));

  // Compute metrics
  joinLatencies.sort((a, b) => a - b);
  const min = joinLatencies[0] || 0;
  const max = joinLatencies[joinLatencies.length - 1] || 0;
  const avg = joinLatencies.length ? Math.round(joinLatencies.reduce((a, b) => a + b, 0) / joinLatencies.length) : 0;
  const p95 = joinLatencies[Math.floor(joinLatencies.length * 0.95)] || 0;

  const result = {
    targetCount,
    successCount: activeSockets.length,
    errorCount: errors.length,
    minLatencyMs: min,
    avgLatencyMs: avg,
    p95LatencyMs: p95,
    maxLatencyMs: max,
    serverResponding: peakHealth.ok,
    activeRooms: peakHealth.rooms,
  };

  console.log(`\n--- TIER ${targetCount} RESULTS ---`);
  console.log(`Success: ${result.successCount} / ${targetCount} (${Math.round((result.successCount / targetCount) * 100)}%)`);
  console.log(`Errors: ${result.errorCount}`);
  console.log(`Join Latency: Min=${min}ms, Avg=${avg}ms, p95=${p95}ms, Max=${max}ms`);
  console.log(`Server Health at Peak: ${peakHealth.ok ? 'HEALTHY (200 OK)' : 'DEGRADED'}`);

  return result;
}

async function main() {
  console.log(`==================================================`);
  console.log(`  NEXALIVE LIVE VPS STRESS TEST`);
  console.log(`  Target: ${TARGET}/room/${SLUG}`);
  console.log(`==================================================`);

  const results = [];
  results.push(await runTier(25, 20));
  results.push(await runTier(50, 15));
  results.push(await runTier(100, 10));
  results.push(await runTier(150, 8));

  console.log(`\n==================================================`);
  console.log(`  FINAL STRESS TEST SUMMARY`);
  console.log(`==================================================`);
  console.table(results);
}

main().catch(console.error);

