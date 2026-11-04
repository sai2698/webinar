import { roomManager } from './RoomManager.js';
import { workerPool } from './WorkerPool.js';

/**
 * Lightweight Prometheus exposition for the current process.
 * Keep labels bounded: webinar IDs and peer IDs must never become metric labels.
 */
export function renderSfuMetrics(): string {
  const rooms = roomManager.all;
  let peers = 0;
  let producers = 0;
  let consumers = 0;
  let routers = 0;

  for (const room of rooms) {
    if (room.router && !room.router.closed) routers += 1;
    peers += room.peers.size;
    for (const peer of room.peers.values()) {
      producers += peer.producers.size;
      consumers += peer.consumers.size;
    }
  }

  const rows: Array<[string, string, number]> = [
    ['webinar_sfu_workers', 'Number of mediasoup workers in this process.', workerPool.size],
    ['webinar_sfu_rooms', 'Number of live webinar rooms in this process.', rooms.length],
    ['webinar_sfu_routers', 'Number of active mediasoup routers in this process.', routers],
    ['webinar_sfu_peers', 'Number of connected peers in this process.', peers],
    ['webinar_sfu_producers', 'Number of active mediasoup producers in this process.', producers],
    ['webinar_sfu_consumers', 'Number of active mediasoup consumers in this process.', consumers],
    ['webinar_process_uptime_seconds', 'Process uptime in seconds.', Math.floor(process.uptime())],
  ];

  return rows
    .map(([name, help, value]) => `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}`)
    .join('\n') + '\n';
}
