export interface StandardRegistrationField {
  enabled: boolean;
  label: string;
  placeholder?: string;
  required: boolean;
}

export interface RegistrationFieldsConfig {
  name: StandardRegistrationField;
  email: StandardRegistrationField;
  phone: StandardRegistrationField;
}

export const DEFAULT_REGISTRATION_FIELDS: RegistrationFieldsConfig = {
  name: {
    enabled: true,
    label: 'Full Name',
    placeholder: 'e.g. Ada Lovelace',
    required: true,
  },
  email: {
    enabled: true,
    label: 'Email Address',
    placeholder: 'you@company.com',
    required: true,
  },
  phone: {
    enabled: true,
    label: 'Mobile Number',
    placeholder: '+91 98765 43210',
    required: true,
  },
};

/**
 * Shared domain types used by both the API server and the Next.js client.
 * Keeping these in one place guarantees the socket event names and payload
 * shapes never drift between the two apps.
 */

export type Role = 'ADMIN' | 'HOST' | 'MODERATOR' | 'PARTICIPANT';

export type WebinarStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'ENDED';

export type PaymentStatus = 'CREATED' | 'PAID' | 'FAILED' | 'REFUNDED';

export const STAFF_ROLES: Role[] = ['ADMIN', 'HOST', 'MODERATOR'];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

/** Per-webinar admin-chosen options. */
export interface WebinarSettings {
  allowMic: boolean;
  allowVideo: boolean;
  requireRegistration: boolean;
  requirePayment: boolean;
  priceInPaise: number;
  currency: string;
  chatEnabled: boolean;
  handRaiseEnabled: boolean;
  maxParticipants: number | null;
  /** True when a passcode is set — the value itself is never sent to clients. */
  passcodeRequired: boolean;
  /** Only registered attendees may enter; no walk-ins. */
  inviteOnly: boolean;
  /** A signed-in account is required — guest join is disabled. */
  requireSignIn: boolean;
  /**
   * When set, the room plays this recording instead of hosting live media.
   * A pre-recorded webinar: the recording is the content, the schedule is the
   * event. Everyone's position is derived from `premiereStartedAt`, so the
   * audience watches together rather than each at their own pace.
   */
  premiereRecordingId: string | null;
  /** ISO timestamp of when the premiere clock started, or null if not started. */
  premiereStartedAt: string | null;
  /** A host must approve each registration before the attendee may enter. */
  requireApproval: boolean;
  /**
   * Whether participants get a People tab in the sidebar.
   *
   * Staff always see the roster — they need it to run the room. This governs
   * the audience only, and defaults to off so a broadcast does not expose the
   * attendee list to every viewer.
   */
  showPeopleTab: boolean;
  /** Whether participants get a Q&A tab. Staff always see it. */
  showQaTab: boolean;
  /**
   * Whether participants get a Polls tab. Staff always see it, and a launched
   * poll still reaches everyone as a modal — this only governs the sidebar.
   */
  showPollsTab: boolean;
  /**
   * Whether participants may see and hear each other.
   *
   * Off by default. A webinar is a broadcast: an attendee joining a product
   * demo does not expect their camera in every other attendee's grid. When on,
   * the SFU creates consumers between participants and the room behaves like a
   * meeting. Staff are mutually visible either way — this governs the audience
   * only.
   */
  showParticipantsToEachOther: boolean;
  /** Burn the viewer's identity over the video to deter recording leaks. */
  watermarkEnabled: boolean;
  /** Show the live viewer count to participants. */
  showLiveUsersCount: boolean;
  /** Whether a co-host may start the session before the owner joins. */
  cohostStartWithoutHost: boolean;
  /** WhatsApp Community or group invite URL shown to attendees */
  whatsappGroupUrl?: string | null;
  /** Whether to show mobile number input on the registration form */
  collectPhone?: boolean;
  /** Whether the mobile number input is mandatory */
  requirePhone?: boolean;
  /** Fully customizable registration fields configuration */
  registrationFields?: RegistrationFieldsConfig;
}

/* ── webinar.gg parity ─────────────────────────────────────── */

/** The 11 custom-field types webinar.gg supports. */
export type CustomFieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'time'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'multi-select';

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = [
  'text',
  'number',
  'email',
  'phone',
  'date',
  'time',
  'textarea',
  'checkbox',
  'radio',
  'select',
  'multi-select',
];

/** Types that carry a list of options. */
export const OPTION_FIELD_TYPES: CustomFieldType[] = ['radio', 'select', 'multi-select'];

export interface CustomFieldOption {
  id: string;
  label: string;
  value: string;
  order: number;
}

export interface CustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  isRequired: boolean;
  placeholder: string | null;
  defaultValue: unknown;
  order: number;
  options: CustomFieldOption[];
}

/** A registration's lifecycle. Always populated, even without approval. */
export type RegistrationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'WAITLISTED'
  | 'CANCELLED';

export const REGISTRATION_STATUSES: RegistrationStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WAITLISTED',
  'CANCELLED',
];

