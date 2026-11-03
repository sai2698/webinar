'use client';

import { useEffect, useState, useRef } from 'react';
import { endpoints } from '@/lib/api';
import { Button, Input, Textarea, Switch } from '@/components/ui';

export interface WebinarFormValues {
  title: string;
  description: string;
  bannerUrl: string;
  startsAt: string;
  durationMins: number;
  timezone: string;
  allowMic: boolean;
  allowVideo: boolean;
  requireRegistration: boolean;
  requirePayment: boolean;
  priceInPaise: number;
  chatEnabled: boolean;
  handRaiseEnabled: boolean;
  maxParticipants: number;
  /** Empty string means "no passcode". */
  passcode: string;
  inviteOnly: boolean;
  requireSignIn: boolean;
  /** Park every new registration in PENDING until a host approves it. */
  requireApproval: boolean;
  /** Give participants a People tab. Staff always see it. */
  showPeopleTab: boolean;
  /** Give participants a Q&A tab. Staff always see it. */
  showQaTab: boolean;
  /** Give participants a Polls tab. Staff always see it. */
  showPollsTab: boolean;
  /**
   * Let the audience see and hear each other.
   * Off by default: a webinar is a broadcast.
   */
  showParticipantsToEachOther: boolean;
  /** Stamp each viewer's own name over the stage to trace leaked recordings. */
  watermarkEnabled: boolean;
  /** Show the live headcount to the audience, not just to staff. */
  showLiveUsersCount: boolean;
  /** Let a co-host start the session when the host has not arrived. */
  cohostStartWithoutHost: boolean;
}

export const emptyWebinar: WebinarFormValues = {
  title: '',
  description: '',
  bannerUrl: '',
  startsAt: '',
  durationMins: 60,
  timezone: 'Asia/Kolkata',
  allowMic: false,
  allowVideo: false,
  requireRegistration: true,
  requirePayment: false,
  priceInPaise: 0,
  chatEnabled: true,
  handRaiseEnabled: true,
  maxParticipants: 500,
  passcode: '',
  inviteOnly: false,
  requireSignIn: false,
  requireApproval: false,
  showPeopleTab: false,
  showQaTab: false,
  showPollsTab: false,
  showParticipantsToEachOther: false,
  watermarkEnabled: false,
  showLiveUsersCount: false,
  cohostStartWithoutHost: false,
};

function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function fromWebinar(w: {
  title: string;
  description?: string | null;
  bannerUrl?: string | null;
  startsAt: string;
  durationMins: number;
  timezone: string;
  settings?: Record<string, unknown> | null;
  priceInPaise?: number;
  maxParticipants?: number;
}): WebinarFormValues {
  const s = (w.settings ?? {}) as Record<string, unknown>;
  return {
    title: w.title,
    description: w.description ?? '',
    bannerUrl: w.bannerUrl ?? '',
    startsAt: toLocalInput(w.startsAt),
    durationMins: w.durationMins,
    timezone: w.timezone,
    allowMic: Boolean(s.allowMic),
    allowVideo: Boolean(s.allowVideo),
    requireRegistration: s.requireRegistration !== false,
    requirePayment: Boolean(s.requirePayment),
    priceInPaise: w.priceInPaise ?? 0,
    chatEnabled: s.chatEnabled !== false,
    handRaiseEnabled: s.handRaiseEnabled !== false,
    maxParticipants: w.maxParticipants ?? 500,
    passcode: '',
    inviteOnly: Boolean(s.inviteOnly),
    requireSignIn: Boolean(s.requireSignIn),
    requireApproval: Boolean(s.requireApproval),
    showPeopleTab: Boolean(s.showPeopleTab),
    showQaTab: Boolean(s.showQaTab),
    showPollsTab: Boolean(s.showPollsTab),
    showParticipantsToEachOther: Boolean(s.showParticipantsToEachOther),
    watermarkEnabled: Boolean(s.watermarkEnabled),
    showLiveUsersCount: Boolean(s.showLiveUsersCount),
    cohostStartWithoutHost: Boolean(s.cohostStartWithoutHost),
  };
}

