import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ChatMessagePayload, TimelineEvent, TimelineInput } from '@webinar/shared';
import { prisma } from '../db/prisma.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('recorder');

/** Where finished recordings land. Served statically by the API server. */
export const RECORDINGS_DIR = path.resolve(process.cwd(), 'recordings');

/**
 * Captures a session so it can be replayed later.
 *
 * Two independent things are recorded, and they are deliberately decoupled:
 *
 * 1. **The timeline** — every chat message, quiz, offer and hand raise, stamped
 *    with milliseconds since the recording started. This is pure data, always
 *    available, and is what makes the replay feel live: the quiz pops up at the
 *    same moment it did in the real session.
 *
 * 2. **The media** — an MP4/WebM of the host's screen & camera, captured either
 *    via SFU RTP + FFmpeg, or via client-side upload from the host's browser.
 *    Replay plays this video in sync with the timeline.
 */
export class Recorder {
  readonly webinarId: string;
  readonly startedAt = Date.now();

  private timeline: TimelineEvent[] = [];
  private chat: ChatMessagePayload[] = [];
  private stopped = false;

  private ffmpeg: ChildProcess | null = null;
  private mediaPath: string | null = null;
  private mediaKind: 'none' | 'video' = 'none';
  private mediaError: string | null = null;

  /** The DB row, created lazily so `start()` stays synchronous. */
  private rowId: string | null = null;
  private rowReady: Promise<string> | null = null;

  constructor(webinarId: string) {
    this.webinarId = webinarId;
  }