/** The 10 co-host permissions webinar.gg exposes. */
export interface CohostPermissions {
  chatModeration: boolean;
  qna: boolean;
  polls: boolean;
  usersControl: boolean;
  waitingRoom: boolean;
  startWebinar: boolean;
  endWebinar: boolean;
  screenshare: boolean;
  liveSettings: boolean;
  handraise: boolean;
}

/**
 * Everything is granted by default except starting and ending the session —
 * those are the two actions that change the state of the room for everyone,
 * and webinar.gg made the same choice in 2026-10-03.
 */
export const DEFAULT_COHOST_PERMISSIONS: CohostPermissions = {
  chatModeration: true,
  qna: true,
  polls: true,
  usersControl: true,
  waitingRoom: true,
  startWebinar: false,
  endWebinar: false,
  screenshare: true,
  liveSettings: true,
  handraise: true,
};

export const COHOST_PERMISSION_KEYS = Object.keys(
  DEFAULT_COHOST_PERMISSIONS
) as (keyof CohostPermissions)[];

export interface Cohost {
  id: string;
  email: string;
  userId: string | null;
  name: string | null;
  source: 'pre_webinar' | 'live';
  permissions: CohostPermissions;
  inviteSentAt: string | null;
  createdAt: string;
}

export type StreamPlatform = 'youtube' | 'twitch' | 'custom';

export const STREAM_PLATFORMS: StreamPlatform[] = ['youtube', 'twitch', 'custom'];

/** A stream destination as returned to a client — never carries the key. */
export interface StreamDestination {
  id: string;
  platform: StreamPlatform;
  /** Last 4 characters of the key, so two keys can be told apart. */
  keyHint: string;
  /** Custom servers only: the public host, e.g. `rtmp://live.example.com/app`. */
  rtmpHost: string | null;
  /** False once the webinar is live — the list is fixed for the session. */
  editable: boolean;
  createdAt: string;
}

export type SeriesFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export const SERIES_FREQUENCIES: SeriesFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

export interface WebinarSeries {
  id: string;
  baseWebinarId: string;
  frequency: SeriesFrequency;
  interval: number;
  byWeekday: number[];
  byMonthday: number | null;
  count: number | null;
  until: string | null;
  timezone: string;
  cancelledAt: string | null;
  createdAt: string;
}

/** The 14 webhook event names webinar.gg documents. */
export type WebhookEvent =
  | 'webinar.created'
  | 'webinar.updated'
  | 'webinar.started'
  | 'webinar.ended'
  | 'webinar.deleted'
  | 'webinar.user.invited'
  | 'webinar.user.uninvited'
  | 'webinar.slot.ended'
  | 'webinar.recording.created'
  | 'registration.created'
  | 'registration.approved'
  | 'registration.rejected'
  | 'registration.waitlisted'
  | 'registration.cancelled';

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'webinar.created',
  'webinar.updated',
  'webinar.started',
  'webinar.ended',
  'webinar.deleted',
  'webinar.user.invited',
  'webinar.user.uninvited',
  'webinar.slot.ended',
  'webinar.recording.created',
  'registration.created',
  'registration.approved',
  'registration.rejected',
  'registration.waitlisted',
  'registration.cancelled',
];

/** The envelope every webhook delivery carries. */
export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  /**
   * The subscribed events. `'*'` means every event, including ones added in a
   * future release — which is why it is a distinct value rather than a
   * pre-expanded list.
   */
  events: (WebhookEvent | '*')[];
  active: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  event: WebhookEvent;
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  attempts: number;
  lastError: string | null;
  lastStatus: number | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface ApiTokenSummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** The 5 analytics events webinar.gg fires. */
export type AnalyticsEvent =
  | 'ViewContent'
  | 'CompleteRegistration'
  | 'InitiateCheckout'
  | 'Purchase'
  | 'Join';

export const ANALYTICS_EVENTS: AnalyticsEvent[] = [
  'ViewContent',
  'CompleteRegistration',
  'InitiateCheckout',
  'Purchase',
  'Join',
];

export interface AnalyticsConfig {
  ga4MeasurementId: string | null;
  metaPixelId: string | null;
  clarityProjectId: string | null;
  gtmContainerId: string | null;
}

/** The outbound `postMessage` events an embedded room emits. */
export type EmbedOutboundEvent =
  | 'webinar-ended'
  | 'webinar-user-left'
  | 'webinar-user-kicked'
  | 'webinar-tab-duplicate'
  | 'fullscreen'
  | 'fullscreen_exit'
  | 'USER_INTERACTION';

/** The inbound commands an embedding page may send. */
export type EmbedInboundCommand = 'SET_VOLUME' | 'SET_DISABLED';

export interface EmbedConfig {
  enabled: boolean;
  /** Origins allowed to embed. `['*']` allows any. */
  allowedOrigins: string[];
}

/** One scheduled cue in an automation timeline. */
export interface AutomationCue {
  id: string;
  kind: 'poll' | 'offer';
  atMs: number;
  payload: Record<string, unknown>;
  enabled: boolean;
  firedAt: string | null;
}

