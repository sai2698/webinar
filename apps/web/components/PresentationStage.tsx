'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { AnnotationStroke, PresentationState } from '@webinar/shared';
import { useRoomStore } from '@/store/roomStore';
import { useIsFullscreen } from '@/lib/useRoomUi';
import { VideoFilmstrip } from './VideoGrid';
import { getApiUrl } from '@/lib/api';

/**
 * The presentation stage.
 *
 * Renders an uploaded file natively — pdf.js for PDFs, pptx-preview for decks,
 * a plain <img> for pictures — instead of publishing a screen-share video
 * track. The difference matters: a screen share costs the SFU a video producer
 * and caps the audience at whatever resolution the consumer negotiated, while a
 * file is fetched once and drawn at the viewer's own resolution, so text stays
 * sharp at any zoom and the SFU carries nothing.
 *
 * Annotations live on a transparent canvas above the page. Strokes are stored
 * in normalised 0..1 coordinates so the same stroke lands in the same place on
 * a phone in portrait and a 4K projector.
 */

type Tool = 'pen' | 'highlighter' | 'eraser';

const PEN_COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#0f172a'];

/** Stroke width as a fraction of the page's shorter side. */
const PEN_WIDTH = 0.004;
const HIGHLIGHTER_WIDTH = 0.022;

interface PresentationStageProps {
  socket: React.RefObject<Socket | null>;
  isStaff: boolean;
  onToggleFullscreen?: () => void;
  onShareScreen?: () => void;
}

/* ── PDF rendering ─────────────────────────────────────────── */

/**
 * pdf.js is loaded lazily and only once.
 *
 * It is a ~1MB bundle and most rooms never present a PDF, so importing it at
 * module scope would tax every viewer of every webinar. The worker is served
 * from /public so it does not need to be bundled at all.
 */
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
      return mod;
    });
  }
  return pdfjsPromise;
}

