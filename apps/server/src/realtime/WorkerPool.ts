import * as mediasoup from 'mediasoup';
import type { Worker, WebRtcServer } from 'mediasoup/types';
import { env } from '../config/env.js';
import { announcedIp, workerSettings } from '../config/mediasoup.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('sfu');

/**
 * Pool of mediasoup Workers — one per CPU core (capped by MEDIASOUP_WORKERS).
 * Routers are assigned round-robin so load spreads across cores.
 * Each worker hosts a WebRtcServer on a single unified port, eliminating port exhaustion.
 */
class WorkerPool {
  private workers: Worker[] = [];
  private webRtcServers = new Map<Worker, WebRtcServer>();
  private nextIndex = 0;
  private starting: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.workers.length > 0) return;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      const count = Math.max(1, env.MEDIASOUP_WORKERS);
      for (let i = 0; i < count; i++) {
        const worker = await mediasoup.createWorker(workerSettings);

        worker.on('died', (error) => {
          log.error(`Worker ${worker.pid} died — exiting in 2s`, error);
          setTimeout(() => process.exit(1), 2000);
        });

        // Initialize WebRtcServer so all thousands of transports on this worker
        // share the same single UDP & TCP port, solving port exhaustion completely.
        try {
          const port = env.RTC_MIN_PORT + i;
          const webRtcServer = await worker.createWebRtcServer({
            listenInfos: [
              {
                protocol: 'udp',
                ip: '0.0.0.0',
                announcedAddress: announcedIp,
                port,
              },
              {
                protocol: 'tcp',
                ip: '0.0.0.0',
                announcedAddress: announcedIp,
                port,
              },
              /*
               * Loopback candidate, development only.
               *
               * A browser running on the same machine as the server otherwise
               * has no locally-resolvable candidate: it must hairpin out to the
               * LAN address and back through the host's own NIC. That measured
               * 700 ms RTT on localhost — enough to stutter a 720p stream and
               * to push ICE into `disconnected`. Advertising 127.0.0.1 lets ICE
               * select the direct loopback pair instead.
               *
               * Never in production: a public deployment must not advertise a
               * loopback address, and no remote client could use it.
               */
              ...(env.NODE_ENV !== 'production'
                ? [
                    {
                      protocol: 'udp' as const,
                      ip: '127.0.0.1',
                      announcedAddress: '127.0.0.1',
                      port,
                    },
                  ]
                : []),
            ],
          });
          this.webRtcServers.set(worker, webRtcServer);
          log.info(`WebRtcServer single-port router started for Worker ${i + 1} on port ${port} (UDP/TCP)`);
        } catch (serverErr) {
          log.warn(`Could not start WebRtcServer for Worker ${i + 1}, using dynamic port fallback:`, serverErr);
        }

        this.workers.push(worker);
        log.info(`Worker ${i + 1}/${count} started (pid ${worker.pid})`);
      }
    })();

    return this.starting;
  }

  getNext(): Worker {
    if (this.workers.length === 0) {
      throw new Error('mediasoup workers not initialised');
    }
    const worker = this.workers[this.nextIndex % this.workers.length]!;
    this.nextIndex += 1;
    return worker;
  }

  getWebRtcServer(worker: Worker): WebRtcServer | undefined {
    return this.webRtcServers.get(worker);
  }

  get size(): number {
    return this.workers.length;
  }

  async close(): Promise<void> {
    for (const server of this.webRtcServers.values()) {
      server.close();
    }
    this.webRtcServers.clear();
    await Promise.all(this.workers.map((w) => w.close()));
    this.workers = [];
  }
}

export const workerPool = new WorkerPool();