/** A persona in an automation timeline — a simulated attendee. */
export interface AutomationPersona {
  id: string;
  name: string;
  email: string;
  /** Weighted behaviour: how likely this persona is to chat, ask, vote. */
  weights: { chat: number; qna: number; poll: number };
}

/** The portable automation bundle. Times are offsets, never wall-clock. */
export interface AutomationBundle {
  version: 1;
  personas: AutomationPersona[];
  /** Attendance curve: `{ atMs, count }` points, linearly interpolated. */
  attendance: { atMs: number; count: number }[];
  chat: { atMs: number; personaId: string; text: string }[];
  qna: { atMs: number; personaId: string; text: string }[];
  cues: { atMs: number; kind: 'poll' | 'offer'; payload: Record<string, unknown> }[];
}

export interface WebinarMetrics {
  totalUsers: number;
  maxLiveUsers: number;
  durationMinutes: number;
  timeSeries: { t: number; count: number }[];
  engagement: {
    chatMessages: number;
    questions: number;
    pollVotes: number;
    quizAnswers: number;
  };
  computedAt: string;
}

export interface QuizOption {
  id: string;
  text: string;
}

/** Quiz as sent to participants — never includes the correct answer. */
export interface PublicQuiz {
  id: string;
  question: string;
  options: QuizOption[];
  timeLimitSecs: number;
}

export interface QuizScorer {
  userId: string;
  name: string;
  /** Milliseconds between the quiz opening and this answer landing. */
  elapsedMs: number;
}

export interface QuizResults {
  quizId: string;
  question: string;
  correctOptionId: string | null;
  distribution: Record<string, number>;
  totalAnswers: number;
  correctCount: number;
  /**
   * Fastest correct answers, best first. Speed is the tie-breaker because
   * everyone who got it right scored the same — the leaderboard is about
   * who knew it, not who guessed last.
   */
  topScorers: QuizScorer[];
}

/**
 * A poll is a quiz with no right answer. It reuses `QuizOption` for its choices
 * so the UI can render both with the same component.
 */
export interface PublicPoll {
  id: string;
  question: string;
  options: QuizOption[];
  /** 0 means the poll stays open until the host closes it. */
  timeLimitSecs: number;
}

/** Live tally, broadcast on every vote so the room watches it move. */
export interface PollResults {
  pollId: string;
  question: string;
  options: QuizOption[];
  distribution: Record<string, number>;
  totalVotes: number;
  /** True once the host closes the poll — the UI stops accepting votes. */
  closed: boolean;
}

/**
 * One question on an offer's pre-payment form.
 *
 * The type vocabulary is deliberately small and closed: these are checkout
 * questions, not a survey builder. Every type here maps to a native input the
 * browser can validate on its own, which is what keeps the form usable on a
 * phone in the middle of a live session.
 */
export type CtaFormFieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'phone'
  | 'textarea'
  | 'select'
  | 'checkbox';

export const CTA_FORM_FIELD_TYPES: CtaFormFieldType[] = [
  'text',
  'number',
  'email',
  'phone',
  'textarea',
  'select',
  'checkbox',
];

export interface CtaFormFieldOption {
  label: string;
  value: string;
}

export interface CtaFormField {
  id: string;
  label: string;
  type: CtaFormFieldType;
  isRequired: boolean;
  placeholder: string | null;
  options: CtaFormFieldOption[];
  order: number;
}

/**
 * The form an offer shows before checkout.
 *
 * `null` on `CtaPayload` means the offer has no form and the button goes
 * straight to payment — the behaviour every existing offer already has.
 */
export interface CtaForm {
  intro: string | null;
  submitText: string;
  fields: CtaFormField[];
}

export interface CtaPayload {
  id: string;
  title: string;
  description: string | null;
  buttonText: string;
  priceInPaise: number;
  currency: string;
  externalUrl: string | null;
  /** How many distinct people have opened this offer. */
  clickCount: number;
  /** True when the viewer asking is one of them. */
  clickedByMe: boolean;
  /** Present only when the host configured a pre-payment form. */
  form: CtaForm | null;
  /** When true, participant clients automatically open the offer in expanded full view. */
  expanded?: boolean;
  expandedAt?: number;
}

/**
 * A question in the Q&A queue.
 *
 * Q&A is not chat: a chat line scrolls away, a question accumulates upvotes and
 * gets answered. `upvotedByMe` is per-viewer, so the same payload can be
 * broadcast to the whole room and each client still knows whether to render its
 * own vote as active.
 */
export interface QaQuestionPayload {
  id: string;
  userId: string;
  name: string;
  role: Role;
  text: string;
  upvotes: number;
  answered: boolean;
  pinned: boolean;
  /** Milliseconds since the session started, for the replay timeline. */
  ts: number;
  upvotedByMe: boolean;
}

/**
 * What a system line is *about*, so the chat can style it.
 *
 * A single grey pill for everything made the room's most encouraging moment —
 * somebody buying a seat — look identical to "Recording started". The kind lets
 * the client celebrate a sale without the server having to ship markup.
 */
