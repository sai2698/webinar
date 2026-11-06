'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRoomStore } from '@/store/roomStore';
import { BACKGROUND_PRESETS, presetGradient, type VideoFit } from '@/lib/mediaPrefs';
import type { BackgroundImage, BackgroundMode } from '@/lib/backgroundEffects';

interface MediaSettingsPanelProps {
  onClose: () => void;
  /**
   * The control-bar button that opened this panel. The panel is portalled to
   * `document.body` and positioned from this element's rect, because every
   * ancestor between the control bar and the page root clips overflow — an
   * absolutely-positioned child would be cut off behind the video tile.
   */
  anchorEl?: HTMLElement | null;
  /** `image` selects a specific preset or upload; omit it to keep the current one. */
  onSetBackground: (mode: BackgroundMode, image?: BackgroundImage | null) => void;
  onUploadBackground: (file: File) => Promise<string | null>;
  onSetNoiseSuppression: (enabled: boolean) => void;
  onSetEchoCancellation: (enabled: boolean) => void;
  onSetAutoGainControl: (enabled: boolean) => void;
  onSetFrameRate: (fps: number) => void;
  onSetVideoFit: (fit: VideoFit) => void;
  onSetMirror: (mirror: boolean) => void;
}

const FIT_OPTIONS: { value: VideoFit; label: string }[] = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
  { value: 'fill', label: 'Fill' },
  { value: 'scale-down', label: 'Scale down' },
  { value: 'none', label: 'None' },
];

/** 15 fps is the honest floor for a talking head; 60 is rarely worth the CPU. */
const FRAME_RATES = [15, 24, 30, 60];

/**
 * The media settings sheet.
 *
 * Rendered as a portal-free fixed panel anchored to the control bar. It is
 * deliberately a single scrollable column rather than tabs: there are only
 * three groups, and a participant looking for "blur my background" should not
 * have to guess which tab it lives under.
 */
