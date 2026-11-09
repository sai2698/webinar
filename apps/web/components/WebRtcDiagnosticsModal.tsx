import React, { useState, useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { getApiUrl } from '@/lib/api';

interface WebRtcDiagnosticsModalProps {
  socket: React.RefObject<Socket | null>;
  isOpen: boolean;
  onClose: () => void;
}

interface TransportHealth {
  id?: string;
  /** False when the peer has no transport in that direction (e.g. camera off). */
  publishing?: boolean;
  protocol: string;
  isTcpWarning: boolean;
  iceState?: string | null;
  dtlsState?: string | null;
  iceSelectedTuple?: {
    localIp?: string;
    localPort?: number;
    remoteIp?: string;
    remotePort?: number;
    protocol?: string;
  } | null;
  roundTripTime?: number | null;
  availableOutgoingBitrate?: number | null;
  availableIncomingBitrate?: number | null;
  sendBitrate?: number | null;
  recvBitrate?: number | null;
}

interface ServerWebRtcHealth {
  ok: boolean;
  announcedIp: string;
  isLoopbackWarning: boolean;
  warning: string | null;
  workers: number;
  rtcPorts: { min: number; max: number };
  rooms: Array<{
    roomName: string;
    peersCount: number;
    peers: Array<{
      peerId: string;
      name: string;
      role: string;
      sendTransport?: TransportHealth;
      recvTransport?: TransportHealth;
      producers: Array<{ kind: string; paused: boolean }>;
      consumers: Array<{ id: string; kind: string; paused: boolean; score?: unknown }>;
    }>;
  }>;
}

/** Formats a bitrate in bps as a compact kbps / Mbps string. */
function fmtBitrate(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || Number.isNaN(bps)) return '—';
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
}

/**
 * Formats a round-trip time.
 *
 * mediasoup reports `roundTripTime` in **milliseconds** (verified against a
 * live transport: a localhost peer reports `13`). It is not seconds, so it must
 * not be multiplied.
 */
function fmtRtt(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  return `${Math.round(ms)} ms`;
}

/**
 * One transport's badge row.
 *
 * Three distinct states have to be distinguishable, because they mean very
 * different things to whoever is debugging:
 *   - no transport at all  → the peer is not publishing / not subscribed
 *   - transport, no tuple  → ICE has not nominated a candidate pair yet
 *   - transport + tuple    → the negotiated protocol is known
 */