export type ChatSystemKind = 'info' | 'enrollment';

export interface ChatMessagePayload {
  id: string;
  userId: string;
  name: string;
  role: Role;
  text: string;
  enrolled: boolean;
  ts: number;
  system?: boolean;
  /** Only meaningful when `system` is true. Defaults to `info`. */
  kind?: ChatSystemKind;
  /**
   * Who did the thing, and what they bought.
   *
   * Only set on `enrollment` lines. The chat card and the stage toast say the
   * same fact in different registers — "Congratulations! Tamanna for
   * Enrolling" in the feed, "Tamanna just enrolled in the course." over the
   * video — and neither can be derived from the other without string surgery.
   * Shipping the two nouns lets each surface phrase itself, and leaves `text`
   * as a plain fallback for anything that just prints the line.
   */
  actor?: string;
  subject?: string;
}

export interface HandRaiseEntry {
  userId: string;
  name: string;
  raisedAt: number;
}

/**
 * Where a producer's media comes from. `screen` is a video producer that
 * carries a display capture rather than a camera feed, which lets the UI
 * render it as a presentation instead of a participant tile.
 */
export type MediaSource = 'camera' | 'microphone' | 'screen';

/* ────────────────────────────────────────────────────────────
 * Attachments & native presentation
 * ──────────────────────────────────────────────────────────── */

/** Which viewer the client mounts for an uploaded file. */
export type AttachmentKind = 'pdf' | 'pptx' | 'image' | 'video' | 'browser' | 'whiteboard';

/** A file the host uploaded to present from inside the room. */
export interface AttachmentInfo {
  id: string;
  webinarId: string;
  name: string;
  url: string;
  kind: AttachmentKind;
  mimeType: string;
  bytes: number;
  /** PDF pages or slides; 0 when the client has not reported it yet. */
  pageCount: number;
  createdAt: string;
}

/**
 * One annotation stroke drawn over the presented file.
 *
 * Points are normalised to 0..1 against the rendered page, not stored in
 * pixels. The stage is a different size on every device — a phone in portrait,
 * a 4K projector, a small thumbnail in the filmstrip — so pixel coordinates
 * would land in the wrong place for everyone but the person who drew them.
 * Normalised points scale with whatever box the viewer renders into.
 */
export type AnnotationTool =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'rectangle'
  | 'circle'
  | 'arrow'
  | 'line'
  | 'text';

export interface AnnotationStroke {
  id: string;
  tool: AnnotationTool;
  /** CSS colour, e.g. `#f43f5e`. */
  color: string;
  /** Stroke width as a fraction of the page's shorter side, or world units for whiteboard. */
  width: number;
  /** Flat [x0, y0, x1, y1, ...] in 0..1 space (or world space for whiteboard). */
  points: number[];
  /** Page/slide this stroke belongs to, so strokes do not bleed across pages. */
  page: number;
  /** Text content for 'text' tool */
  text?: string;
  /** Fill color for closed shapes like rectangle/circle */
  fillColor?: string;
  /** Font size in pixels for text tool */
  fontSize?: number;
}

/**
 * What is currently on the presentation stage.
 *
 * `null` everywhere means "no presentation" and the stage falls back to the
 * normal video grid. This is deliberately separate from `spotlightedPeerId`:
 * a spotlight pins a *person*, a presentation shows a *file*, and the two can
 * be active at once (a host narrating over a deck).
 */
export interface PresentationState {
  attachmentId: string;
  name: string;
  url: string;
  kind: AttachmentKind;
  /** 1-based page/slide currently shown. */
  page: number;
  /** Total pages/slides, or 0 when not yet known. */
  pageCount: number;
  /** Strokes drawn so far, in draw order. */
  annotations: AnnotationStroke[];
  /** Peer that started the presentation, so the UI can attribute it. */
  startedBy: string | null;
  /** For video presentations: whether the video is playing */
  videoPlaying?: boolean;
  /** For video presentations: current playback time in seconds */
  videoCurrentTime?: number;
  /** For video presentations: timestamp (epoch ms) when current time was updated */
  videoUpdatedAt?: number;
  /** For whiteboard presentations: pan and zoom viewport */
  whiteboardViewport?: { panX: number; panY: number; zoom: number };
}

export interface PeerInfo {
  peerId: string;
  userId: string;
  name: string;
  role: Role;
  isApprovedSpeaker: boolean;
  producers: { producerId: string; kind: 'audio' | 'video'; source: MediaSource }[];
  /**
   * Whether this peer's microphone is currently live.
   *
   * A muted mic is not a closed producer — the track is still published, just
   * disabled — so the producer list alone cannot answer "is this person
   * audible?". The host needs that answer to know who to ask to unmute, so the
   * client reports it explicitly.
   */
  micOn: boolean;
  /** Whether this peer's camera is currently live. */
  camOn: boolean;
  canPublishAudio?: boolean;
  canPublishVideo?: boolean;
  canShareScreen?: boolean;
}

