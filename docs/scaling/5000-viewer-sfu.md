# 5,000-viewer hybrid SFU architecture

## Current implementation finding

The current application has a single in-memory `Room` per webinar. `Room.getRouter()` creates one Mediasoup Router, and `socket.ts` uses `room.router` for every peer's send/receive transport and consumer. `WorkerPool` round-robins **router creation** across local workers; it does not split one webinar's viewers across routers or hosts. A second application process would create an independent room and router unless room ownership is introduced.

Therefore, adding workers alone does not provide horizontal scale for one webinar.

## Target hybrid topology

- Keep the existing Next.js / Express control plane and PostgreSQL database.
- Run a dedicated SFU node pool; each SFU node owns a subset of webinar media shards.
- Introduce a room directory (Redis) that assigns each webinar to an SFU shard and stores a lease/heartbeat.
- Use the Socket.IO Redis adapter for cross-process room broadcasts, while keeping media peer/transport state local to the SFU node that owns the peer.
- Put viewers on multiple consumer routers. Pipe host producers from the publisher router to consumer routers with Mediasoup `router.pipeToRouter()` / PipeTransports. Each viewer consumes from the router local to its SFU node.
- Keep host publishing on one designated origin router; replicate only the required producer streams to consumer shards.
- Use TURN for restrictive networks and expose an explicit RTC UDP port range per SFU node.

## Required implementation phases

1. **Instrumentation and baseline:** expose bounded Prometheus gauges for workers, rooms, routers, peers, producers and consumers; run the included browser load generator against the current one-router implementation.
2. **Single-process router sharding:** introduce a RoomMediaTopology abstraction, assign each peer to a router shard, pipe producers to consumer shards, and ensure consumer lookup resolves the local piped producer. Keep visibility/role policy checks before every consume. Preserve recording by consuming from the publisher router.
3. **Cross-process room ownership:** add Redis leases and a Socket.IO Redis adapter; route a room's signaling/media control to its owning SFU process. Do not share live Mediasoup object references through Redis.
4. **Failure handling:** implement owner lease renewal, process drain, host re-publish/recovery, viewer reconnect, idempotent room cleanup and stale-shard cleanup.
5. **Capacity validation:** prove 500 → 1,000 → 2,500 → 5,000 viewer stages with real browser media consumers and independent generators.

## Capacity math

For one 720p stream delivered at an average 1.5 Mbps video plus 64 kbps audio:

- 500 viewers: about 782 Mbps egress.
- 5,000 viewers: about 7.82 Gbps egress.

At a 2 Mbps video plus 64 kbps audio average, 5,000 viewers need about 10.32 Gbps egress. Add transport overhead, retransmissions, audio/video variability, TURN relay egress, and headroom. These are planning estimates, not measured requirements. Adaptive simulcast lowers average consumption only when clients actually select lower layers; it does not remove the need to budget peak bandwidth.

## Operational rule

Do not call a deployment "5,000-viewer ready" until a 30–60 minute run demonstrates stable join success, media delivery, packet loss, RTT, CPU, memory and egress at the target audience size. The included harness measures real WebRTC consumers but does not itself implement this distributed SFU topology.