function TransportBadge({ label, t }: { label: string; t?: TransportHealth }) {
  if (!t) {
    return (
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 dark:bg-white/5 dark:text-slate-500">
        {label}: n/a
      </span>
    );
  }

  const connected = Boolean(t.iceSelectedTuple);
  const proto = connected ? (t.protocol || 'unknown').toUpperCase() : 'PENDING';
  const isUdp = proto === 'UDP';

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
        !connected
          ? 'bg-slate-500/10 text-slate-500 dark:text-slate-400'
          : isUdp
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
      }`}
      title={
        connected
          ? `${t.iceSelectedTuple?.localIp}:${t.iceSelectedTuple?.localPort} → ${t.iceSelectedTuple?.remoteIp}:${t.iceSelectedTuple?.remotePort}`
          : 'No ICE candidate pair nominated yet'
      }
    >
      {label}: {proto}
    </span>
  );
}

export function WebRtcDiagnosticsModal({
  socket,
  isOpen,
  onClose,
}: WebRtcDiagnosticsModalProps) {
  const [serverHealth, setServerHealth] = useState<ServerWebRtcHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [resyncSuccess, setResyncSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getApiUrl()}/api/health/webrtc`);
      const data = await res.json();
      setServerHealth(data);
    } catch (err) {
      console.warn('Failed to fetch WebRTC server health', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
      const interval = setInterval(fetchHealth, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleRequestKeyframes = () => {
    const s = socket.current;
    if (!s) return;
    // Emit requestKeyFrame for all consumers in all peers
    if (serverHealth?.rooms) {
      for (const room of serverHealth.rooms) {
        for (const peer of room.peers) {
          for (const consumer of peer.consumers) {
            if (consumer.kind === 'video') {
              s.emit('requestKeyFrame', { consumerId: consumer.id });
            }
          }
        }
      }
    }
    // Also trigger play on all DOM video elements to unfreeze decoder
    document.querySelectorAll('video').forEach((v) => {
      v.play().catch(() => {});
    });

    setResyncSuccess(true);
    setTimeout(() => setResyncSuccess(false), 2500);
  };

  const handleCopyReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      serverHealth,
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const hasTcpWarning = serverHealth?.rooms?.some((r) =>
    r.peers.some(
      (p) =>
        p.sendTransport?.isTcpWarning || p.recvTransport?.isTcpWarning
    )
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden dark:border-white/10 dark:bg-ink-900 text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/10 text-base text-brand-600 dark:text-brand-400">
              📶
            </span>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">WebRTC Production Traces & Health</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Real-time transport protocols, firewall inspection, and video stream recovery
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Loopback warning */}
          {serverHealth?.isLoopbackWarning && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-700 dark:text-red-300">
              <p className="font-bold flex items-center gap-1.5">
                <span>🚨</span> CRITICAL: Server is announcing 127.0.0.1 (Loopback)!
              </p>
              <p className="mt-1 leading-relaxed">
                In your VPS <code>.env</code> file, set{' '}
                <code>MEDIASOUP_ANNOUNCED_IP=162.19.81.219</code>. Otherwise, external participants cannot connect!
              </p>
            </div>
          )}

          {/* TCP Fallback warning (Causes video freezing!) */}
          {hasTcpWarning && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-bold flex items-center gap-1.5">
                <span>⚠️</span> WARNING: WebRTC is falling back to TCP!
              </p>
              <p className="mt-1 leading-relaxed">
                One or more participants are streaming over <b>TCP instead of UDP</b>. TCP retransmissions cause severe
                head-of-line blocking, packet buffering, and frozen video under load.
              </p>
              <p className="mt-1.5 font-semibold text-amber-800 dark:text-amber-100">
                Fix on VPS: <code>sudo ufw allow 40000:40100/udp</code>
              </p>
            </div>
          )}

          {/* Server Config Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
              <span className="text-[10px] uppercase font-bold text-slate-400">Announced IP</span>
              <p className="mt-1 font-mono text-xs font-semibold">{serverHealth?.announcedIp || 'Loading...'}</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
              <span className="text-[10px] uppercase font-bold text-slate-400">RTC Ports</span>
              <p className="mt-1 font-mono text-xs font-semibold">
                {serverHealth ? `${serverHealth.rtcPorts.min} - ${serverHealth.rtcPorts.max}` : '...'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
              <span className="text-[10px] uppercase font-bold text-slate-400">SFU Workers</span>
              <p className="mt-1 font-mono text-xs font-semibold">{serverHealth?.workers ?? 1} Core(s)</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
              <span className="text-[10px] uppercase font-bold text-slate-400">Active Rooms</span>
              <p className="mt-1 font-mono text-xs font-semibold">{serverHealth?.rooms?.length ?? 0}</p>
            </div>
          </div>

          {/* Room Live Peers & Transport Traces */}
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 p-3.5 dark:bg-white/[0.02]">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold">Active Peers & Transports in Room</span>
              <button
                type="button"
                onClick={fetchHealth}
                disabled={loading}
                className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {(!serverHealth?.rooms || serverHealth.rooms.length === 0) && (
              <p className="text-xs text-slate-400">No active rooms on this server.</p>
            )}

            {serverHealth?.rooms?.map((room) => (
              <div key={room.roomName} className="space-y-2">
                {room.peers.map((peer) => {
                  // A peer has two transports and usually only one of them is
                  // carrying media — a viewer has no send transport, a pure
                  // publisher has no recv transport. Reporting ICE/DTLS/RTT
                  // from whichever transport happens to be listed first shows
                  // "new / new" for a peer that is streaming perfectly.
                  const active =
                    peer.recvTransport?.iceSelectedTuple
                      ? peer.recvTransport
                      : peer.sendTransport?.iceSelectedTuple
                        ? peer.sendTransport
                        : (peer.recvTransport ?? peer.sendTransport);
                  return (
                  <div
                    key={peer.peerId}
                    className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-white/10 dark:bg-ink-950"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold">{peer.name}</span>
                        <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-mono dark:bg-white/10">
                          {peer.role}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <TransportBadge label="Send" t={peer.sendTransport} />
                        <TransportBadge label="Recv" t={peer.recvTransport} />
                        <span className="text-[10px] text-slate-400">
                          {peer.producers.length} pub / {peer.consumers.length} sub
                        </span>
                      </div>
                    </div>

                    {/* ICE / DTLS / bandwidth detail — the numbers that actually
                        explain a lagging or frozen tile.

                        Direction is the single most misread thing here. These
                        transports live on the SFU, so their counters are named
                        from the *server's* point of view:

                          sendTransport.recvBitrate  = what the peer uploaded
                          recvTransport.sendBitrate  = what the peer downloaded

                        Reading `sendTransport.sendBitrate` as "up" reports the
                        RTCP trickle (~5 kbps) instead of the actual video, which
                        makes a perfectly healthy 1 Mbps publisher look dead. */}
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[10px] dark:border-white/5 sm:grid-cols-4">
                      <div>
                        <span className="text-slate-400">ICE</span>
                        <p className="font-mono font-semibold">{active?.iceState ?? '—'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">DTLS</span>
                        <p className="font-mono font-semibold">{active?.dtlsState ?? '—'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">RTT</span>
                        <p className="font-mono font-semibold">{fmtRtt(active?.roundTripTime)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Up / Down</span>
                        <p className="font-mono font-semibold">
                          {fmtBitrate(peer.sendTransport?.recvBitrate)} /{' '}
                          {fmtBitrate(peer.recvTransport?.sendBitrate)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Up capacity</span>
                        <p className="font-mono font-semibold">
                          {fmtBitrate(peer.sendTransport?.availableOutgoingBitrate)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Down capacity</span>
                        <p className="font-mono font-semibold">
                          {fmtBitrate(peer.recvTransport?.availableIncomingBitrate)}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400">Selected pair</span>
                        <p className="truncate font-mono font-semibold">
                          {(() => {
                            const t = active?.iceSelectedTuple;
                            if (!t) return 'none';
                            return `${t.localIp}:${t.localPort} → ${t.remoteIp}:${t.remotePort}`;
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Quick Fix / Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleRequestKeyframes}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow transition hover:bg-brand-500 active:scale-95"
            >
              <span>🔄</span>
              <span>{resyncSuccess ? 'Keyframe Requested!' : 'Unfreeze / Resync Video Streams'}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-ink-800 dark:text-slate-200"
            >
              <span>📋</span>
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Diagnostic Report'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Floating Health Pill for Header */
export function WebRtcHealthBadge({
  socket,
  onClick,
}: {
  socket: React.RefObject<Socket | null>;
  onClick: () => void;
}) {
  const [status, setStatus] = useState<'optimal' | 'warning' | 'checking'>('checking');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/health/webrtc`);
        const data = await res.json();
        if (data.isLoopbackWarning) {
          setStatus('warning');
          return;
        }
        const hasTcp = data.rooms?.some((r: any) =>
          r.peers.some((p: any) => p.sendTransport?.isTcpWarning || p.recvTransport?.isTcpWarning)
        );
        setStatus(hasTcp ? 'warning' : 'optimal');
      } catch {
        setStatus('warning');
      }
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      title="Click to view WebRTC Diagnostics & Health"
      className={`chip py-1 text-[10px] font-semibold transition active:scale-95 ${
        status === 'optimal'
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
          : status === 'warning'
            ? 'border-amber-500/30 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 animate-pulse'
            : 'border-white/10 bg-white/[0.04] text-slate-400'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === 'optimal' ? 'bg-emerald-400' : status === 'warning' ? 'bg-amber-400' : 'bg-slate-400'
        }`}
      />
      <span>{status === 'warning' ? 'WebRTC Warning' : 'WebRTC Live'}</span>
    </button>
  );
}