  get isRecording(): boolean {
    return !this.stopped;
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  get eventCount(): number {
    return this.timeline.length;
  }

  /** Milliseconds since the recording started — the clock every event uses. */
  private now(): number {
    return Date.now() - this.startedAt;
  }

  /* ── timeline capture ────────────────────────────────────── */

  /**
   * Appends an event. Chat is also mirrored into its own array so the replay
   * page can render the chat panel without scanning the whole timeline on
   * every animation frame.
   */
  record(event: TimelineInput): void {
    if (this.stopped) return;
    const entry = { ...event, t: event.t ?? this.now() } as TimelineEvent;
    this.timeline.push(entry);
    if (entry.type === 'chat') this.chat.push(entry.message);
  }

  /* ── media capture ───────────────────────────────────────── */

  /**
   * Starts an FFmpeg process that writes the given RTP stream to an MP4.
   *
   * The caller supplies the SDP containing PlainTransport ports and codecs.
   */
  async startMedia(sdp: string, port?: number): Promise<boolean> {
    if (this.stopped) return false;

    // If an existing FFmpeg process was active (e.g. switching presenter or source), stop it cleanly
    if (this.ffmpeg) {
      try {
        this.ffmpeg.kill('SIGINT');
      } catch {
        // ignore
      }
      this.ffmpeg = null;
    }

    try {
      await mkdir(RECORDINGS_DIR, { recursive: true });
    } catch (err) {
      this.mediaError = `Could not create recordings directory: ${message(err)}`;
      log.warn(this.mediaError);
      return false;
    }

    const file = path.join(RECORDINGS_DIR, `${this.webinarId}-${this.startedAt}.mp4`);
    const sdpFile = path.join(RECORDINGS_DIR, `${this.webinarId}-${this.startedAt}.sdp`);

    try {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(sdpFile, sdp, 'utf8');
    } catch (err) {
      this.mediaError = `Could not write SDP: ${message(err)}`;
      log.warn(this.mediaError);
      return false;
    }

    // `-re` is deliberately absent: the input is a live RTP feed, so FFmpeg
    // should consume it as fast as it arrives rather than pacing it.
    // Use optional stream mapping (`-map 0:v?`, `-map 0:a?`) so FFmpeg succeeds
    // whether the stream is video-only, audio-only, or dual-track.
    const args = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-protocol_whitelist', 'file,udp,rtp',
      '-i', sdpFile,
      '-map', '0:v?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-pix_fmt', 'yuv420p',
      '-map', '0:a?',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', file,
    ];

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      let child: ChildProcess;
      try {
        child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      } catch (err) {
        this.mediaError = `FFmpeg is not available: ${message(err)}`;
        log.warn(this.mediaError);
        return done(false);
      }

      this.ffmpeg = child;
      this.mediaPath = file;
      this.mediaKind = 'video';

      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-2000);
      });

      child.on('error', (err) => {
        this.mediaError = `FFmpeg failed to start: ${message(err)}`;
        this.mediaKind = 'none';
        this.mediaPath = null;
        log.warn(this.mediaError);
        done(false);
      });

      child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          this.mediaError = `FFmpeg exited with code ${code}: ${stderr.trim().slice(-400)}`;
          log.warn(this.mediaError);
        }
        this.ffmpeg = null;
        done(code === 0 || code === null);
      });

      // Give FFmpeg a moment to verify startup
      setTimeout(() => done(true), 1200);
    });
  }

  /* ── persistence ─────────────────────────────────────────── */

  private ensureRow(): Promise<string> {
    if (this.rowId) return Promise.resolve(this.rowId);
    if (this.rowReady) return this.rowReady;

    this.rowReady = prisma.recording
      .create({
        data: {
          webinarId: this.webinarId,
          status: 'RECORDING',
          startedAt: new Date(this.startedAt),
        },
      })
      .then((row) => {
        this.rowId = row.id;
        return row.id;
      });

    return this.rowReady;
  }

  /** Creates the DB row up front so the admin list shows a live recording. */
  async begin(): Promise<string> {
    return this.ensureRow();
  }

  /**
   * Stops capture and writes everything to the database.
   *
   * Returns the row id and final duration. Safe to call twice — the second
   * call returns the same result rather than creating a second row.
   */
  async stop(): Promise<{ recordingId: string; durationMs: number }> {
    const durationMs = this.elapsedMs;
    this.stopped = true;

    // Ask FFmpeg to finish the file cleanly. SIGINT makes it flush the moov
    // atom; SIGKILL would leave an unplayable MP4.
    if (this.ffmpeg) {
      try {
        this.ffmpeg.kill('SIGINT');
      } catch {
        // ignore
      }
      this.ffmpeg = null;
    }

    const id = await this.ensureRow();

    let mediaBytes: number | null = null;
    if (this.mediaPath) {
      // FFmpeg needs a moment to finalise the container after SIGINT.
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const info = await stat(this.mediaPath);
        mediaBytes = info.size;
        if (info.size < 1024) {
          // A few hundred bytes is an empty container — FFmpeg got no frames.
          await unlink(this.mediaPath).catch(() => undefined);
          this.mediaPath = null;
          this.mediaKind = 'none';
          mediaBytes = null;
          this.mediaError ??= 'No media frames were captured by FFmpeg';
        }
      } catch {
        this.mediaPath = null;
        this.mediaKind = 'none';
      }
    }

    // Check if a client upload already stored media or if this was recorded by FFmpeg
    const existing = await prisma.recording.findUnique({
      where: { id },
      select: { mediaPath: true, mediaKind: true, mediaBytes: true },
    });

    const finalPath = existing?.mediaPath ?? this.mediaPath;
    const finalKind = (existing?.mediaKind === 'video' || this.mediaKind === 'video') ? 'video' : 'none';
    const finalBytes = existing?.mediaBytes ?? mediaBytes;

    await prisma.recording
      .update({
        where: { id },
        data: {
          status: 'READY',
          endedAt: new Date(),
          durationMs,
          timelineJson: JSON.stringify(this.timeline),
          chatJson: JSON.stringify(this.chat),
          mediaPath: finalPath,
          mediaBytes: finalBytes,
          mediaKind: finalKind,
          error: finalPath ? null : this.mediaError,
        },
      })
      .catch((err) => log.error('Could not save recording', err));

    log.info(
      `Recording ${id} finished — ${this.timeline.length} events, ${durationMs}ms, media=${finalKind}`
    );

    return { recordingId: id, durationMs };
  }

  /**
   * Marks the row FAILED when the room dies mid-recording. Without this a
   * crashed session would leave a row stuck in RECORDING forever.
   */
  async abort(reason: string): Promise<void> {
    this.stopped = true;
    if (this.ffmpeg) {
      try {
        this.ffmpeg.kill('SIGKILL');
      } catch {
        // ignore
      }
      this.ffmpeg = null;
    }
    if (!this.rowId && !this.rowReady) return;
    try {
      const id = await this.ensureRow();
      await prisma.recording.update({
        where: { id },
        data: {
          status: 'FAILED',
          endedAt: new Date(),
          durationMs: this.elapsedMs,
          timelineJson: JSON.stringify(this.timeline),
          chatJson: JSON.stringify(this.chat),
          error: reason,
        },
      });
    } catch (err) {
      log.warn('Could not mark recording as failed', err);
    }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