interface Props {
  initial?: WebinarFormValues;
  submitLabel?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: WebinarFormValues) => void;
  onCancel?: () => void;
}

export function WebinarForm({
  initial = emptyWebinar,
  submitLabel = 'Save webinar',
  busy,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const [v, setV] = useState<WebinarFormValues>(initial);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerMode, setBannerMode] = useState<'upload' | 'url'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setV(initial);
    if (initial.bannerUrl) {
      if (initial.bannerUrl.startsWith('http') && !initial.bannerUrl.includes('/uploads/')) {
        setBannerMode('url');
      }
    }
  }, [initial]);

  function set<K extends keyof WebinarFormValues>(key: K, value: WebinarFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFileUpload(file: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setBannerError('Please select a valid image file (PNG, JPG, WebP, GIF)');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setBannerError('Image file is too large (max 15MB)');
      return;
    }

    setBannerError(null);
    setUploadingBanner(true);
    try {
      const res = await endpoints.uploadImage(file);
      if (res?.url) {
        set('bannerUrl', res.url);
      }
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingBanner(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(v);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Input
        label="Webinar Title"
        value={v.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="e.g. Live Product Teardown & Masterclass"
        required
      />

      <Textarea
        label="Description"
        value={v.description}
        onChange={(e) => set('description', e.target.value)}
        placeholder="What will viewers learn in this session?"
        rows={3}
      />

      {/* Banner Upload Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">
            Webinar Banner Image
          </label>
          <div className="flex items-center gap-1 rounded-xl bg-panel-2 p-1 border border-line">
            <button
              type="button"
              onClick={() => setBannerMode('upload')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                bannerMode === 'upload'
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Upload Image
            </button>
            <button
              type="button"
              onClick={() => setBannerMode('url')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                bannerMode === 'url'
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Image URL
            </button>
          </div>
        </div>

        {/* Live Banner Preview when an image is present */}
        {v.bannerUrl && (
          <div className="relative group overflow-hidden rounded-2xl border border-line bg-panel-2 aspect-[16/9] max-h-56 w-full shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={v.bannerUrl}
              alt="Webinar Banner Preview"
              className="h-full w-full object-cover"
              onError={() => setBannerError('Failed to load image preview.')}
            />
            <div className="absolute top-2.5 right-2.5 flex items-center gap-2 opacity-90 group-hover:opacity-100 transition">
              <Button
                type="button"
                size="xs"
                variant="primary"
                onClick={() => fileInputRef.current?.click()}
              >
                Change Image
              </Button>
              <Button
                type="button"
                size="xs"
                variant="danger"
                onClick={() => {
                  set('bannerUrl', '');
                  setBannerError(null);
                }}
              >
                Remove
              </Button>
            </div>
            <div className="absolute bottom-2.5 left-2.5 pointer-events-none">
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-black/70 text-white backdrop-blur-md">
                16:9 Banner Preview
              </span>
            </div>
          </div>
        )}

        {/* Upload Mode */}
        {bannerMode === 'upload' && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
            {!v.bannerUrl && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-2xl p-6 text-center transition flex flex-col items-center justify-center gap-2 ${
                  isDragging
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-line hover:border-brand-500/40 bg-panel-2/40'
                }`}
              >
                {uploadingBanner ? (
                  <div className="flex flex-col items-center gap-2 text-xs text-muted">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                    <span>Uploading banner image…</span>
                  </div>
                ) : (
                  <>
                    <div className="h-10 w-10 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center text-xl">
                      📷
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-fg">
                        Click to upload banner or drag and drop
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        PNG, JPG, WebP, GIF up to 15MB (recommended 1920×1080 / 16:9)
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* URL Mode */}
        {bannerMode === 'url' && (
          <Input
            value={v.bannerUrl}
            onChange={(e) => {
              set('bannerUrl', e.target.value);
              setBannerError(null);
            }}
            placeholder="https://images.unsplash.com/..."
            helperText="Paste a direct image link from Unsplash, Cloudinary, or any web host."
          />
        )}

        {bannerError && (
          <p className="text-xs text-red-500 font-semibold">{bannerError}</p>
        )}
      </div>

      {/* Date & Time Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          type="datetime-local"
          label="Starts at"
          value={v.startsAt}
          onChange={(e) => set('startsAt', e.target.value)}
          required
        />

        <Input
          type="number"
          label="Duration (minutes)"
          min={5}
          max={480}
          value={v.durationMins}
          onChange={(e) => set('durationMins', Number(e.target.value))}
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Timezone"
          value={v.timezone}
          onChange={(e) => set('timezone', e.target.value)}
          placeholder="Asia/Kolkata"
        />

        <Input
          type="number"
          label="Max participants"
          min={1}
          value={v.maxParticipants}
          onChange={(e) => set('maxParticipants', Number(e.target.value))}
        />
      </div>

      {/* Access & Media Controls */}
      <div className="rounded-2xl border border-line bg-panel-2/50 p-4 sm:p-5 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          Access & Media Settings
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Switch
            label="Allow audience mic"
            description="Approved speakers can unmute"
            checked={v.allowMic}
            onChange={(x) => set('allowMic', x)}
          />
          <Switch
            label="Allow audience camera"
            description="Approved speakers can share video"
            checked={v.allowVideo}
            onChange={(x) => set('allowVideo', x)}
          />
          <Switch
            label="Require registration"
            description="Collect attendee details"
            checked={v.requireRegistration}
            onChange={(x) => set('requireRegistration', x)}
          />
          <Switch
            label="Require payment"
            description="Paid webinar via Razorpay"
            checked={v.requirePayment}
            onChange={(x) => set('requirePayment', x)}
          />
          <Switch
            label="Chat enabled"
            description="Live audience chat feed"
            checked={v.chatEnabled}
            onChange={(x) => set('chatEnabled', x)}
          />
          <Switch
            label="Hand raise enabled"
            description="Audience can request to speak"
            checked={v.handRaiseEnabled}
            onChange={(x) => set('handRaiseEnabled', x)}
          />
        </div>

        {v.requirePayment && (
          <div className="pt-2">
            <Input
              type="number"
              label="Ticket Price (₹ INR)"
              min={0}
              value={v.priceInPaise / 100}
              onChange={(e) => set('priceInPaise', Math.round(Number(e.target.value) * 100))}
              placeholder="e.g. 499"
              helperText="Collected via native Razorpay in-stream overlay"
            />
          </div>
        )}
      </div>

      {/* Security & Access Controls */}
      <div className="rounded-2xl border border-line bg-panel-2/50 p-4 sm:p-5 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          Security & Privacy
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Switch
            label="Invite only"
            description="Only registered attendees may enter"
            checked={v.inviteOnly}
            onChange={(x) => set('inviteOnly', x)}
          />
          <Switch
            label="Require sign-in"
            description="Attendees must be signed in"
            checked={v.requireSignIn}
            onChange={(x) => set('requireSignIn', x)}
          />
          <Switch
            label="Require host approval"
            description="Park new signups in approval queue"
            checked={v.requireApproval}
            onChange={(x) => set('requireApproval', x)}
          />
          <Switch
            label="Watermark overlay"
            description="Stamp user identity to prevent leaks"
            checked={v.watermarkEnabled}
            onChange={(x) => set('watermarkEnabled', x)}
          />
          <Switch
            label="Show live viewer count"
            description="Display live audience count to viewers"
            checked={v.showLiveUsersCount}
            onChange={(x) => set('showLiveUsersCount', x)}
          />
          <Switch
            label="Allow co-host start"
            description="Co-hosts can start if host is delayed"
            checked={v.cohostStartWithoutHost}
            onChange={(x) => set('cohostStartWithoutHost', x)}
          />
        </div>

        <div className="pt-2">
          <Input
            label="Room Passcode (optional)"
            type="password"
            value={v.passcode}
            onChange={(e) => set('passcode', e.target.value)}
            placeholder="Leave empty for public access"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-500 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-line/60">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" isLoading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
