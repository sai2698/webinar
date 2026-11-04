# Mediasoup WebRTC load test

This package drives the webinar's **real Socket.IO + mediasoup WebRTC flow** from Chromium. Each viewer has a distinct JWT, joins the real room, creates a mediasoup receive transport, consumes the host's audio/video producers, resumes consumers and periodically reads inbound RTP stats. A single optional host browser publishes synthetic camera + microphone tracks with three simulcast encodings.

> This is a controlled staging test tool. Do not run it against a production webinar or third-party room. The runner requires an explicit staging acknowledgement and caps one generator at 250 viewer tabs. A 5,000-viewer run must be distributed across separately provisioned generator machines.

## Prerequisites

- Node.js 20+
- A staging deployment of this repository with a reachable UDP/TCP Mediasoup RTC port range and a publicly reachable announced IP.
- A staging webinar configured to allow a host to publish camera/microphone and participants to receive it.
- One unique attendee account/JWT per viewer, plus a host JWT. Reusing a JWT is not supported: the room intentionally enforces one active socket per user.
- Chromium dependencies on each generator machine.

## Install

From the repository root:

```bash
cd loadtest
npm install
cp .env.example .env
```

Edit `.env`. Set `SOCKET_URL`, `WEBINAR_SLUG`, and `LOADTEST_CONFIRM_TARGET=I_OWN_THIS_STAGING_SYSTEM`.

Create `users.json` locally (never commit it):

```json
[
  { "email": "load-viewer-001@example.test", "password": "replace-me" },
  { "email": "load-viewer-002@example.test", "password": "replace-me" }
]
```

Mint JWTs using accounts already provisioned in the staging app:

```bash
USERS_FILE=./users.json npm run mint-tokens
```

This writes `tokens.json` with mode 0600. For the host, log in to the host account and put its JWT in `HOST_TOKEN` on **one machine only**. The host must be the webinar owner or a permitted staff user.

## Start the browser agent

Terminal 1:

```bash
npm run dev -- --port 4173
```

Terminal 2:

```bash
npx playwright install chromium
MAX_VIEWERS=10 RAMP_UP_PER_SECOND=2 npm run run
```

Start at 10, then 25, 50 and 100 viewers. Increase only after checking SFU CPU, memory, NIC throughput, UDP drops, packet loss and join success. A successful socket join is not enough: verify each viewer reports at least the expected audio/video consumers.

## Distributed 5,000-viewer run

Do not run 5,000 Chromium tabs on one host. A practical first experiment is 50 generator VMs with 100 viewer identities each, adjusted after measuring memory/CPU per browser page. Split the unique `tokens.json` into non-overlapping `tokens-00.json` … `tokens-49.json` files and configure each agent with its own `TOKENS_FILE` and `MAX_VIEWERS=100`.

1. Start exactly one host-publisher agent with `HOST_TOKEN` set.
2. Start Vite on each generator machine, reachable locally at port 4173.
3. Start one runner per generator machine with its assigned token slice.
4. Coordinate start time externally; collect each runner's JSON-lines stdout.
5. Keep all generators on separate machines/networks from the SFU under test.
6. Stop all agents before resetting the staging webinar.

Example for each generator:

```bash
TOKENS_FILE=./tokens-00.json MAX_VIEWERS=100 RAMP_UP_PER_SECOND=2 npm run run
```

The host publisher is a separate single process. Do not set `HOST_TOKEN` on viewer-only agents.

## What it measures

- Real Socket.IO connect + join acknowledgements.
- Mediasoup Device negotiation and receive transport establishment.
- Successful consumer creation and resume for host producers.
- Inbound RTP bytes and cumulative packet loss from browser WebRTC stats.
- Agent failures and connection count snapshots.

The runner's `inboundBytesCumulative` is the sum of each page's cumulative inbound bytes at that sample; it is not a bitrate. Calculate bitrate from deltas between samples. The browser page reports active consumer count. Export the JSON-lines output to your metrics pipeline for long-run graphs.

## Safety and limitations

- The test runner does not create user accounts or bypass registration/payment/approval gates. Provision permitted staging users through your normal application workflow first.
- The host publishes one synthetic 720p camera and microphone stream. Simulcast sends three encodings (approximately 150 kbps / 500 kbps / 1.5 Mbps caps); the SFU/browser chooses a layer according to congestion and negotiated support.
- Browser tabs consume significant RAM and CPU. Measure per-agent capacity before extrapolating to 5,000.
- The test currently exercises the existing single-room-router topology. It does **not** make one SFU process or one router capable of 5,000 viewers.
- Multi-SFU sharding requires room ownership/routing, cross-router producer piping, a shared Socket.IO adapter, distributed peer state, and lifecycle/failover semantics. See `docs/scaling/5000-viewer-sfu.md`. Do not enable multi-node traffic until that design is implemented and tested.
- This harness has not been run against your infrastructure from this repository-editing session. It is code committed for you to install and run in staging, not a claim that 5,000 viewers have passed.
