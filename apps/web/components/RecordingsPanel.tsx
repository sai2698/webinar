'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { RecordingSummary } from '@webinar/shared';
import { endpoints } from '@/lib/api';
import { Button, Badge, EmptyState } from '@/components/ui';
import { IconDisc, IconPlay } from '@/components/admin/icons';

export function RecordingsPanel({
  webinarId,
  slug,
  premiereRecordingId,
  premiereStartedAt,
  onPremiereChange,
}: {
  webinarId: string;
  slug?: string;
  premiereRecordingId?: string | null;
  premiereStartedAt?: string | null;
  onPremiereChange?: () => void;
}) {
  const [rows, setRows] = useState<RecordingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await endpoints.recordings(webinarId);
      setRows(res.recordings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load recordings');
    } finally {
      setLoading(false);
    }
  }, [webinarId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    if (!window.confirm('Delete this recording permanently?')) return;
    setBusy('del-' + id);
    try {
      await endpoints.deleteRecording(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the recording');
    } finally {
      setBusy(null);
    }
  }

  async function premiere(action: 'attach' | 'detach' | 'start' | 'stop', id?: string) {
    setBusy(action + (id ?? ''));
    setError(null);
    try {
      if (action === 'attach' && id) await endpoints.attachPremiere(webinarId, id);
      else if (action === 'detach') await endpoints.detachPremiere(webinarId);
      else if (action === 'start') await endpoints.startPremiere(webinarId);
      else await endpoints.stopPremiere(webinarId);
      onPremiereChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update premiere');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={IconDisc}
          title="No Cloud Recordings Captured"
          description="Join the live room as host and click 'Start Recording' in Host Tools. Streams, audio tracks, and interactive events are archived automatically."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const isAttached = premiereRecordingId === r.id;
            const isPlaying = isAttached && Boolean(premiereStartedAt);

            return (
              <div
                key={r.id}
                className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 shadow-sm transition hover:border-brand-500/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/20">
                    <IconDisc className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-bold text-fg">Recording {r.id.slice(0, 8)}</p>
                      <Badge size="sm" variant={r.status === 'READY' ? 'success' : 'warning'}>
                        {r.status}
                      </Badge>
                      {isAttached && (
                        <Badge size="sm" variant={isPlaying ? 'live' : 'brand'}>
                          {isPlaying ? 'PREMIERE ACTIVE' : 'ATTACHED PREMIERE'}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                      <span>{Math.round(r.durationMs / 60000)} minutes</span>
                      <span>•</span>
                      <span>{new Date(r.startedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isPlaying ? (
                    <Link
                      href={slug ? `/room/${slug}` : `/replay/${r.id}?live=1&startedAt=${new Date(premiereStartedAt!).getTime()}`}
                      target="_blank"
                    >
                      <Button size="xs" variant="primary">
                        <span className="relative mr-1.5 flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                        </span>
                        Join Live Premiere
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/replay/${r.id}`}>
                      <Button size="xs" variant="outline" leftIcon={<IconPlay className="h-3 w-3" />}>
                        Watch Replay
                      </Button>
                    </Link>
                  )}

                  {isAttached ? (
                    <>
                      {isPlaying ? (
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => premiere('stop')}
                          isLoading={busy === 'stop'}
                        >
                          Stop Premiere
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => premiere('start')}
                          isLoading={busy === 'start'}
                        >
                          Start Premiere
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => premiere('detach')}
                        isLoading={busy === 'detach'}
                      >
                        Detach
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => premiere('attach', r.id)}
                      isLoading={busy === 'attach' + r.id}
                    >
                      Set as Premiere
                    </Button>
                  )}

                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => remove(r.id)}
                    isLoading={busy === 'del-' + r.id}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