export function MediaSettingsPanel({
  onClose,
  anchorEl,
  onSetBackground,
  onUploadBackground,
  onSetNoiseSuppression,
  onSetEchoCancellation,
  onSetAutoGainControl,
  onSetFrameRate,
  onSetVideoFit,
  onSetMirror,
}: MediaSettingsPanelProps) {
  const backgroundMode = useRoomStore((s) => s.backgroundMode);
  const backgroundBusy = useRoomStore((s) => s.backgroundBusy);
  const backgroundError = useRoomStore((s) => s.backgroundError);
  const noiseSuppression = useRoomStore((s) => s.noiseSuppression);
  const echoCancellation = useRoomStore((s) => s.echoCancellation);
  const autoGainControl = useRoomStore((s) => s.autoGainControl);
  const frameRate = useRoomStore((s) => s.frameRate);
  const videoFit = useRoomStore((s) => s.videoFit);
  const mirror = useRoomStore((s) => s.mirror);
  const camOn = useRoomStore((s) => s.camOn);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  /**
   * The image the user last chose, kept locally so re-selecting "Image" after
   * switching to Blur does not force them through the picker again.
   */
  const [selectedImage, setSelectedImage] = useState<BackgroundImage | null>(null);
  /** True while the user is choosing an image but none is applied yet. */
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /** Fixed-position box derived from the anchor button, clamped to the viewport. */
  const [pos, setPos] = useState<{ left: number; bottom: number; width: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    function update() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(vw - 16, 416);
      let left = vw / 2 - width / 2;
      let bottom = 16;
      let maxHeight = vh - 32;
      const r = anchorEl?.getBoundingClientRect();
      // A zero-size rect means the trigger is hidden (e.g. the desktop control
      // bar below `lg`); fall back to a centred sheet rather than anchoring to
      // the top-left corner of the viewport.
      if (r && r.width > 0 && r.height > 0) {
        left = r.left + r.width / 2 - width / 2;
        bottom = Math.max(16, vh - r.top + 10);
        maxHeight = Math.max(220, r.top - 24);
      }
      left = Math.max(8, Math.min(left, vw - width - 8));
      setPos({ left, bottom, width, maxHeight });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorEl]);

  // Close on outside click or Escape, matching the device popover. The anchor
  // button is excluded so its own click can toggle the panel shut.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchorEl]);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploadError(null);
      setUploading(true);
      try {
        const error = await onUploadBackground(file);
        if (error) {
          setUploadError(error);
        } else {
          // The hook applied it, so the picker has done its job.
          setPickerOpen(false);
        }
      } finally {
        setUploading(false);
        // Reset so choosing the same file twice still fires a change event.
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [onUploadBackground]
  );

  const error = uploadError ?? backgroundError;

  if (typeof document === 'undefined' || !pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Media settings"
      style={{ left: pos.left, bottom: pos.bottom, width: pos.width }}
      className="fixed z-[60] animate-fade-up overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-ink-900 dark:ring-white/[0.04]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3.5 py-2.5 dark:border-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-500/15 text-brand-600 dark:text-brand-300">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="text-[12px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Media settings
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close media settings"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-[0.96] dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        className="scrollbar-thin space-y-4 overflow-y-auto p-3.5"
        style={{ maxHeight: Math.max(180, pos.maxHeight - 46) }}
      >
        {/* ── background ─────────────────────────────── */}
        <section>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Virtual background
          </p>

          {!camOn && (
            <p className="mb-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              Turn your camera on to use a background.
            </p>
          )}

          <div className="grid grid-cols-3 gap-1.5">
            {(['off', 'blur', 'image'] as BackgroundMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  // Choosing "Image" cannot apply anything on its own — there
                  // is no image yet. Open the picker instead of calling
                  // through, or the user hits "Choose a background image
                  // first" with no way to choose one.
                  if (mode === 'image' && !selectedImage) {
                    setPickerOpen(true);
                    return;
                  }
                  setPickerOpen(false);
                  onSetBackground(mode, mode === 'image' ? selectedImage : undefined);
                }}
                disabled={backgroundBusy || (!camOn && mode !== 'off')}
                aria-pressed={backgroundMode === mode}
                className={`rounded-md border px-2 py-2 text-[11px] font-semibold capitalize transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                  backgroundMode === mode
                    ? 'border-brand-500/40 bg-brand-500/15 text-brand-700 dark:text-brand-200'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-white'
                }`}
              >
                {mode === 'off' ? 'Off' : mode === 'blur' ? 'Blur' : 'Image'}
              </button>
            ))}
          </div>

          {backgroundBusy && (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-slate-300 border-t-brand-500 dark:border-white/20 dark:border-t-brand-400" />
              Applying…
            </p>
          )}

          {/* The picker shows while Image is active, and also as soon as the
              user asks for Image but has not picked one yet. */}
          {(backgroundMode === 'image' || pickerOpen) && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void handleFile(e.dataTransfer.files[0]);
                }}
                className={`mt-2 grid grid-cols-4 gap-1.5 rounded-md p-1 transition ${
                  dragging ? 'bg-brand-500/10 ring-2 ring-brand-400/50' : ''
                }`}
              >
                {BACKGROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      const image: BackgroundImage = { type: 'preset', src: preset.id };
                      setSelectedImage(image);
                      setPickerOpen(false);
                      onSetBackground('image', image);
                    }}
                    title={preset.label}
                    aria-label={preset.label}
                    className="aspect-video rounded-md border border-slate-200 transition hover:border-brand-400/60 hover:ring-2 hover:ring-brand-500/20 dark:border-white/10 dark:hover:border-white/30"
                    style={{ background: presetGradient(preset.id) ?? undefined }}
                  />
                ))}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.99] disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
                >
                  {uploading ? 'Uploading…' : 'Upload image'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
                PNG, JPEG, or WebP up to 10 MB. Processed in your browser — never uploaded.
              </p>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="mt-2 rounded-md border border-red-500/25 bg-red-500/[0.08] px-2 py-1.5 text-[10px] font-medium text-red-600 dark:text-red-300"
            >
              {error}
            </p>
          )}
        </section>

        <div className="h-px bg-slate-200/80 dark:bg-white/[0.07]" />

        {/* ── audio ──────────────────────────────────── */}
        <section>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Audio
          </p>
          <Toggle
            label="Noise cancellation"
            hint="Filters fans, hum, and keyboard noise"
            checked={noiseSuppression}
            onChange={onSetNoiseSuppression}
          />
          <Toggle
            label="Echo cancellation"
            hint="Stops your speakers feeding back into your mic"
            checked={echoCancellation}
            onChange={onSetEchoCancellation}
          />
          <Toggle
            label="Auto gain control"
            hint="Keeps your level steady as you move"
            checked={autoGainControl}
            onChange={onSetAutoGainControl}
          />
        </section>

        <div className="h-px bg-slate-200/80 dark:bg-white/[0.07]" />

        {/* ── video ──────────────────────────────────── */}
        <section>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Video
          </p>

          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400" htmlFor="video-fit">
            Fit
          </label>
          <select
            id="video-fit"
            value={videoFit}
            onChange={(e) => onSetVideoFit(e.target.value as VideoFit)}
            className="mb-2 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-800 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/15 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200"
          >
            {FIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <Toggle
            label="Mirror my video"
            hint="Only affects your own preview"
            checked={mirror}
            onChange={onSetMirror}
          />

          <label className="mb-1 mt-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400" htmlFor="video-fps">
            Frame rate
          </label>
          <select
            id="video-fps"
            value={frameRate}
            onChange={(e) => onSetFrameRate(Number(e.target.value))}
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-800 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/15 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200"
          >
            {FRAME_RATES.map((fps) => (
              <option key={fps} value={fps}>
                {fps} fps
              </option>
            ))}
          </select>
        </section>
      </div>
    </div>,
    document.body
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-white/[0.04]"
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-slate-800 dark:text-slate-200">{label}</span>
        {hint && <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500 dark:text-slate-500">{hint}</span>}
      </span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? 'bg-brand-500 shadow-[0_0_0_1px_rgba(99,102,241,0.35)]' : 'bg-slate-300 dark:bg-white/20'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all duration-200 ${
            checked ? 'left-3.5' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