export interface RoomSnapshot {
  webinarId: string;
  slug: string;
  title: string;
  status: WebinarStatus;
  settings: WebinarSettings;
  self: PeerInfo;
  peers: PeerInfo[];
  viewerCount: number;
  hands: HandRaiseEntry[];
  activeQuiz: PublicQuiz | null;
  activePoll: PublicPoll | null;
  activeCta: CtaPayload | null;
  /** Open Q&A queue, newest first, so a late joiner sees what is being asked. */
  questions: QaQuestionPayload[];
  /** The peer the host has pinned to the big tile, if any. */
  spotlightedPeerId: string | null;
  /**
   * The file currently on the presentation stage, or `null`.
   *
   * Sent in the snapshot so a late joiner lands on the same slide the room is
   * already looking at, with the annotations that have been drawn on it.
   */
  presentation: PresentationState | null;
  /** Set when the host is recording, so late joiners see the REC indicator. */
  recording: boolean;
  /**
   * When the host opened the session, or `null` while it is still waiting.
   *
   * Participants are allowed into the room before the host starts, so the
   * client needs to distinguish "nobody is here yet" from "the session has
   * not begun" — the two look identical from the peer list alone.
   */
  startedAt: number | null;
  /**
   * Per-viewer watermark, or `null` when the host has not enabled one.
   *
   * Carries the viewer's own name and id so a leaked screen recording can be
   * traced back to the account that made it. Rendered by the client as an
   * overlay that cannot be dismissed.
   */
  watermark: { enabled: boolean; label: string; userId: string } | null;
  allowParticipantFullscreen?: boolean;
}

/* ────────────────────────────────────────────────────────────
 * Recording & replay
 * ──────────────────────────────────────────────────────────── */

export type RecordingStatus = 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED';

/**
 * One thing that happened during a session, stamped with milliseconds since
 * the recording started. Replaying the timeline in order reproduces the
 * session: chat appears when it was sent, a quiz pops up when it was launched,
 * an offer slides in when it was pushed.
 *
 * `t` is the only field every entry has. The rest depends on `type`, which is
 * why this is a discriminated union rather than a bag of optional fields —
 * the replay page can switch on `type` and get a fully typed payload.
 */
export type TimelineEvent =
  | { t: number; type: 'chat'; message: ChatMessagePayload }
  | { t: number; type: 'quizStarted'; quiz: PublicQuiz }
  | { t: number; type: 'quizResults'; results: QuizResults }
  | { t: number; type: 'quizClosed'; quizId: string }
  | { t: number; type: 'pollStarted'; poll: PublicPoll }
  | { t: number; type: 'pollResults'; results: PollResults }
  | { t: number; type: 'pollClosed'; pollId: string }
  | { t: number; type: 'qaAsked'; question: QaQuestionPayload }
  | { t: number; type: 'qaAnswered'; questionId: string }
  | { t: number; type: 'qaPinned'; questionId: string; pinned: boolean }
  | { t: number; type: 'ctaShown'; cta: CtaPayload }
  | { t: number; type: 'ctaHidden' }
  | { t: number; type: 'handRaised'; userId: string; name: string }
  | { t: number; type: 'handLowered'; userId: string }
  | { t: number; type: 'peerJoined'; name: string; role: Role }
  | { t: number; type: 'peerLeft'; name: string }
  | { t: number; type: 'system'; text: string }
  // ── Layout events — recorded server-side for replay layout engine ──
  | { t: number; type: 'screenShareStarted'; peerId: string; peerName: string; peerRole: Role }
  | { t: number; type: 'screenShareStopped'; peerId: string; peerName: string }
  | { t: number; type: 'spotlightChanged'; peerId: string | null; peerName: string | null }
  | { t: number; type: 'hostCamOn'; peerId: string; peerName: string }
  | { t: number; type: 'hostCamOff'; peerId: string; peerName: string }
  | { t: number; type: 'presenterChanged'; peerId: string; peerName: string; peerRole: Role }
  // ── Native presentation (uploaded files) ──
  | { t: number; type: 'presentationChanged'; presentation: PresentationState | null }
  | { t: number; type: 'presentationVideoAction'; action: 'play' | 'pause' | 'seek'; currentTime: number };

/**
 * `Omit` over a union collapses to the keys every member shares, which would
 * erase `message`, `quiz`, `cta` and the rest. Distributing the omit over each
 * member keeps the payload typed, so `recorder.record({ type: 'chat', ... })`
 * still requires a `message`.
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A timeline event before the recorder stamps it with an offset. */
export type TimelineInput = DistributiveOmit<TimelineEvent, 't'> & { t?: number };

export interface RecordingSummary {
  id: string;
  webinarId: string;
  status: RecordingStatus;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  mediaKind: 'none' | 'video';
  mediaBytes: number | null;
  /** Number of timeline entries — a cheap proxy for "is there anything to watch". */
  eventCount: number;
  error: string | null;
  hasCamMedia?: boolean;
}

