/**
 * Prints a compact summary of the live /api/health/webrtc payload.
 *
 * The endpoint returns a very large object (full mediasoup stats for every
 * producer and consumer), which is unreadable in a terminal. This script
 * reduces it to the fields that matter when diagnosing quality problems:
 * transport protocol, ICE state, selected tuple, bitrates and consumer scores.
 */
const url = process.env.HEALTH_URL || 'http://localhost:4000/api/health/webrtc';

const res = await fetch(url);
const j = await res.json();

console.log('ok:', j.ok, '| workers:', j.workers, '| announcedIp:', j.announcedIp);
console.log('rtcPorts:', JSON.stringify(j.rtcPorts));
if (j.warning) console.log('WARNING:', j.warning);

for (const room of j.rooms || []) {
  console.log(`\n=== room ${room.roomName} (${room.peersCount} peers) ===`);
  for (const p of room.peers) {
    const fmt = (t) =>
      !t
        ? 'no-transport'
        : !t.iceSelectedTuple
          ? `pending ice=${t.iceState} dtls=${t.dtlsState}`
          : `${t.protocol} ice=${t.iceState} dtls=${t.dtlsState} tuple=${t.iceSelectedTuple.protocol}:${t.iceSelectedTuple.localIp}:${t.iceSelectedTuple.localPort}->${t.iceSelectedTuple.remoteIp}:${t.iceSelectedTuple.remotePort}`;
    console.log(`  ${p.name} [${p.role}]`);
    console.log(`    send: ${fmt(p.sendTransport)}`);
    console.log(`    recv: ${fmt(p.recvTransport)}`);
    if (p.sendTransport?.iceSelectedTuple) {
      console.log(
        `    sendBitrate=${Math.round((p.sendTransport.sendBitrate || 0) / 1000)}kbps availOut=${Math.round((p.sendTransport.availableOutgoingBitrate || 0) / 1000)}kbps rtt=${p.sendTransport.roundTripTime ?? '?'}ms`
      );
    }
    if (p.recvTransport?.iceSelectedTuple) {
      console.log(
        `    recvBitrate=${Math.round((p.recvTransport.recvBitrate || 0) / 1000)}kbps availIn=${Math.round((p.recvTransport.availableIncomingBitrate || 0) / 1000)}kbps`
      );
    }
    for (const prod of p.producers) {
      const s = (prod.stats || [])[0] || {};
      console.log(
        `    producer ${prod.kind}/${prod.type} paused=${prod.paused} bitrate=${Math.round((s.bitrate || 0) / 1000)}kbps score=${s.score ?? '?'}`
      );
    }
    for (const c of p.consumers) {
      const s = (c.stats || [])[0] || {};
      console.log(
        `    consumer ${c.kind}/${c.type} paused=${c.paused} producerPaused=${c.producerPaused} score=${c.score ?? '?'} bitrate=${Math.round((s.bitrate || 0) / 1000)}kbps`
      );
    }
  }
}
