# V2 High-Scale Architecture & 10,000+ Participants Guide

## Overview

This guide details the V2 architecture implemented in NexaLive to scale webinars to **10,000+ concurrent participants** without port exhaustion, memory crashes, or network bottlenecks.

---

## 1. Port Architecture: V1 vs. V2

| Metric | Legacy V1 (Per-Transport Dynamic Ports) | V2 Single-Port Demux (`WebRtcServer`) |
| :--- | :--- | :--- |
| **Ports per Participant** | 2 UDP ports (1 send, 1 recv) | **0 dedicated ports** (multiplexed) |
| **Ports for 10,000 Users** | 20,000 open UDP ports | **1 UDP & 1 TCP port per CPU worker** |
| **Passive Viewer Overhead** | Eager send transport created on join | **0 send transports** (JIT created on publish) |
| **Firewall Surface Area** | Must whitelist large dynamic port range | Whitelist single port (`40000`) or small worker range |
| **DTLS / STUN Demuxing** | Handled at transport socket level | Handled at C++ kernel level by STUN `ufrag` tuple |

### How WebRtcServer Works

Instead of calling `router.createWebRtcTransport({ listenIps: [...] })` with dynamic ephemeral ports, each Mediasoup worker runs a single `WebRtcServer`:

```typescript
// apps/server/src/realtime/WorkerPool.ts
const port = env.RTC_MIN_PORT + workerIndex; // e.g. 40000
const webRtcServer = await worker.createWebRtcServer({
  listenInfos: [
    { protocol: 'udp', ip: '0.0.0.0', announcedAddress: announcedIp, port },
    { protocol: 'tcp', ip: '0.0.0.0', announcedAddress: announcedIp, port },
  ],
});
```

All transports created in the room pass this `webRtcServer`:
```typescript
const transport = await router.createWebRtcTransport({
  webRtcServer: room.getWebRtcServer(),
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
});
```

---

## 2. JIT (Just-In-Time) On-Demand Send Transports

In webinars, audience behavior is highly asymmetric:
- **1–3 broadcasters** (host, co-host, guest speaker)
- **99.9% passive viewers** (listening and watching)

### Optimization:
1. **Initial Join:** `useMediasoup.ts` only initializes a `recvTransport` for passive attendees. No `sendTransport` is created.
2. **On Publish:** When a participant is approved to speak and enables their camera/mic, `ensureSendTransport()` activates a send transport just-in-time.
3. **On Mute/Revoke:** When camera/mic is turned off, the client emits `closeTransport` via Socket.IO, immediately freeing file descriptors on the SFU.

---

## 3. What Happens If You Don't Have a CDN?

### For Live WebRTC Sessions
- **Live WebRTC media does NOT use a CDN**. Traditional CDNs operate on HTTP caching, whereas WebRTC uses sub-second peer-to-server RTP over UDP.
- **Egress Math:**
  $$\text{Total Egress} = N_{\text{viewers}} \times \text{Bitrate}$$
  - 100 viewers @ 1 Mbps = **100 Mbps**
  - 1,000 viewers @ 1 Mbps = **1 Gbps** (saturates standard VPS NIC)
  - 10,000 viewers @ 1 Mbps = **10 Gbps**
- **To scale live WebRTC without a third-party CDN:**
  - Scale vertically to a server with a **10 Gbps network interface** (e.g., AWS c6i.4xlarge, Hetzner dedicated with 10G uplink).
  - Use **multi-worker router piping** (`pipeToRouter`) to distribute load across CPU cores.

### For Premiere & Evergreen Replays (HTTP Video Slices)
- Premiere replays serve MP4/WebM files via HTTP range requests (`/api/recordings/:id/media`).
- **If you do NOT have a CDN:**
  1. **Bandwidth Saturation:** 10,000 concurrent viewers streaming a 1 Mbps replay require 10 Gbps egress.
  2. **Node.js Concurrency:** 10,000 concurrent Express range requests will exhaust Node's event loop and socket limits.
- **How NexaLive handles non-CDN deployments:**
  1. **Nginx Kernel `sendfile on;`:** Video bytes are copied directly from the kernel page cache to the network socket, bypassing Node.js user-space memory entirely.
  2. **`proxy_buffering off;`:** Range requests stream in real-time without buffering gigabytes into RAM.
  3. **Cloudflare Zero-Cost CDN (Recommended):** Routing DNS through Cloudflare's free plan proxies HTTP media chunks across global edge POPs without egress charges.

---

## 4. 1 vCPU / 1 GB RAM VPS Deployment Guide

Deploying on ultra-low resource servers (1 vCPU, 1 GB RAM) requires strict memory and process governance:

### Key Safeguards in `deploy-native.sh`:
1. **Dynamic Multi-File Swap:** Automatically provisions `/swapfile` or an additional `/swapfile2` to ensure total virtual memory (RAM + swap) reaches at least **3.5 GB**. This prevents Next.js compilation from triggering Linux OOM (Exit code 137).
2. **Single-Threaded Build:** Enforces `NEXT_CPU_COUNT=1` and `NEXT_TELEMETRY_DISABLED=1` to prevent Next.js worker thread spawning.
3. **Capped Heap Size:** Enforces `--max-old-space-size=768` during build and `--max-old-space-size=384` during runtime.
4. **Compiled Native Execution:** Runs `node apps/server/dist/index.js` instead of JIT `tsx`, saving ~150 MB of resident memory.
5. **Prebuilt Mediasoup Worker:** Skips resource-intensive C++ compilation on the VPS by downloading the official prebuilt `mediasoup-worker` binary directly.