export interface RecordingDetail extends RecordingSummary {
  timeline: TimelineEvent[];
  chat: ChatMessagePayload[];
  webinar: { slug: string; title: string } | null;
}

/* ────────────────────────────────────────────────────────────
 * Socket.IO event contracts
 * ──────────────────────────────────────────────────────────── */

export interface ClientToServerEvents {
  join: (
    payload: { slug: string; token?: string },
    ack: (res: JoinAck) => void
  ) => void;

  createTransport: (
    payload: { direction: 'send' | 'recv' },
    ack: (res: Ack<TransportParams>) => void
  ) => void;

  connectTransport: (
    payload: { transportId: string; dtlsParameters: unknown },
    ack: (res: Ack) => void
  ) => void;

  closeTransport: (
    payload: { direction: 'send' | 'recv'; transportId?: string },
    ack?: (res: Ack<{ closed: boolean }>) => void
  ) => void;

  produce: (
    payload: {
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: unknown;
      source?: MediaSource;
      appData?: Record<string, unknown>;
    },
    ack: (res: Ack<{ producerId: string }>) => void
  ) => void;

  consume: (
    payload: { producerId: string; rtpCapabilities: unknown },
    ack: (res: Ack<ConsumerParams>) => void
  ) => void;

  resumeConsumer: (
    payload: { consumerId: string },
    ack: (res: Ack) => void
  ) => void;

  /** Requests an immediate I-frame (keyframe) to unfreeze a stalled video stream. */
  requestKeyFrame: (
    payload: { consumerId: string },
    ack?: (res: Ack) => void
  ) => void;

  /**
   * Pins a consumer to one simulcast layer, or restores automatic selection
   * when `spatialLayer` is null. Layer choice is server-side in mediasoup 3.25+.
   */
  setPreferredLayers: (
    payload: { consumerId: string; spatialLayer: number | null },
    ack: (res: Ack) => void
  ) => void;

  closeProducer: (payload: { producerId: string }, ack: (res: Ack) => void) => void;

  setProducerPaused: (
    payload: { producerId: string; paused: boolean },
    ack: (res: Ack) => void
  ) => void;

  chatSend: (payload: { text: string }, ack: (res: Ack) => void) => void;
  /** Staff only — removes a message from the room and the database. */
  chatDelete: (payload: { id: string }, ack: (res: Ack) => void) => void;

  handRaise: (ack: (res: Ack) => void) => void;
  handLower: (ack: (res: Ack) => void) => void;
  handApprove: (payload: { userId: string }, ack: (res: Ack) => void) => void;
  handDeny: (payload: { userId: string }, ack: (res: Ack) => void) => void;

  quizLaunch: (payload: { quizId: string }, ack: (res: Ack) => void) => void;
  quizAnswer: (
    payload: { quizId: string; optionId: string },
    ack: (res: Ack<{ correct: boolean }>) => void
  ) => void;
  quizClose: (payload: { quizId: string }, ack: (res: Ack) => void) => void;

  /** Host/moderator only — opens a poll for the room. */
  pollLaunch: (payload: { pollId: string }, ack: (res: Ack) => void) => void;
  pollVote: (
    payload: { pollId: string; optionId: string },
    ack: (res: Ack<{ distribution: Record<string, number>; totalVotes: number }>) => void
  ) => void;
  pollClose: (payload: { pollId: string }, ack: (res: Ack) => void) => void;

  /** Any attendee — adds a question to the Q&A queue. */
  qaAsk: (payload: { text: string }, ack: (res: Ack<{ question: QaQuestionPayload }>) => void) => void;
  /** Any attendee — toggles their upvote on a question. */
  qaUpvote: (
    payload: { questionId: string },
    ack: (res: Ack<{ upvotes: number; upvoted: boolean }>) => void
  ) => void;
  /** Staff only — marks a question answered (or reopens it). */
  qaAnswer: (payload: { questionId: string; answered: boolean }, ack: (res: Ack) => void) => void;
  /** Staff only — pins a question to the top of the queue. */
  qaPin: (payload: { questionId: string; pinned: boolean }, ack: (res: Ack) => void) => void;
  /** Staff only — removes a question entirely. */
  qaDelete: (payload: { questionId: string }, ack: (res: Ack) => void) => void;

  /** Staff only — pins one peer to the large tile. `null` clears it. */
  spotlight: (payload: { peerId: string | null }, ack: (res: Ack) => void) => void;