function PdfPage({
  url,
  page,
  onPageCount,
}: {
  url: string;
  page: number;
  onPageCount?: (count: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /*
   * Held in a ref, not in the dependency array.
   *
   * `onPageCount` writes the page count back into the room store, which
   * replaces `presentation`, which gives the parent a new callback identity.
   * With the callback in the deps that is an infinite loop: every render tears
   * the document down, clears the canvas, and starts over — the page never
   * finishes painting and the spinner never goes away.
   */
  const onPageCountRef = useRef(onPageCount);
  onPageCountRef.current = onPageCount;

  /*
   * The canvas is rasterised at the box's pixel size, so it has to be redrawn
   * whenever that box changes. Without this the page keeps the dimensions it
   * was first painted at: shrink the window (or rotate a phone) and the bitmap
   * stays desktop-sized, spilling out of the deck and getting clipped.
   */
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((prev) =>
        Math.abs(prev.w - width) < 2 && Math.abs(prev.h - height) < 2
          ? prev
          : { w: width, h: height },
      );
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    // pdf.js keeps the parsed document alive between renders; tearing it down
    // on every page change would re-download and re-parse the whole file.
    let doc: import('pdfjs-dist').PDFDocumentProxy | null = null;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const pdfjs = await loadPdfjs();
        doc = await pdfjs.getDocument({
          url,
          /*
           * Without this, pdf.js refuses to synthesise the 14 standard PDF
           * fonts (Helvetica, Times, Courier…) and silently renders a blank
           * page for any document that relies on them — which is most decks
           * exported from Word or Google Docs. The .pfb files are copied into
           * /public/pdf/standard_fonts at build time.
           */
          standardFontDataUrl: '/pdf/standard_fonts/',
        }).promise;
        if (cancelled) return;

        onPageCountRef.current?.(doc.numPages);

        const target = Math.min(Math.max(1, page), doc.numPages);
        const pdfPage = await doc.getPage(target);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Render at the element's own pixel size so the page is sharp on a
        // high-DPI screen rather than upscaled from a fixed bitmap.
        const boxW = box.w || canvas.parentElement?.clientWidth || 960;
        const boxH = box.h || canvas.parentElement?.clientHeight || 540;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(boxW / base.width, boxH / base.height);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: scale * dpr });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not render this PDF');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [url, page, box.w, box.h]);

  return (
    <div className="relative grid h-full w-full place-items-center">
      <canvas ref={canvasRef} className="max-h-full max-w-full rounded-sm shadow-lg" />
      {loading && !error && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500 dark:border-white/20 dark:border-t-brand-400" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[11px] font-semibold text-brand-600 underline dark:text-brand-400"
            >
              Open the file directly
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── PPTX rendering ────────────────────────────────────────── */

/*
 * pptx-preview ships no public API for resizing, but the previewer exposes the
 * renderer that owns the scale. These are the two members we need; everything
 * else stays opaque so a library bump fails loudly here rather than silently
 * rendering at the wrong size.
 */
type PptxRenderer = {
  options?: { viewPort?: { width: number; height: number } };
  _calcScaleAndRenderPort?: () => void;
};

type PptxPreviewer = {
  renderSingleSlide: (i: number) => void;
  slideCount: number;
  currentIndex?: number;
  wrapper?: HTMLElement;
  htmlRender?: PptxRenderer;
  destroy: () => void;
};

function PptxView({
  url,
  page,
  onPageCount,
}: {
  url: string;
  page: number;
  onPageCount?: (count: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const previewerRef = useRef<PptxPreviewer | null>(null);
  // The downloaded bytes are kept so a resize can rebuild the previewer
  // without going back to the network.
  const bufferRef = useRef<ArrayBuffer | null>(null);
  // Size the current previewer was built for, so the resize effect can tell a
  // real change from the no-op pass that follows initialisation.
  const builtRef = useRef({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Same reason as PdfPage: the callback writes back into the store, so it
  // must not be a dependency or the deck re-downloads on every render.
  const onPageCountRef = useRef(onPageCount);
  onPageCountRef.current = onPageCount;

  /*
   * pptx-preview bakes the viewport into the wrapper at init time and derives
   * a fixed scale from it (`scale = viewPort.width / pptx.width`). Nothing
   * re-measures afterwards, so the deck keeps the pixel size it was first
   * rendered at — go fullscreen and the slide stays small in the corner.
   * Watching the host lets us re-scale in place instead.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((prev) =>
        Math.abs(prev.w - width) < 2 && Math.abs(prev.h - height) < 2
          ? prev
          : { w: width, h: height },
      );
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not download the deck (${res.status})`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        bufferRef.current = buffer;

        const host = hostRef.current;
        if (!host) return;

        // pptx-preview is CommonJS-ish and ships no ESM build, so it is pulled
        // in dynamically to keep it out of the initial bundle.
        const mod = await import('pptx-preview');
        const init = (mod as unknown as { init: typeof import('pptx-preview').init }).init;

        host.innerHTML = '';
        const boxW = host.clientWidth || 960;
        const boxH = host.clientHeight || 540;
        const previewer = init(host, { width: boxW, height: boxH, mode: 'slide' });
        await previewer.preview(buffer);
        if (cancelled) {
          previewer.destroy();
          return;
        }

        previewerRef.current = previewer as unknown as PptxPreviewer;
        builtRef.current = { w: boxW, h: boxH };
        onPageCountRef.current?.(previewer.slideCount);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not render this deck');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        previewerRef.current?.destroy();
      } catch {
        /* the library throws if it was never fully initialised */
      }
      previewerRef.current = null;
      bufferRef.current = null;
    };
  }, [url]);

  // Slide changes are a separate effect so moving pages does not re-download
  // and re-parse the whole deck.
  useEffect(() => {
    const previewer = previewerRef.current;
    if (!previewer || loading) return;
    const index = Math.min(Math.max(0, page - 1), Math.max(0, previewer.slideCount - 1));
    try {
      previewer.renderSingleSlide(index);
    } catch {
      /* out-of-range while the deck is still settling */
    }
  }, [page, loading]);

  /*
   * Re-scale when the stage changes size — fullscreen, window resize, phone
   * rotation. The parsed deck is reused, so this is instant; a full re-init
   * would re-download and re-parse the file on every resize tick.
   */
  useEffect(() => {
    const previewer = previewerRef.current;
    if (!previewer || loading) return;
    if (box.w < 2 || box.h < 2) return;
    if (
      Math.abs(builtRef.current.w - box.w) < 2 &&
      Math.abs(builtRef.current.h - box.h) < 2
    ) {
      return;
    }

    const render = previewer.htmlRender;
    if (render?.options && typeof render._calcScaleAndRenderPort === 'function') {
      render.options.viewPort = { width: box.w, height: box.h };
      render._calcScaleAndRenderPort();
      if (previewer.wrapper) {
        previewer.wrapper.style.width = `${box.w}px`;
        previewer.wrapper.style.height = `${box.h}px`;
      }
      builtRef.current = { w: box.w, h: box.h };
      try {
        previewer.renderSingleSlide(previewer.currentIndex ?? 0);
      } catch {
        /* the deck is mid-teardown */
      }
      return;
    }

    /*
     * Fallback for a future version that hides those internals: rebuild from
     * the bytes we already downloaded. Slower, but still correct.
     */
    const host = hostRef.current;
    const buffer = bufferRef.current;
    if (!host || !buffer) return;
    let cancelled = false;
    (async () => {
      try {
        previewer.destroy();
      } catch {
        /* never fully initialised */
      }
      previewerRef.current = null;
      host.innerHTML = '';
      const mod = await import('pptx-preview');
      const init = (mod as unknown as { init: typeof import('pptx-preview').init }).init;
      const next = init(host, { width: box.w, height: box.h, mode: 'slide' });
      await next.preview(buffer);
      if (cancelled) {
        next.destroy();
        return;
      }
      previewerRef.current = next as unknown as PptxPreviewer;
      builtRef.current = { w: box.w, h: box.h };
      onPageCountRef.current?.(next.slideCount);
    })();
    return () => {
      cancelled = true;
    };
  }, [box.w, box.h, loading]);

  return (
    <div className="relative h-full w-full">
      {/*
       * pptx-preview injects its own prev/next arrows and a page counter at
       * z-index 100 inside the host. They sit on top of our toolbar and eat
       * the clicks, so they are hidden — the stage toolbar already owns page
       * navigation and it is the one that broadcasts to every viewer.
       */}
      <div
        ref={hostRef}
        className="h-full w-full overflow-hidden [&_*]:!shadow-none [&_.pptx-preview-wrapper-next]:!hidden [&_.pptx-preview-wrapper-pagination]:!hidden"
      />
      {loading && !error && (
        <div className="absolute inset-0 grid place-items-center bg-white/60 dark:bg-ink-950/60">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500 dark:border-white/20 dark:border-t-brand-400" />
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Rendering slides…
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Legacy .ppt files cannot be previewed in the browser.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[11px] font-semibold text-brand-600 underline dark:text-brand-400"
            >
              Download instead
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoView({
  url,
  name,
  isStaff,
  presentation,
  emit,
}: {
  url: string;
  name: string;
  isStaff: boolean;
  presentation: PresentationState;
  emit: (event: string, payload?: unknown) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSyncingRef = useRef(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [muted, setMuted] = useState(false);

  // Sync for participants when presentation state changes
  useEffect(() => {
    if (isStaff) return;
    const video = videoRef.current;
    if (!video) return;

    const { videoPlaying, videoCurrentTime = 0, videoUpdatedAt = Date.now() } = presentation;
    const elapsed = videoPlaying ? Math.max(0, (Date.now() - videoUpdatedAt) / 1000) : 0;
    const targetTime = videoCurrentTime + elapsed;

    isSyncingRef.current = true;
    if (Math.abs(video.currentTime - targetTime) > 0.6) {
      video.currentTime = targetTime;
    }

    if (videoPlaying) {
      const p = video.play();
      if (p !== undefined) {
        p.catch(() => {
          // Autoplay policy prevented playback with sound. Mute and retry.
          video.muted = true;
          setMuted(true);
          setNeedsUnmute(true);
          video.play().catch(() => {});
        });
      }
    } else {
      video.pause();
    }

    const t = setTimeout(() => {
      isSyncingRef.current = false;
    }, 150);
    return () => clearTimeout(t);
  }, [presentation.videoPlaying, presentation.videoCurrentTime, presentation.videoUpdatedAt, isStaff]);

  // Periodic drift correction for participants while playing
  useEffect(() => {
    if (isStaff || !presentation.videoPlaying) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || isSyncingRef.current) return;
      const { videoCurrentTime = 0, videoUpdatedAt = Date.now() } = presentation;
      const elapsed = Math.max(0, (Date.now() - videoUpdatedAt) / 1000);
      const targetTime = videoCurrentTime + elapsed;
      if (Math.abs(video.currentTime - targetTime) > 1.5) {
        isSyncingRef.current = true;
        video.currentTime = targetTime;
        setTimeout(() => {
          isSyncingRef.current = false;
        }, 150);
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [isStaff, presentation.videoPlaying, presentation.videoCurrentTime, presentation.videoUpdatedAt]);

  const handleHostPlay = () => {
    if (!isStaff || isSyncingRef.current) return;
    const time = videoRef.current?.currentTime ?? 0;
    emit('presentationVideoAction', { action: 'play', currentTime: time });
  };

  const handleHostPause = () => {
    if (!isStaff || isSyncingRef.current) return;
    const time = videoRef.current?.currentTime ?? 0;
    emit('presentationVideoAction', { action: 'pause', currentTime: time });
  };

  const handleHostSeeked = () => {
    if (!isStaff || isSyncingRef.current) return;
    const time = videoRef.current?.currentTime ?? 0;
    emit('presentationVideoAction', { action: 'seek', currentTime: time });
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!isStaff) {
      const { videoPlaying, videoCurrentTime = 0, videoUpdatedAt = Date.now() } = presentation;
      const elapsed = videoPlaying ? Math.max(0, (Date.now() - videoUpdatedAt) / 1000) : 0;
      const targetTime = videoCurrentTime + elapsed;
      video.currentTime = targetTime;

      if (videoPlaying) {
        const p = video.play();
        if (p !== undefined) {
          p.catch(() => {
            video.muted = true;
            setMuted(true);
            setNeedsUnmute(true);
            video.play().catch(() => {});
          });
        }
      }
    }
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black/95 p-1 sm:p-2">
      <video
        ref={videoRef}
        key={url}
        src={url}
        title={name}
        controls={isStaff}
        playsInline
        preload="auto"
        onPlay={isStaff ? handleHostPlay : undefined}
        onPause={isStaff ? handleHostPause : undefined}
        onSeeked={isStaff ? handleHostSeeked : undefined}
        onLoadedMetadata={handleLoadedMetadata}
        className="max-h-full max-w-full rounded-lg shadow-2xl object-contain outline-none focus:outline-none"
      />

      {/* Floating unmute button for participants if browser blocked sound */}
      {!isStaff && needsUnmute && (
        <button
          type="button"
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.muted = false;
              setMuted(false);
              setNeedsUnmute(false);
            }
          }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-2xl ring-2 ring-white/30 transition hover:bg-brand-400 active:scale-95 animate-bounce"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Click to listen (unmute)
        </button>
      )}

      {/* Participant status & volume pill */}
      {!isStaff && (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-md bg-black/75 px-2.5 py-1 text-xs text-white/90 shadow-md backdrop-blur">
          <button
            type="button"
            onClick={() => {
              if (videoRef.current) {
                const next = !videoRef.current.muted;
                videoRef.current.muted = next;
                setMuted(next);
                if (!next) setNeedsUnmute(false);
              }
            }}
            className="flex items-center gap-1 hover:text-brand-300 transition"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span>{muted ? 'Muted' : 'Sound on'}</span>
          </button>
          <span className="text-white/40">|</span>
          <span className="text-[10px] text-slate-300">Controlled by host</span>
        </div>
      )}

      {/* Host indicator badge */}
      {isStaff && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-brand-300 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-mint-400 animate-pulse" />
          You control playback for everyone
        </div>
      )}
    </div>
  );
}

/* ── Browser / Website presentation ────────────────────────── */

const KNOWN_FRAME_BLOCKED = [
  'dribbble.com',
  'github.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'netflix.com',
  'amazon.com',
];

interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  icon: string;
}

const DEFAULT_BOOKMARKS: BookmarkItem[] = [
  { id: 'google', title: 'Google', url: '', icon: '🔍' },
  { id: 'dribbble', title: 'Dribbble', url: 'https://dribbble.com', icon: '🎨' },
  { id: 'wikipedia', title: 'Wikipedia', url: 'https://en.wikipedia.org', icon: '📖' },
  { id: 'github', title: 'GitHub', url: 'https://github.com', icon: '💻' },
  { id: 'hackernews', title: 'Hacker News', url: 'https://news.ycombinator.com', icon: '📰' },
  { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com', icon: '🎬' },
];


function getSearchQuery(u: string): string | null {
  if (!u) return null;
  if (u.startsWith('google-search://')) {
    return decodeURIComponent(u.slice('google-search://'.length));
  }
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host.startsWith('google.') || host.includes('.google.')) {
      const q = parsed.searchParams.get('q');
      if (q) return q;
    }
  } catch {}
  return null;
}

function isGoogleHomeOrBlank(u: string): boolean {
  if (!u || u === 'about:blank' || u === 'chrome://newtab') return true;
  if (getSearchQuery(u)) return false;
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if ((host.startsWith('google.') || host.includes('.google.')) && (!parsed.pathname || parsed.pathname === '/')) {
      return true;
    }
  } catch {
    const clean = u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    if (clean === 'google.com' || clean === 'google') return true;
  }
  return false;
}

function BrowserView({
  url,
  name,
  isStaff,
  emit,
  onShareScreen,
}: {
  url: string;
  name: string;
  isStaff: boolean;
  emit: (event: string, payload?: unknown) => void;
  onShareScreen?: () => void;
}) {
  const [inputUrl, setInputUrl] = useState(url || '');
  const [centerSearch, setCenterSearch] = useState('');
  const [iframeKey, setIframeKey] = useState(0);
  const [mode, setMode] = useState<'direct' | 'proxy'>('proxy');
  const [dismissNotice, setDismissNotice] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(DEFAULT_BOOKMARKS);
  const [zoom, setZoom] = useState(100);

  const ZOOM_STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
  const handleZoomIn = () => {
    setZoom((prev) => {
      const next = ZOOM_STEPS.find((s) => s > prev);
      return next ?? Math.min(250, prev + 25);
    });
  };
  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = [...ZOOM_STEPS].reverse().find((s) => s < prev);
      return next ?? Math.max(50, prev - 25);
    });
  };
  const handleZoomReset = () => {
    setZoom(100);
  };
  const [showAddBookmark, setShowAddBookmark] = useState(false);
  const [newBmTitle, setNewBmTitle] = useState('');
  const [newBmUrl, setNewBmUrl] = useState('');

  // Load custom bookmarks from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('webinar_browser_bookmarks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed.map((b: BookmarkItem) => {
            if (b.id === 'google' || b.url === 'https://www.google.com' || b.url === 'https://google.com') {
              return { ...b, url: '' };
            }
            return b;
          });
          setBookmarks(sanitized);
          return;
        }
      }
    } catch {}
  }, []);

  const saveBookmarks = (items: BookmarkItem[]) => {
    setBookmarks(items);
    try {
      localStorage.setItem('webinar_browser_bookmarks', JSON.stringify(items));
    } catch {}
  };

  const handleAddBookmarkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let u = newBmUrl.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const t = newBmTitle.trim() || u.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const updated = [...bookmarks, { id: 'bm-' + Date.now(), title: t, url: u, icon: '⭐' }];
    saveBookmarks(updated);
    setShowAddBookmark(false);
    setNewBmTitle('');
    setNewBmUrl('');
  };

  const handleDeleteBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = bookmarks.filter((b) => b.id !== id);
    saveBookmarks(updated);
  };

  useEffect(() => {
    setInputUrl(isGoogleHomeOrBlank(url) ? '' : url);
    setDismissNotice(false);
  }, [url]);

  const isKnownBlocked = useMemo(() => {
    if (!url) return false;
    try {
      const host = new URL(url).hostname.toLowerCase();
      return KNOWN_FRAME_BLOCKED.some((d) => host.includes(d));
    } catch {
      return false;
    }
  }, [url]);

  const navigateTo = (raw: string) => {
    const q = raw.trim();
    if (!q || isGoogleHomeOrBlank(q)) {
      emit('presentationUrl', { url: '' });
      return;
    }
    let target = q;
    if (/^https?:\/\//i.test(q)) {
      target = q;
    } else if (!q.includes(' ') && /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(q)) {
      target = 'https://' + q;
    } else {
      // Search query on Google — present search results right on stage!
      target = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    }
    emit('presentationUrl', { url: target });
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(inputUrl);
  };

  const handleCenterSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!centerSearch.trim()) return;
    navigateTo(centerSearch);
    setCenterSearch('');
  };

  const handleReload = () => {
    setIframeKey((k) => k + 1);
  };

  const handleGoHome = () => {
    emit('presentationUrl', { url: '' });
  };

  const searchQuery = getSearchQuery(url);
  const isSearch = Boolean(searchQuery);
  const isNewTab = !isSearch && isGoogleHomeOrBlank(url);

  const [searchResults, setSearchResults] = useState<
    Array<{ title: string; url: string; snippet: string; displayUrl: string }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);
    fetch(`${getApiUrl()}/api/proxy-site/search?q=${encodeURIComponent(searchQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSearchResults(data.results || []);
        setSearchLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setSearchError(err instanceof Error ? err.message : 'Search failed');
        setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === 'webinar_browser_navigate' && e.data.url) {
        if (isStaff) {
          navigateTo(e.data.url);
        }
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [isStaff]);

  const iframeSrc = mode === 'proxy' && url
    ? `${getApiUrl()}/api/proxy-site?url=${encodeURIComponent(url)}`
    : url;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-ink-950">
      {/* ── Top Chrome Omnibox / Address bar ── */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-slate-100/90 px-2.5 py-1.5 backdrop-blur dark:border-white/10 dark:bg-ink-900/90">
        {/* Home / New Tab button */}
        <button
          type="button"
          onClick={handleGoHome}
          title="New Tab / Google Search"
          className={`grid h-7 w-7 place-items-center rounded-md transition active:scale-95 ${
            isNewTab
              ? 'bg-slate-200 text-slate-900 dark:bg-white/15 dark:text-white'
              : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10'
          }`}
          aria-label="New Tab"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="9 22 9 12 15 12 15 22" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Reload button */}
        {!isNewTab && (
          <button
            type="button"
            onClick={handleReload}
            title="Reload website"
            className="grid h-7 w-7 place-items-center rounded-md text-slate-600 transition hover:bg-slate-200 active:scale-95 dark:text-slate-300 dark:hover:bg-white/10"
            aria-label="Reload website"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Mode toggle (Direct vs Unblock Proxy) */}
        {!isNewTab && (
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'direct' ? 'proxy' : 'direct'))}
            title={mode === 'proxy' ? 'Using Unblock Proxy (strips X-Frame-Options)' : 'Direct mode (click to try proxy)'}
            className={`flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition active:scale-95 ${
              mode === 'proxy'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/40 dark:text-emerald-300'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-300'
            }`}
          >
            <span>{mode === 'proxy' ? '🛡️ Proxy' : '⚡ Direct'}</span>
          </button>
        )}

        {/* Address bar input */}
        {isStaff ? (
          <form onSubmit={handleAddressSubmit} className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="relative flex min-w-0 flex-1 items-center">
              <span className="pointer-events-none absolute left-2.5 text-xs text-slate-400">
                {isNewTab ? '🔍' : '🌐'}
              </span>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Search Google or type a URL"
                className="h-7 w-full rounded-md border border-slate-300 bg-white pl-7 pr-2 text-xs text-slate-900 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              className="h-7 shrink-0 rounded-md bg-brand-600 px-2.5 text-xs font-semibold text-white transition hover:bg-brand-500 active:scale-95"
            >
              Go
            </button>
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-slate-200 bg-white/70 px-2.5 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
            <span className="text-xs">{isNewTab ? '🔍' : '🌐'}</span>
            <span className="truncate font-mono text-[11px]">{url || 'Chrome New Tab'}</span>
          </div>
        )}

        {/* Open tab button */}
        {!isNewTab && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new window"
            className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 active:scale-95 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/10"
          >
            <span>Open tab</span>
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}

        {/* Zoom controls */}
        <div className="flex h-7 items-center gap-0.5 rounded-md border border-slate-300 bg-white px-1 dark:border-white/15 dark:bg-white/[0.06]">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            title="Zoom out"
            className="grid h-5 w-5 place-items-center rounded text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={handleZoomReset}
            title="Click to reset zoom to 100%"
            className="min-w-[36px] px-1 text-center font-mono text-[10px] font-semibold text-slate-700 transition hover:text-brand-600 dark:text-slate-200 dark:hover:text-brand-300"
          >
            {zoom}%
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 250}
            title="Zoom in"
            className="grid h-5 w-5 place-items-center rounded text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* ── Chrome Bookmarks Bar ── */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200/80 bg-slate-50/90 px-2 py-1 text-xs backdrop-blur scrollbar-none dark:border-white/10 dark:bg-ink-900/50">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
          ⭐ Bookmarks:
        </span>
        {bookmarks.map((bm) => (
          <div
            key={bm.id}
            className="group relative flex items-center rounded-md border border-transparent px-2 py-0.5 transition hover:border-slate-300 hover:bg-white dark:hover:border-white/10 dark:hover:bg-white/[0.06]"
          >
            <button
              type="button"
              onClick={() => {
                const target = (bm.id === 'google' || bm.url === 'https://www.google.com' || bm.url === 'https://google.com') ? '' : bm.url;
                if (isStaff) emit('presentationUrl', { url: target });
                else if (target) window.open(target, '_blank');
              }}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-200"
              title={bm.url || 'Google / New Tab'}
            >
              <span>{bm.icon}</span>
              <span className="truncate max-w-[100px]">{bm.title}</span>
            </button>
            {isStaff && bm.id.startsWith('bm-') && (
              <button
                type="button"
                onClick={(e) => handleDeleteBookmark(bm.id, e)}
                title="Remove bookmark"
                className="ml-1 hidden text-slate-400 hover:text-red-500 group-hover:inline-block"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {isStaff && (
          <button
            type="button"
            onClick={() => {
              setNewBmUrl(url && !isNewTab ? url : '');
              setNewBmTitle(name && !isNewTab ? name : '');
              setShowAddBookmark(true);
            }}
            title="Add bookmark"
            className="flex h-5 items-center gap-0.5 rounded px-1.5 text-[10px] font-semibold text-brand-600 hover:bg-brand-500/10 dark:text-brand-300"
          >
            <span>+</span> Add
          </button>
        )}
      </div>

      {/* Add bookmark modal / inline card */}
      {showAddBookmark && isStaff && (
        <div className="border-b border-slate-200 bg-white p-2.5 dark:border-white/10 dark:bg-ink-900">
          <form onSubmit={handleAddBookmarkSubmit} className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">New Bookmark:</span>
            <input
              type="text"
              placeholder="Title (e.g. Dribbble)"
              value={newBmTitle}
              onChange={(e) => setNewBmTitle(e.target.value)}
              className="h-7 rounded border border-slate-300 px-2 text-xs outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/[0.05]"
            />
            <input
              type="text"
              placeholder="https://..."
              value={newBmUrl}
              onChange={(e) => setNewBmUrl(e.target.value)}
              required
              className="h-7 min-w-[200px] flex-1 rounded border border-slate-300 px-2 text-xs outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/[0.05]"
            />
            <button
              type="submit"
              className="h-7 rounded bg-brand-600 px-2.5 text-xs font-semibold text-white hover:bg-brand-500"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowAddBookmark(false)}
              className="h-7 rounded border border-slate-300 px-2 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Frame Restriction / X-Frame-Options notice */}
      {!isNewTab && isKnownBlocked && !dismissNotice && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <span className="text-base shrink-0">⚠️</span>
            <div>
              <span className="font-semibold">{name || 'This website'} restricts iframe embedding (X-Frame-Options: sameorigin).</span>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Major sites like Dribbble, Google, and GitHub block embedding for security. Open in a new tab or share your screen.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 active:scale-95"
            >
              <span>Open in Tab</span>
              <span>↗</span>
            </a>

            <button
              type="button"
              onClick={() => setDismissNotice(true)}
              className="grid h-5 w-5 place-items-center rounded text-amber-800 opacity-60 hover:opacity-100 dark:text-amber-200"
              title="Dismiss warning"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Main Content Area: Chrome Google Search or Embedded Website ── */}
      <div className="relative flex-1 bg-white overflow-hidden">
        {isNewTab ? (
          /* Chrome New Tab Page with Google Search & Bookmarks */
          <div className="flex h-full w-full flex-col items-center justify-center p-6 bg-slate-50 dark:bg-ink-950 overflow-y-auto">
            {/* Google Wordmark Logo */}
            <div className="mb-6 flex items-center select-none text-4xl sm:text-5xl font-bold tracking-tight">
              <span className="text-blue-500">G</span>
              <span className="text-red-500">o</span>
              <span className="text-amber-500">o</span>
              <span className="text-blue-500">g</span>
              <span className="text-green-500">l</span>
              <span className="text-red-500">e</span>
            </div>

            {/* Google Search Box */}
            <div className="w-full max-w-xl mb-7">
              {isStaff ? (
                <form onSubmit={handleCenterSearchSubmit} className="relative flex items-center">
                  <span className="pointer-events-none absolute left-4 text-slate-400 text-sm">🔍</span>
                  <input
                    type="text"
                    value={centerSearch}
                    onChange={(e) => setCenterSearch(e.target.value)}
                    placeholder="Search Google or type a URL"
                    className="h-12 w-full rounded-full border border-slate-200 bg-white pl-11 pr-24 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-ink-900 dark:text-slate-100"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="absolute right-2 rounded-full bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-brand-500 active:scale-95"
                  >
                    Search
                  </button>
                </form>
              ) : (
                <div className="flex h-12 w-full items-center rounded-full border border-slate-200 bg-white/80 px-4 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-ink-900/80 dark:text-slate-400">
                  <span className="mr-2.5">🔍</span>
                  <span>Host will search Google or open a bookmark</span>
                </div>
              )}
            </div>

            {/* Quick Shortcuts / Bookmarks Grid */}
            <div className="w-full max-w-xl">
              <div className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Bookmarks & Shortcuts
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                {bookmarks.map((bm) => (
                  <button
                    key={bm.id}
                    type="button"
                    onClick={() => {
                      const target = (bm.id === 'google' || bm.url === 'https://www.google.com' || bm.url === 'https://google.com') ? '' : bm.url;
                      if (isStaff) emit('presentationUrl', { url: target });
                      else if (target) window.open(target, '_blank');
                    }}
                    className="group flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200/80 bg-white shadow-sm transition hover:border-brand-500/40 hover:shadow-md hover:-translate-y-0.5 active:scale-95 dark:border-white/10 dark:bg-ink-900"
                    title={bm.url || 'Google / New Tab'}
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl group-hover:bg-brand-500/10 transition dark:bg-white/[0.05]">
                      {bm.icon}
                    </span>
                    <span className="mt-2 text-xs font-medium text-slate-700 truncate max-w-[80px] dark:text-slate-300">
                      {bm.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : isSearch ? (
          /* Chrome Google Search Results Page right on stage */
          <div className="flex h-full w-full flex-col bg-white dark:bg-ink-950 overflow-y-auto">
            {/* Google Search sub-header */}
            <div className="border-b border-slate-200/80 bg-slate-50/70 px-4 sm:px-8 py-3 dark:border-white/10 dark:bg-ink-900/50">
              <div className="flex flex-wrap items-center gap-3">
                {/* Google Mini Logo */}
                <button
                  type="button"
                  onClick={handleGoHome}
                  className="flex items-center text-xl font-bold tracking-tight select-none"
                  title="Google Home"
                >
                  <span className="text-blue-500">G</span>
                  <span className="text-red-500">o</span>
                  <span className="text-amber-500">o</span>
                  <span className="text-blue-500">g</span>
                  <span className="text-green-500">l</span>
                  <span className="text-red-500">e</span>
                </button>

                {/* Search Bar */}
                {isStaff ? (
                  <form onSubmit={handleCenterSearchSubmit} className="relative flex flex-1 max-w-xl items-center">
                    <input
                      type="text"
                      value={centerSearch}
                      onChange={(e) => setCenterSearch(e.target.value)}
                      placeholder="Search Google or type a URL"
                      className="h-9 w-full rounded-full border border-slate-300 bg-white pl-4 pr-20 text-xs text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-white/15 dark:bg-ink-900 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      className="absolute right-1.5 h-6 rounded-full bg-brand-600 px-3 text-[11px] font-semibold text-white shadow-sm hover:bg-brand-500"
                    >
                      Search
                    </button>
                  </form>
                ) : (
                  <div className="flex h-9 flex-1 max-w-xl items-center rounded-full border border-slate-200 bg-white/70 px-4 text-xs text-slate-600 dark:border-white/10 dark:bg-ink-900/70 dark:text-slate-300">
                    <span className="mr-2">🔍</span>
                    <span className="truncate">{searchQuery}</span>
                  </div>
                )}
              </div>

              {/* Search Category Tabs */}
              <div className="mt-2.5 flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="border-b-2 border-brand-600 pb-1 font-semibold text-brand-600 dark:border-brand-400 dark:text-brand-400">
                  All
                </span>
                <span className="pb-1 text-slate-400 hover:text-slate-600 cursor-pointer">Images</span>
                <span className="pb-1 text-slate-400 hover:text-slate-600 cursor-pointer">News</span>
                <span className="pb-1 text-slate-400 hover:text-slate-600 cursor-pointer">Videos</span>
              </div>
            </div>

            {/* Results container */}
            <div className="flex-1 p-4 sm:p-8 max-w-3xl">
              <div className="mb-4 text-[11px] text-slate-400 dark:text-slate-500">
                {searchLoading
                  ? 'Searching Google...'
                  : `About ${searchResults.length} results for "${searchQuery}"`}
              </div>

              {searchLoading && (
                <div className="space-y-5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse space-y-2">
                      <div className="h-3 w-40 rounded bg-slate-200 dark:bg-white/10" />
                      <div className="h-5 w-72 rounded bg-slate-200 dark:bg-white/10" />
                      <div className="h-3 w-full rounded bg-slate-200 dark:bg-white/10" />
                    </div>
                  ))}
                </div>
              )}

              {!searchLoading && searchError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400">
                  <p className="font-semibold">Search could not be completed</p>
                  <p className="mt-1">{searchError}</p>
                </div>
              )}

              {!searchLoading && !searchError && searchResults.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-500">
                  No results found for <span className="font-semibold text-slate-700 dark:text-slate-200">"{searchQuery}"</span>. Try typing a direct website URL (e.g. dribbble.com).
                </div>
              )}

              {!searchLoading && searchResults.length > 0 && (
                <div className="space-y-6">
                  {searchResults.map((res, idx) => (
                    <div key={idx} className="group">
                      {/* URL line */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        <span className="text-xs">🌐</span>
                        <span className="font-mono truncate">{res.displayUrl}</span>
                      </div>

                      {/* Title Link */}
                      <div className="mt-0.5">
                        {isStaff ? (
                          <button
                            type="button"
                            onClick={() => navigateTo(res.url)}
                            className="text-left text-base sm:text-lg font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {res.title}
                          </button>
                        ) : (
                          <span className="text-base sm:text-lg font-medium text-blue-600 dark:text-blue-400">
                            {res.title}
                          </span>
                        )}
                      </div>

                      {/* Snippet */}
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {res.snippet}
                      </p>

                      {/* Action buttons */}
                      <div className="mt-2 flex items-center gap-2">
                        {isStaff && (
                          <button
                            type="button"
                            onClick={() => navigateTo(res.url)}
                            className="inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300"
                          >
                            <span>Present this website</span>
                            <span>➔</span>
                          </button>
                        )}
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <span>Open in Tab</span>
                          <span>↗</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Live Embedded Website or Fallback Card */
          <>
            {/* Background fallback card visible if iframe refuses to display */}
            {isKnownBlocked && mode === 'direct' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-ink-950 pointer-events-none">
                <span className="text-4xl mb-3">🌐</span>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {name || 'Website'} set X-Frame-Options to SAMEORIGIN
                </h3>
                <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  The browser prevented displaying {url} inside a frame because of the website’s security policy.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 pointer-events-auto">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-500"
                  >
                    Open {name || 'Website'} in New Window ↗
                  </a>
                  {isStaff && onShareScreen && (
                    <button
                      type="button"
                      onClick={onShareScreen}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200"
                    >
                      Share Window via Screen Share 🖥️
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="relative h-full w-full overflow-hidden">
              <iframe
                key={`${iframeKey}-${mode}`}
                src={iframeSrc}
                title={name || 'Website'}
                className="relative z-10 border-0"
                style={{
                  width: `${100 * (100 / zoom)}%`,
                  height: `${100 * (100 / zoom)}%`,
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: '0 0',
                }}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Annotation canvas ─────────────────────────────────────── */

function AnnotationLayer({
  strokes,
  tool,
  color,
  page,
  enabled,
  onCommit,
  onErase,
}: {
  strokes: AnnotationStroke[];
  tool: Tool;
  color: string;
  page: number;
  enabled: boolean;
  onCommit: (stroke: AnnotationStroke) => void;
  onErase: (ids: string[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<AnnotationStroke | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Track the canvas box so the bitmap matches its CSS size at device DPR.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const measure = () => {
      const rect = parent.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const pageStrokes = useMemo(() => strokes.filter((s) => s.page === page), [strokes, page]);

  /** Repaints every stroke for the current page. */
  const redraw = useCallback(
    (extra?: AnnotationStroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas || size.w === 0 || size.h === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(size.w * dpr)) {
        canvas.width = Math.floor(size.w * dpr);
        canvas.height = Math.floor(size.h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);

      const all = extra ? [...pageStrokes, extra] : pageStrokes;
      const shortSide = Math.min(size.w, size.h);

      for (const stroke of all) {
        if (stroke.points.length < 4) continue;
        ctx.save();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(1, stroke.width * shortSide);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // A highlighter should tint what is underneath, not hide it.
        ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.35 : 1;
        ctx.globalCompositeOperation =
          stroke.tool === 'highlighter' ? 'multiply' : 'source-over';

        ctx.beginPath();
        ctx.moveTo(stroke.points[0] * size.w, stroke.points[1] * size.h);
        for (let i = 2; i < stroke.points.length; i += 2) {
          ctx.lineTo(stroke.points[i] * size.w, stroke.points[i + 1] * size.h);
        }
        ctx.stroke();
        ctx.restore();
      }
    },
    [pageStrokes, size]
  );

  useEffect(() => {
    redraw();
  }, [redraw]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return;
    const { x, y } = pointFromEvent(e);

    if (tool === 'eraser') {
      // Hit-test in normalised space against each stroke's polyline. A stroke
      // is "hit" when any segment passes within a few pixels of the pointer.
      const shortSide = Math.min(size.w, size.h);
      const threshold = 0.02;
      const hits = pageStrokes
        .filter((stroke) => {
          const w = Math.max(stroke.width, 0.008);
          for (let i = 0; i + 3 < stroke.points.length; i += 2) {
            const ax = stroke.points[i];
            const ay = stroke.points[i + 1];
            const bx = stroke.points[i + 2];
            const by = stroke.points[i + 3];
            const dx = bx - ax;
            const dy = by - ay;
            const lenSq = dx * dx + dy * dy;
            let t = lenSq === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            const px = ax + t * dx;
            const py = ay + t * dy;
            const dist = Math.hypot(x - px, y - py);
            if (dist < Math.max(threshold, w * 1.5)) return true;
          }
          return false;
        })
        .map((s) => s.id);
      if (hits.length) onErase(hits);
      void shortSide;
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = {
      id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: tool === 'highlighter' ? 'highlighter' : 'pen',
      color,
      width: tool === 'highlighter' ? HIGHLIGHTER_WIDTH : PEN_WIDTH,
      points: [x, y, x, y],
      page,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const current = drawingRef.current;
    if (!current) return;
    const { x, y } = pointFromEvent(e);
    current.points.push(x, y);
    redraw(current);
  };

  const finishStroke = () => {
    const current = drawingRef.current;
    drawingRef.current = null;
    if (!current) return;
    // A tap with no movement still deserves a dot.
    if (current.points.length < 4) current.points.push(current.points[0], current.points[1]);
    onCommit(current);
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      className={`absolute inset-0 h-full w-full touch-none ${
        enabled ? (tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair') : 'pointer-events-none'
      }`}
      style={{ width: size.w || '100%', height: size.h || '100%' }}
    />
  );
}

/* ── Stage ─────────────────────────────────────────────────── */

export function PresentationStage({ socket, isStaff, onToggleFullscreen, onShareScreen }: PresentationStageProps) {
  const presentation = useRoomStore((s) => s.presentation);
  const allowParticipantFullscreen = useRoomStore((s) => s.allowParticipantFullscreen);
  const isFullscreen = useIsFullscreen();
  const canFullscreen = isStaff || allowParticipantFullscreen;
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [annotating, setAnnotating] = useState(false);

  const emit = useCallback(
    (event: string, payload?: unknown) => {
      const s = socket.current;
      if (!s) return;
      if (payload === undefined) s.emit(event, () => {});
      else s.emit(event, payload, () => {});
    },
    [socket]
  );

  const reportPageCount = useCallback(
    (count: number) => {
      if (!presentation || !count || presentation.pageCount === count) return;
      // The server needs the count to clamp page navigation for everyone.
      useRoomStore.getState().set({
        presentation: { ...presentation, pageCount: count },
      });
      const s = socket.current;
      if (s && isStaff) {
        s.emit('presentationStart', {
          attachmentId: presentation.attachmentId,
          name: presentation.name,
          url: presentation.url,
          kind: presentation.kind,
          pageCount: count,
        });
      }
    },
    [presentation, socket, isStaff]
  );

  const commitStroke = useCallback(
    (stroke: AnnotationStroke) => {
      emit('presentationAnnotate', { action: 'add', strokes: [stroke] });
    },
    [emit]
  );

  const eraseStrokes = useCallback(
    (ids: string[]) => {
      emit('presentationAnnotate', { action: 'remove', removeIds: ids });
    },
    [emit]
  );

  if (!presentation) return null;

  const { url, kind, page, pageCount, name } = presentation;
  const canGoPrev = page > 1;
  const canGoNext = pageCount === 0 || page < pageCount;

  return (
    <div
      className={`flex h-full w-full overflow-hidden ${
        /*
         * Fullscreen mirrors the screen-share fullscreen layout: the deck owns
         * the viewport and the cameras stack down the right-hand rail. Outside
         * fullscreen the cameras sit in a strip above the deck instead.
         */
        isFullscreen
          ? 'flex-row gap-2 bg-slate-900 p-2 dark:bg-ink-950'
          : 'flex-col gap-1.5 sm:gap-2'
      }`}
    >
      {/*
       * Camera strip above the deck, mirroring the screen-share layout exactly:
       * same component, same tile size, same gap. A host presenting a file is
       * still in a meeting — losing sight of everyone's faces the moment a PDF
       * goes up is the one thing screen sharing got right.
       */}
      {!isFullscreen && <VideoFilmstrip />}

      {/*
       * The deck takes whatever height the stage column offers. It must not be
       * content-sized: the page canvas has an explicit pixel height, so a
       * content-sized box would grow to fit the bitmap and push the toolbar
       * off-screen. min-h-0 lets flex actually shrink it.
       */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-slate-100 ring-1 ring-inset ring-slate-200 dark:bg-ink-950 dark:ring-white/10">
        {/* ── page surface ── */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-white dark:bg-ink-900">
          <div className="absolute inset-0 grid place-items-center p-2 sm:p-3">
            {/*
             * min-h-0 + overflow-hidden are load-bearing: without them this
             * wrapper is content-sized, so the canvas (whose height is set in
             * px by the renderer) stretches it past the deck and the page
             * spills out of the rounded box on mobile.
             */}
            <div className="relative h-full w-full min-h-0 overflow-hidden">
              {kind === 'pdf' && (
                <PdfPage url={url} page={page} onPageCount={reportPageCount} />
              )}
              {kind === 'pptx' && (
                <PptxView url={url} page={page} onPageCount={reportPageCount} />
              )}
              {kind === 'image' && (
                <div className="grid h-full w-full place-items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={name}
                    className="max-h-full max-w-full rounded-sm object-contain shadow-lg"
                  />
                </div>
              )}
              {kind === 'video' && (
                <VideoView
                  url={url}
                  name={name}
                  isStaff={isStaff}
                  presentation={presentation}
                  emit={emit}
                />
              )}
              {kind === 'browser' && (
                <BrowserView
                  url={url}
                  name={name}
                  isStaff={isStaff}
                  emit={emit}
                  onShareScreen={onShareScreen}
                />
              )}

              <AnnotationLayer
                strokes={presentation.annotations}
                tool={tool}
                color={color}
                page={page}
                enabled={isStaff && annotating}
                onCommit={commitStroke}
                onErase={eraseStrokes}
              />
            </div>
          </div>
        </div>

        {/* ── staff toolbar ── */}
        {isStaff && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur dark:border-white/10 dark:bg-ink-900/95">
            <span className="mr-1 hidden max-w-[140px] truncate text-[11px] font-semibold tracking-tight text-slate-700 sm:inline-block dark:text-slate-200">
              {name}
            </span>

            {/* page navigation (for multi-page decks / PDFs) */}
            {kind !== 'video' && kind !== 'image' && kind !== 'browser' && (
              <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
                <button
                  type="button"
                  onClick={() => emit('presentationPage', { page: page - 1 })}
                  disabled={!canGoPrev}
                  className="grid h-6 w-6 place-items-center rounded text-slate-600 transition hover:bg-white disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"
                  aria-label="Previous page"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className="min-w-[38px] text-center text-[10px] font-semibold tabular-nums text-slate-600 sm:min-w-[46px] dark:text-slate-300">
                  {page}
                  {pageCount > 0 ? ` / ${pageCount}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => emit('presentationPage', { page: page + 1 })}
                  disabled={!canGoNext}
                  className="grid h-6 w-6 place-items-center rounded text-slate-600 transition hover:bg-white disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"
                  aria-label="Next page"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            )}
            {kind === 'video' && (
              <span className="rounded-md border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300">
                🎬 Video
              </span>
            )}
            {kind === 'image' && (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                🖼️ Image
              </span>
            )}
            {kind === 'browser' && (
              <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-300">
                🌐 Browser
              </span>
            )}

            <div className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-white/10" />

            <button
              type="button"
              onClick={() => setAnnotating((v) => !v)}
              aria-pressed={annotating}
              title={annotating ? 'Turn annotation off' : 'Turn annotation on'}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                annotating
                  ? 'border-brand-500/40 bg-brand-500/10 text-brand-600 dark:border-brand-400/40 dark:bg-brand-400/10 dark:text-brand-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 19l7-7 3 3-7 7-3-3z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {annotating ? 'Annotating' : 'Annotate'}
            </button>

            {/* tool picker */}
            <div className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
              {(
                [
                  ['pen', 'Pen', 'M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z'],
                  ['highlighter', 'Highlighter', 'M9 11l-6 6v3h3l6-6 M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
                  ['eraser', 'Eraser', 'M20 20H7L3 16a2 2 0 0 1 0-2.8l9-9a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L11 20'],
                ] as [Tool, string, string][]
              ).map(([value, label, path]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setTool(value);
                    setAnnotating(true);
                  }}
                  title={label}
                  aria-label={label}
                  aria-pressed={annotating && tool === value}
                  className={`grid h-6 w-6 place-items-center rounded transition ${
                    annotating && tool === value
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/10'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>

            {/* colours */}
            {tool !== 'eraser' && (
              <div className="hidden items-center gap-1 sm:flex">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setColor(c);
                      setAnnotating(true);
                    }}
                    aria-label={`Colour ${c}`}
                    className={`h-4 w-4 rounded-full ring-1 ring-inset ring-black/10 transition dark:ring-white/20 ${
                      color === c ? 'scale-110 ring-2 ring-brand-500' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => emit('presentationAnnotate', { action: 'clear', page })}
              className="hidden rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:inline-block dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-white"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={() => emit('presentationStop')}
              className="ml-auto rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
            >
              <span className="hidden sm:inline">Stop presenting</span>
              <span className="sm:hidden">Stop</span>
            </button>

            {onToggleFullscreen && canFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="grid h-6 w-6 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-white"
                aria-label="Toggle fullscreen"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                  {isFullscreen ? (
                    <path
                      d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <path
                      d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Floating participant overlays (no control bar) */}
        {!isStaff && pageCount > 1 && kind !== 'video' && kind !== 'image' && kind !== 'browser' && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white/90 shadow-md backdrop-blur">
            {page} / {pageCount}
          </div>
        )}

        {!isStaff && onToggleFullscreen && canFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="absolute bottom-3 right-3 z-20 grid h-7 w-7 place-items-center rounded-md border border-slate-200 dark:border-white/20 bg-white/90 dark:bg-black/70 text-slate-800 dark:text-white shadow-lg backdrop-blur-md transition hover:bg-white dark:hover:bg-black/90 active:scale-95"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              {isFullscreen ? (
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        )}
      </div>

      {/* Right-hand camera rail, fullscreen only — same as a shared screen. */}
      {isFullscreen && <VideoFilmstrip vertical />}
    </div>
  );
}