  /**
   * Staff only — puts an uploaded file on the presentation stage.
   *
   * Unlike a screen share this publishes no media: the server just records
   * which file is showing and at which page, and every client fetches and
   * renders it locally. `null` clears the stage.
   */
  presentationStart: (
    payload: {
      attachmentId: string;
      name: string;
      url: string;
      kind: AttachmentKind;
      pageCount?: number;
    },
    ack: (res: Ack) => void
  ) => void;
  /** Staff only — takes the file off the stage. */
  presentationStop: (ack: (res: Ack) => void) => void;
  /** Staff only — moves everyone to a different page/slide. */
  presentationPage: (payload: { page: number }, ack: (res: Ack) => void) => void;
  /**
   * Staff only — adds or removes annotation strokes.
   *
   * `add` appends strokes, `remove` deletes specific strokes by id (the
   * eraser), `clear` wipes the current page, `clearAll` wipes every page.
   * Sending whole strokes rather than pointer deltas keeps the payload small
   * (a stroke is one message, not one per mouse move) and makes the state
   * trivially idempotent for late joiners.
   */
  presentationAnnotate: (
    payload: {
      action: 'add' | 'remove' | 'clear' | 'clearAll';
      strokes?: AnnotationStroke[];
      removeIds?: string[];
      page?: number;
    },
    ack: (res: Ack) => void
  ) => void;
  /** Staff only — controls video playback during video presentation. */
  presentationVideoAction: (
    payload: {
      action: 'play' | 'pause' | 'seek';
      currentTime: number;
    },
    ack?: (res: Ack) => void
  ) => void;
  /** Staff only — navigates to a new URL during a browser/website presentation. */
  presentationUrl: (payload: { url: string }, ack?: (res: Ack) => void) => void;
  /** Staff only — syncs infinite canvas whiteboard viewport (pan & zoom) to room. */
  whiteboardViewport: (payload: { panX: number; panY: number; zoom: number }, ack?: (res: Ack) => void) => void;
  /** Staff only — mutes every non-staff microphone at once. */
  muteAll: (ack: (res: Ack<{ muted: number }>) => void) => void;

  /**
   * Reports this peer's own mic/camera state so the host can see who is
   * audible and who is dark. Sent on every toggle, not just on join.
   */
  mediaState: (payload: { micOn: boolean; camOn: boolean }, ack: (res: Ack) => void) => void;

  /**
   * Staff only — asks one participant to turn their mic or camera on.
   *
   * A request, not a command: the server cannot reach into someone's hardware,
   * and silently enabling a stranger's camera would be indefensible. The
   * participant gets a prompt and decides.
   */
  mediaRequest: (
    payload: { userId: string; kind: 'mic' | 'cam' },
    ack: (res: Ack) => void
  ) => void;

  ctaShow: (payload: { ctaId: string; expand?: boolean }, ack: (res: Ack) => void) => void;
  ctaExpand: (payload: { expand?: boolean }, ack: (res: Ack) => void) => void;
  ctaHide: (ack: (res: Ack) => void) => void;

  /**
   * A participant opened the offer card.
   *
   * Sent on the click, before any form or checkout, because the host's
   * question is "how many people were interested" — not "how many bought".
   * The server dedupes by user, so a repeat click is harmless.
   */
  ctaClick: (
    payload: { ctaId: string; responses?: Record<string, unknown> },
    ack: (res: Ack<{ clickCount: number }>) => void
  ) => void;

  modMute: (payload: { userId: string }, ack: (res: Ack) => void) => void;
  modStopVideo: (payload: { userId: string }, ack: (res: Ack) => void) => void;
  modKick: (payload: { userId: string }, ack: (res: Ack) => void) => void;
  modSetRole: (
    payload: { userId: string; peerId?: string; role: 'MODERATOR' | 'PARTICIPANT' },
    ack: (res: Ack<{ role: Role }>) => void
  ) => void;
  modSetScreenShare: (
    payload: { userId: string; peerId?: string; enabled: boolean },
    ack: (res: Ack<{ canShareScreen: boolean }>) => void
  ) => void;

  /**
   * Host/admin only — opens the session.
   *
   * Participants may join before this is called; they sit in a waiting room
   * until it is. Starting is an explicit act so the host can get their camera
   * and slides ready without an audience watching them fumble.
   */
  webinarStart: (ack: (res: Ack<{ startedAt: number }>) => void) => void;

  /** Host/admin only — closes the webinar for everyone. */
  webinarEnd: (ack: (res: Ack) => void) => void;

  /** Host/admin only — starts capturing the session timeline. */
  recordingStart: (ack: (res: Ack<{ recordingId: string }>) => void) => void;
  /** Host/admin only — stops capture and finalises the recording. */
  recordingStop: (ack: (res: Ack<{ recordingId: string; durationMs: number }>) => void) => void;

  setParticipantFullscreen: (
    payload: { allowed: boolean },
    ack?: (res: Ack) => void
  ) => void;
  requestSnapshot: (ack: (res: Ack<RoomSnapshot>) => void) => void;
  updateRoomSettings: (
    payload: {
      showParticipantsToEachOther?: boolean;
      allowMic?: boolean;
      allowVideo?: boolean;
    },
    ack: (
      res: Ack<{
        showParticipantsToEachOther?: boolean;
        allowMic?: boolean;
        allowVideo?: boolean;
      }>
    ) => void
  ) => void;
}

export interface ServerToClientEvents {
  peerJoined: (peer: PeerInfo) => void;
  peerLeft: (payload: { peerId: string; userId: string }) => void;
  peerUpdated: (peer: PeerInfo) => void;

  newProducer: (payload: {
    peerId: string;
    userId: string;
    producerId: string;
    kind: 'audio' | 'video';
    source: MediaSource;
  }) => void;
  producerClosed: (payload: { peerId: string; producerId: string }) => void;
  producerPaused: (payload: { producerId: string; paused: boolean }) => void;

  chatMessage: (msg: ChatMessagePayload) => void;
  chatDeleted: (payload: { id: string }) => void;

  handList: (hands: HandRaiseEntry[]) => void;
  handApproved: (payload: { canPublishAudio: boolean; canPublishVideo: boolean }) => void;
  handRevoked: () => void;

  quizStarted: (quiz: PublicQuiz) => void;
  quizResults: (results: QuizResults) => void;
  quizClosed: (payload: { quizId: string }) => void;

  pollStarted: (poll: PublicPoll) => void;
  pollResults: (results: PollResults) => void;
  pollClosed: (payload: { pollId: string }) => void;

  /** The full Q&A queue after any change — small enough to resend wholesale. */
  qaList: (questions: QaQuestionPayload[]) => void;

  /** The spotlighted peer changed. `null` means back to the normal grid. */
  spotlightChanged: (payload: { peerId: string | null }) => void;

  /** The presentation stage changed — a file was opened, closed or replaced. */
  presentationChanged: (payload: { presentation: PresentationState | null }) => void;
  /** The presenter moved to another page/slide. */
  presentationPageChanged: (payload: { page: number }) => void;
  /** Annotation strokes were added or cleared. */
  presentationAnnotated: (payload: {
    action: 'add' | 'remove' | 'clear' | 'clearAll';
    strokes?: AnnotationStroke[];
    removeIds?: string[];
    page?: number;
  }) => void;
  /** Video presentation playback action (play/pause/seek) from host. */
  presentationVideoAction: (payload: {
    action: 'play' | 'pause' | 'seek';
    currentTime: number;
    timestamp: number;
  }) => void;
  /** Infinite canvas whiteboard viewport was updated by presenter. */
  whiteboardViewportChanged: (payload: { viewport: { panX: number; panY: number; zoom: number } }) => void;

  /** Sent to a speaker when the host mutes the room — the client pauses its mic. */
  forceMute: () => void;
  forceStopVideo: () => void;
  mediaPermissionUpdated: (payload: {
    canPublishAudio: boolean;
    canPublishVideo: boolean;
    canShareScreen?: boolean;
  }) => void;

  /**
   * A host is asking this peer to turn their mic or camera on. The client shows
   * a prompt; nothing is enabled without the participant's consent.
   */
  mediaRequested: (payload: { kind: 'mic' | 'cam'; by: string }) => void;

  ctaShown: (cta: CtaPayload) => void;
  ctaHidden: () => void;
  ctaExpanded: (payload: { expanded: boolean; expandedAt?: number }) => void;

  /**
   * Staff only — the offer's click tally moved.
   *
   * Broadcast to staff rather than to the room: a participant seeing "37 people
   * clicked" is social proof the host did not ask for, and it would leak how
   * well the offer is converting to everyone in the session.
   */
  ctaClicks: (payload: { ctaId: string; clickCount: number }) => void;

  /**
   * Staff only — a payment was captured for this webinar (via webhook or checkout).
   * Used to show live revenue and buyer names in the host panel.
   */
  paymentReceived: (payload: {
    id: string;
    amountPaise: number;
    userName: string;
    userEmail?: string;
    itemTitle: string;
    status: string;
    createdAt: string;
  }) => void;

  viewerCount: (count: number) => void;
  enrolledUpdated: (payload: { userId: string; enrolled: boolean }) => void;

  /**
   * The host opened the session. Everyone in the waiting room drops straight
   * into the room — no reload, because the socket was already connected.
   */
  webinarStarted: (payload: { startedAt: number }) => void;

  participantFullscreenPolicy: (payload: { allowed: boolean }) => void;
  webinarEnded: () => void;
  kicked: (payload: { reason: string }) => void;
  errorMessage: (payload: { message: string }) => void;

  /** Broadcast when the host starts or stops recording, so every client can
   *  show or hide the REC indicator. */
  roleChanged: (payload: { role: Role }) => void;
  recordingState: (payload: { recording: boolean; startedAt?: number }) => void;
  roomSettingsUpdated: (payload: {
    settings: WebinarSettings;
    showParticipantsToEachOther?: boolean;
    allowMic?: boolean;
    allowVideo?: boolean;
  }) => void;
}

/* ── transport / consumer payloads ─────────────────────────── */

export interface TransportParams {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
  iceServers?: unknown;
}

export interface ConsumerParams {
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  source: MediaSource;
  rtpParameters: unknown;
  peerId: string;
  userId: string;
  producerPaused: boolean;
}

export type Ack<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

export interface JoinAck {
  ok: boolean;
  error?: string;
  data?: {
    peerId: string;
    role: Role;
    userId: string;
    name: string;
    rtpCapabilities: unknown;
    snapshot: RoomSnapshot;
  };
}
