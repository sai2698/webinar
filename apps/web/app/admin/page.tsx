'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminShell, type NavItem } from '@/components/admin/AdminShell';
import {
  IconArrowRight,
  IconCalendar,
  IconCalendarGrid,
  IconCard,
  IconChart,
  IconCheck,
  IconChevron,
  IconClock,
  IconCopy,
  IconDisc,
  IconEdit,
  IconExternal,
  IconGrid,
  IconList,
  IconPlay,
  IconPlus,
  IconSearch,
  IconSend,
  IconSpark,
  IconTrash,
  IconUsers,
  IconVideo,
} from '@/components/admin/icons';
import {
  Button,
  Input,
  Badge,
  Card,
  StatCard,
  EmptyState,
  Tabs,
} from '@/components/ui';
import { WebinarForm, emptyWebinar, fromWebinar, type WebinarFormValues } from '@/components/WebinarForm';
import { EngagementPanel } from '@/components/EngagementPanel';
import { PaymentsPanel } from '@/components/PaymentsPanel';
import { RecordingsPanel } from '@/components/RecordingsPanel';
import { CustomFieldsPanel } from '@/components/admin/CustomFieldsPanel';
import { ApprovalPanel, InvitePanel } from '@/components/admin/ApprovalPanel';
import { CohostsPanel } from '@/components/admin/CohostsPanel';
import { StreamsPanel } from '@/components/admin/StreamsPanel';
import { SeriesPanel } from '@/components/admin/SeriesPanel';
import { EmbedPanel } from '@/components/admin/EmbedPanel';
import { WebhooksPanel } from '@/components/admin/WebhooksPanel';
import { GatewayConfigPanel } from '@/components/admin/GatewayConfigPanel';
import { AnalyticsPanel } from '@/components/admin/AnalyticsPanel';
import { AutomationPanel } from '@/components/admin/AutomationPanel';
import { ApiTokensPanel } from '@/components/admin/ApiTokensPanel';
import { endpoints, ApiError, type AuthUser } from '@/lib/api';
import {
  ADMIN_UNAUTHORIZED_EVENT,
  clearSession,
  getToken,
  getUser,
} from '@/lib/session';

interface AdminWebinar {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  startsAt: string;
  durationMins: number;
  timezone: string;
  status: string;
  host: { id: string; name: string; email: string } | null;
  settings: Record<string, unknown>;
  registrationCount?: number;
}

interface Registration {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  paid: boolean;
  attended: boolean;
  createdAt: string;
}

interface Analytics {
  registrations: number;
  paidRegistrations: number;
  revenuePaise: number;
  quizzes: { id: string; question: string; answers: number; correct: number }[];
}

type Tab =
  | 'webinars'
  | 'registrations'
  | 'analytics'
  | 'engagement'
  | 'payments'
  | 'recordings'
  | 'audience'
  | 'team'
  | 'distribution'
  | 'integrations';

const NAV: { key: Tab; label: string; icon: NavItem['icon']; group: string }[] = [
  { key: 'webinars', label: 'Webinars', icon: IconVideo, group: 'Overview' },
  { key: 'payments', label: 'Payments', icon: IconCard, group: 'Revenue' },
  { key: 'integrations', label: 'Integrations', icon: IconSpark, group: 'Growth' },
];

const TAB_TITLES: Record<Tab, string> = {
  webinars: 'Webinars',
  registrations: 'Registrations',
  analytics: 'Analytics',
  engagement: 'Engagement',
  payments: 'Payments',
  recordings: 'Recordings',
  audience: 'Audience',
  team: 'Team',
  distribution: 'Distribution',
  integrations: 'Integrations',
};

const TAB_BLURBS: Record<Tab, string> = {
  webinars: 'Create, publish and run your high-converting sessions.',
  registrations: 'Everyone who signed up, and whether they showed up.',
  analytics: 'Attendance, revenue and quiz performance.',
  engagement: 'Quizzes, offers and polls for the room.',
  payments: 'Orders, captures and refunds.',
  recordings: 'Replay timelines captured during live sessions.',
  audience: 'The sign-up form, the approval queue and bulk invites.',
  team: 'Co-hosts and exactly what each of them may do.',
  distribution: 'Simulcast, embeds and a recurring schedule.',
  integrations: 'Webhooks, tracking tags, automation and API tokens.',
};

const DETAIL_TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'registrations', label: 'Registrations', icon: IconUsers },
  { key: 'analytics', label: 'Analytics', icon: IconChart },
  { key: 'engagement', label: 'Engagement', icon: IconSpark },
  { key: 'payments', label: 'Payments', icon: IconCard },
  { key: 'recordings', label: 'Recordings', icon: IconDisc },
  { key: 'audience', label: 'Audience', icon: IconSend },
  { key: 'team', label: 'Team', icon: IconUsers },
  { key: 'distribution', label: 'Distribution', icon: IconExternal },
  { key: 'integrations', label: 'Integrations', icon: IconSpark },
];

function statusToBadgeVariant(status: string): 'live' | 'brand' | 'default' {
  if (status === 'LIVE') return 'live';
  if (status === 'SCHEDULED') return 'brand';
  return 'default';
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatPrice(paise: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function getBannerSrc(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('/uploads/')) {
    const apiOrigin =
      typeof window !== 'undefined'
        ? window.location.origin.replace(':3000', ':4000')
        : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');
    return `${apiOrigin}${url}`;
  }
  return url;
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [webinars, setWebinars] = useState<AdminWebinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone?: 'success' | 'info' } | null>(null);
  /** Slug currently being joined, so only that button shows a spinner. */
  const [joiningSlug, setJoiningSlug] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('webinars');
  const [selected, setSelected] = useState<AdminWebinar | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'scheduled' | 'draft' | 'ended'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'list' | 'calendar'>('cards');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminWebinar | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const showToast = useCallback((message: string, tone: 'success' | 'info' = 'success') => {
    setToast({ message, tone });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 2800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await endpoints.adminWebinars();
      setWebinars(res.webinars as AdminWebinar[]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/admin/login');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not load webinars');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const signOutLocally = useCallback(() => {
    clearSession('admin');
    router.replace('/admin/login');
  }, [router]);

  useEffect(() => {
    if (!getToken('admin')) {
      router.replace('/admin/login');
      return;
    }
    const stored = getUser('admin');
    if (stored) setUser(stored as AuthUser);
    void load();
  }, [load, router]);

  useEffect(() => {
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, signOutLocally);
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, signOutLocally);
  }, [signOutLocally]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === null || e.key.startsWith('nexa:admin:')) {
        if (!getToken('admin')) signOutLocally();
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [signOutLocally]);

  const refreshSelected = useCallback(async () => {
    if (!selected) return;
    try {
      const res = await endpoints.adminWebinar(selected.id);
      const fresh = res.webinar as AdminWebinar;
      setSelected(fresh);
      setWebinars((prev) => prev.map((w) => (w.id === fresh.id ? fresh : w)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not refresh the webinar');
    }
  }, [selected]);

  async function openDetail(w: AdminWebinar, nextTab: Tab) {
    setSelected(w);
    setTab(nextTab);
    setAnalytics(null);
    setRegistrations([]);
    if (nextTab === 'engagement' || nextTab === 'payments' || nextTab === 'recordings') return;
    try {
      if (nextTab === 'registrations') {
        const res = await endpoints.registrations(w.id);
        setRegistrations(res.registrations as Registration[]);
      } else {
        const res = await endpoints.analytics(w.id);
        setAnalytics((res as { analytics: Analytics }).analytics);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load details');
    }
  }

  async function joinRoom(slug: string) {
    setJoiningSlug(slug);
    setError(null);
    try {
      const res = await endpoints.hostJoin(slug);
      localStorage.setItem(`join:${slug}`, res.joinToken);
      router.push(`/room/${slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join the room');
      setJoiningSlug(null);
    }
  }

  async function submitForm(values: WebinarFormValues) {
    setFormBusy(true);
    setFormError(null);
    try {
      const payload = {
        title: values.title,
        description: values.description,
        bannerUrl: values.bannerUrl || '',
        startsAt: new Date(values.startsAt).toISOString(),
        durationMins: values.durationMins,
        timezone: values.timezone,
        settings: {
          allowMic: values.allowMic,
          allowVideo: values.allowVideo,
          requireRegistration: values.requireRegistration,
          requirePayment: values.requirePayment,
          priceInPaise: values.priceInPaise,
          currency: 'INR',
          chatEnabled: values.chatEnabled,
          handRaiseEnabled: values.handRaiseEnabled,
          maxParticipants: values.maxParticipants,
          inviteOnly: values.inviteOnly,
          requireSignIn: values.requireSignIn,
          requireApproval: values.requireApproval,
          showPeopleTab: values.showPeopleTab,
          showQaTab: values.showQaTab,
          showPollsTab: values.showPollsTab,
          showParticipantsToEachOther: values.showParticipantsToEachOther,
          watermarkEnabled: values.watermarkEnabled,
          showLiveUsersCount: values.showLiveUsersCount,
          cohostStartWithoutHost: values.cohostStartWithoutHost,
          whatsappGroupUrl: values.whatsappGroupUrl.trim() || null,
          collectPhone: values.collectPhone,
          requirePhone: values.requirePhone,
          registrationFields: values.registrationFields,
          ...(values.passcode.trim() ? { passcode: values.passcode.trim() } : {}),
        },
      };

      if (editing) {
        await endpoints.updateWebinar(editing.id, payload);
        showToast('Webinar settings saved');
      } else {
        await endpoints.createWebinar(payload);
        showToast('New webinar created successfully');
      }
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save webinar');
    } finally {
      setFormBusy(false);
    }
  }

  async function publish(w: AdminWebinar) {
    try {
      await endpoints.publishWebinar(w.id);
      showToast(`Published "${w.title}"`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish');
    }
  }

  async function remove(w: AdminWebinar) {
    if (!confirm(`Delete "${w.title}"? This cannot be undone.`)) return;
    try {
      await endpoints.deleteWebinar(w.id);
      showToast(`Deleted "${w.title}"`, 'info');
      if (selected?.id === w.id) setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete');
    }
  }

  async function logout() {
    try {
      await endpoints.logout();
    } catch {
      /* ignore */
    }
    clearSession('admin');
    router.push('/admin/login');
  }

  const stats = useMemo(() => {
    const total = webinars.length;
    const live = webinars.filter((w) => w.status === 'LIVE').length;
    const scheduled = webinars.filter((w) => w.status === 'SCHEDULED').length;
    const drafts = webinars.filter((w) => w.status === 'DRAFT').length;
    const ended = webinars.filter((w) => w.status === 'ENDED').length;
    const regs = webinars.reduce((sum, w) => sum + (w.registrationCount ?? 0), 0);
    return { total, live, scheduled, drafts, ended, regs };
  }, [webinars]);

  const filtered = useMemo(() => {
    let list = webinars;

    if (statusFilter === 'live') {
      list = list.filter((w) => w.status === 'LIVE');
    } else if (statusFilter === 'scheduled') {
      list = list.filter((w) => w.status === 'SCHEDULED');
    } else if (statusFilter === 'draft') {
      list = list.filter((w) => w.status === 'DRAFT');
    } else if (statusFilter === 'ended') {
      list = list.filter((w) => w.status === 'ENDED');
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (w) => w.title.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q)
      );
    }

    return list;
  }, [webinars, query, statusFilter]);

  const initialForm = useMemo<WebinarFormValues>(
    () => (editing ? fromWebinar(editing) : emptyWebinar),
    [editing]
  );

  const nav: NavItem[] = NAV.map((item) => ({
    ...item,
    badge: item.key === 'webinars' ? stats.total : undefined,
  }));

  const subtitle = showForm
    ? editing
      ? 'Update this session’s schedule, access rules and streaming options.'
      : 'Set the schedule, access rules and streaming options for a new session.'
    : selected && tab !== 'webinars'
      ? selected.title
      : TAB_BLURBS[tab];

  return (
    <AdminShell
      nav={nav}
      active={tab}
      onNavigate={(key) => {
        setShowForm(false);
        setEditing(null);
        setFormError(null);
        setTab(key as Tab);
        if (key === 'webinars') setSelected(null);
      }}
      title={showForm ? (editing ? 'Edit webinar' : 'New webinar') : TAB_TITLES[tab]}
      subtitle={subtitle}
      user={user ? { name: user.name, role: user.role } : null}
      onSignOut={logout}
      actions={
        showForm ? undefined : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormError(null);
              setShowForm(true);
            }}
            leftIcon={<IconPlus className="h-4 w-4" />}
          >
            New webinar
          </Button>
        )
      }
    >
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-up">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-xs font-semibold text-fg shadow-pop">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-mint-500/20 text-mint-500">
              <IconCheck className="h-3.5 w-3.5" />
            </span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3.5 text-sm text-red-600 dark:text-red-300">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-xs font-semibold opacity-70 transition hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Full-page Create / Edit composer (replaces the old modal) */}
      {showForm ? (
        <WebinarComposeView
          editing={editing}
          initial={initialForm}
          busy={formBusy}
          error={formError}
          onSubmit={submitForm}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
            setFormError(null);
          }}
        />
      ) : tab === 'webinars' ? (
        <WebinarsView
          loading={loading}
          webinars={filtered}
          total={webinars.length}
          query={query}
          onQuery={setQuery}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          viewMode={viewMode}
          onViewMode={setViewMode}
          stats={stats}
          joiningSlug={joiningSlug}
          onJoin={joinRoom}
          onOpen={openDetail}
          onEdit={(w) => {
            setEditing(w);
            setFormError(null);
            setShowForm(true);
          }}
          onPublish={publish}
          onDelete={remove}
          onCreate={() => {
            setEditing(null);
            setFormError(null);
            setShowForm(true);
          }}
          onToast={showToast}
        />
      ) : (
        <DetailView
          tab={tab}
          onTabChange={(nextTab) => {
            if (selected) {
              void openDetail(selected, nextTab);
            } else {
              setTab(nextTab);
            }
          }}
          webinars={webinars}
          selected={selected}
          onSelect={(w) => void openDetail(w, tab)}
          onClear={() => {
            setSelected(null);
            setTab('webinars');
          }}
          onRefresh={() => void refreshSelected()}
          joiningSlug={joiningSlug}
          onJoin={joinRoom}
          registrations={registrations}
          analytics={analytics}
          onToast={showToast}
        />
      )}
    </AdminShell>
  );
}

/* ─────────────────────────── create / edit page ─────────────────────────── */

function WebinarComposeView({
  editing,
  initial,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  editing: AdminWebinar | null;
  initial: WebinarFormValues;
  busy: boolean;
  error: string | null;
  onSubmit: (values: WebinarFormValues) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-600 transition hover:underline dark:text-brand-400"
          >
            <IconChevron className="h-3 w-3 rotate-180" />
            Back to webinars
          </button>
          <h2 className="mt-1.5 text-lg font-bold tracking-tight text-fg">
            {editing ? 'Edit webinar' : 'Create a new webinar'}
          </h2>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
            {editing
              ? 'Update the schedule, access rules and streaming options for this session.'
              : 'Set the schedule, access rules and streaming options. You can publish it once it is ready.'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Form card */}
        <Card className="p-5 sm:p-6">
          <WebinarForm
            initial={initial}
            webinarId={editing?.id}
            submitLabel={editing ? 'Save changes' : 'Create webinar'}
            busy={busy}
            error={error}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </Card>

        {/* Guidance rail */}
        <aside className="space-y-3 xl:sticky xl:top-[92px] xl:self-start">
          <Card className="p-4">
            <h3 className="flex items-center gap-2 text-[12.5px] font-bold tracking-tight text-fg">
              <span className="h-3.5 w-[2.5px] shrink-0 rounded-full bg-brand-500" />
              Before you publish
            </h3>
            <ul className="mt-3 space-y-2.5">
              {[
                'A 16:9 banner (1920×1080) renders best on the registration page.',
                'Turn on “Require registration” to collect attendee details.',
                'Enable “Require host approval” to screen every signup.',
                'Paid sessions need a Razorpay gateway configured under Payments.',
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <IconCheck className="h-2.5 w-2.5" />
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <h3 className="flex items-center gap-2 text-[12.5px] font-bold tracking-tight text-fg">
              <span className="h-3.5 w-[2.5px] shrink-0 rounded-full bg-mint-500" />
              What happens next
            </h3>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              New webinars start as a draft. Publish it from the webinar card to open the
              registration page, then host the session from the studio.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────── webinars list view ─────────────────────────── */

function WebinarsView({
  loading,
  webinars,
  total,
  query,
  onQuery,
  statusFilter,
  onStatusFilter,
  viewMode,
  onViewMode,
  stats,
  joiningSlug,
  onJoin,
  onOpen,
  onEdit,
  onPublish,
  onDelete,
  onCreate,
  onToast,
}: {
  loading: boolean;
  webinars: AdminWebinar[];
  total: number;
  query: string;
  onQuery: (v: string) => void;
  statusFilter: 'all' | 'live' | 'scheduled' | 'draft' | 'ended';
  onStatusFilter: (f: 'all' | 'live' | 'scheduled' | 'draft' | 'ended') => void;
  viewMode: 'cards' | 'list' | 'calendar';
  onViewMode: (m: 'cards' | 'list' | 'calendar') => void;
  stats: { total: number; live: number; scheduled: number; drafts: number; ended: number; regs: number };
  joiningSlug: string | null;
  onJoin: (slug: string) => void;
  onOpen: (w: AdminWebinar, tab: Tab) => void;
  onEdit: (w: AdminWebinar) => void;
  onPublish: (w: AdminWebinar) => void;
  onDelete: (w: AdminWebinar) => void;
  onCreate: () => void;
  onToast: (msg: string, tone?: 'success' | 'info') => void;
}) {
  const liveWebinar = webinars.find((w) => w.status === 'LIVE') ?? null;

  return (
    <div className="space-y-6">
      {/* ── Quick create strip ───────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <QuickActionCard
          tone="brand"
          icon={IconCalendar}
          title="Schedule a webinar"
          description="Pick a date, set access rules and publish a registration page."
          onClick={onCreate}
        />
        <QuickActionCard
          tone="live"
          icon={IconPlay}
          title="Enter live studio"
          description={
            liveWebinar
              ? `Jump straight into “${liveWebinar.title}”.`
              : 'No session is live right now — start one from a webinar card.'
          }
          disabled={!liveWebinar}
          onClick={() => liveWebinar && onJoin(liveWebinar.slug)}
        />
        <QuickActionCard
          tone="mint"
          icon={IconDisc}
          title="Replay library"
          description={
            webinars.length
              ? 'Review captured timelines and publish a premiere.'
              : 'Recordings appear here once a session has been broadcast.'
          }
          disabled={!webinars.length}
          onClick={() => webinars[0] && onOpen(webinars[0], 'recordings')}
        />
      </div>

      {/* 4 Metric Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Webinars"
          value={String(stats.total)}
          sub="All sessions created"
          icon={IconVideo}
          tone="default"
        />
        <StatCard
          label="Live Broadcasts"
          value={String(stats.live)}
          sub={stats.live > 0 ? 'Active streaming room' : 'None live currently'}
          icon={IconPlay}
          tone="live"
        />
        <StatCard
          label="Total Registrations"
          value={String(stats.regs)}
          sub="Cumulative attendees signed up"
          icon={IconUsers}
          tone="mint"
        />
        <StatCard
          label="Avg. Per Session"
          value={String(stats.total ? Math.round(stats.regs / stats.total) : 0)}
          sub="Average attendee interest"
          icon={IconChart}
          tone="default"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-2.5 shadow-card xl:flex-row xl:items-center xl:justify-between">
        <div className="-mx-0.5 min-w-0 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Tabs
            tabs={[
              { id: 'all', label: 'All', count: stats.total },
              { id: 'live', label: 'Live Now', count: stats.live },
              { id: 'scheduled', label: 'Scheduled', count: stats.scheduled },
              { id: 'draft', label: 'Drafts', count: stats.drafts },
              { id: 'ended', label: 'Ended', count: stats.ended },
            ]}
            active={statusFilter}
            onChange={onStatusFilter}
            className="w-max flex-nowrap border-0 bg-transparent p-0"
          />
        </div>

        {/* Search & View Mode Switcher */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative min-w-0 flex-1 xl:w-60">
            <Input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search webinars…"
              leftIcon={<IconSearch className="h-4 w-4" />}
              className="py-2"
            />
          </div>

          <div className="flex shrink-0 items-center rounded-xl border border-line bg-panel-2 p-1">
            <button
              onClick={() => onViewMode('cards')}
              className={`grid h-7 w-7 place-items-center rounded-lg transition ${
                viewMode === 'cards'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-subtle hover:text-fg'
              }`}
              title="Card grid view"
              aria-label="Card grid view"
            >
              <IconGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => onViewMode('list')}
              className={`grid h-7 w-7 place-items-center rounded-lg transition ${
                viewMode === 'list'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-subtle hover:text-fg'
              }`}
              title="Compact list view"
              aria-label="Compact list view"
            >
              <IconList className="h-4 w-4" />
            </button>
            <button
              onClick={() => onViewMode('calendar')}
              className={`grid h-7 w-7 place-items-center rounded-lg transition ${
                viewMode === 'calendar'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-subtle hover:text-fg'
              }`}
              title="Calendar view"
              aria-label="Calendar view"
            >
              <IconCalendarGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-72 animate-pulse rounded-2xl border border-line bg-panel"
            />
          ))}
        </div>
      ) : webinars.length === 0 ? (
        <EmptyState
          icon={IconVideo}
          title={total === 0 ? 'No webinars created yet' : 'No webinars match your filter'}
          description={
            total === 0
              ? 'Create your first live session to start accepting registrations and broadcasting.'
              : 'Try clearing the search query or selecting a different status filter tab.'
          }
          action={
            total === 0 ? (
              <Button
                variant="primary"
                onClick={onCreate}
                leftIcon={<IconPlus className="h-4 w-4" />}
              >
                Create webinar
              </Button>
            ) : undefined
          }
        />
      ) : viewMode === 'cards' ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {webinars.map((w) => (
            <WebinarCard
              key={w.id}
              webinar={w}
              joining={joiningSlug === w.slug}
              onJoin={onJoin}
              onOpen={onOpen}
              onEdit={onEdit}
              onPublish={onPublish}
              onDelete={onDelete}
              onToast={onToast}
            />
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-2">
          {webinars.map((w) => (
            <WebinarListRow
              key={w.id}
              webinar={w}
              joining={joiningSlug === w.slug}
              onJoin={onJoin}
              onOpen={onOpen}
              onEdit={onEdit}
              onPublish={onPublish}
              onDelete={onDelete}
              onToast={onToast}
            />
          ))}
        </div>
      ) : (
        <WebinarCalendar
          webinars={webinars}
          joiningSlug={joiningSlug}
          onJoin={onJoin}
          onOpen={onOpen}
          onEdit={onEdit}
          onCreate={onCreate}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── quick action card ─────────────────────────── */

const QUICK_TONES = {
  brand: {
    ring: 'hover:border-brand-500/40',
    chip: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
    glow: 'from-brand-500/[0.07]',
  },
  live: {
    ring: 'hover:border-red-500/40',
    chip: 'bg-red-500/10 text-red-600 dark:text-red-400',
    glow: 'from-red-500/[0.07]',
  },
  mint: {
    ring: 'hover:border-mint-500/40',
    chip: 'bg-mint-500/10 text-mint-600 dark:text-mint-400',
    glow: 'from-mint-500/[0.07]',
  },
} as const;

function QuickActionCard({
  tone,
  icon: Icon,
  title,
  description,
  onClick,
  disabled = false,
}: {
  tone: keyof typeof QUICK_TONES;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const t = QUICK_TONES[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-2xl border border-line bg-panel p-4 text-left shadow-card transition-all duration-200 ${t.ring} ${
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0'
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-300 ${t.glow} ${
          disabled ? '' : 'group-hover:opacity-100'
        }`}
      />
      <div className="relative flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.chip}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-tight text-fg">{title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted line-clamp-2">
            {description}
          </p>
        </div>
        <IconArrowRight
          className={`mt-1 h-4 w-4 shrink-0 text-subtle transition-transform duration-200 ${
            disabled ? '' : 'group-hover:translate-x-0.5 group-hover:text-fg'
          }`}
        />
      </div>
    </button>
  );
}

/* ─────────────────────────── modern webinar card ─────────────────────────── */

function WebinarCard({
  webinar: w,
  joining,
  onJoin,
  onOpen,
  onEdit,
  onPublish,
  onDelete,
  onToast,
}: {
  webinar: AdminWebinar;
  joining: boolean;
  onJoin: (slug: string) => void;
  onOpen: (w: AdminWebinar, tab: Tab) => void;
  onEdit: (w: AdminWebinar) => void;
  onPublish: (w: AdminWebinar) => void;
  onDelete: (w: AdminWebinar) => void;
  onToast: (msg: string, tone?: 'success' | 'info') => void;
}) {
  const [copied, setCopied] = useState(false);
  const paid = Boolean(w.settings?.requirePayment);
  const isLive = w.status === 'LIVE';
  const bannerSrc = getBannerSrc(w.bannerUrl);

  const copyPublicLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/w/${w.slug}`
      : `/w/${w.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    onToast('Webinar public link copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="group relative flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-pop">
      {/* 16:9 Banner Header */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-panel-2">
        {bannerSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerSrc}
            alt={w.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-brand-600/20 via-panel-2 to-panel p-4 text-center">
            <IconVideo className="h-8 w-8 text-brand-400 opacity-60" />
            <span className="mt-2 text-[11px] font-semibold text-subtle">
              {w.title.slice(0, 32)}
            </span>
          </div>
        )}

        {/* Gradient Overlay for Top Badges */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 via-black/30 to-transparent p-3">
          <span className="inline-flex items-center gap-1.5">
            <Badge
              variant={statusToBadgeVariant(w.status)}
              size="sm"
              dot
              className="backdrop-blur-md"
            >
              {w.status}
            </Badge>
            {isLive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur-md">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                On air
              </span>
            )}
          </span>

          {paid ? (
            <span className="rounded-full bg-accent-500/90 px-2 py-0.5 text-[10px] font-bold tabular-nums text-ink-950 shadow-sm backdrop-blur-md">
              {formatPrice(Number(w.settings?.priceInPaise ?? 0))}
            </span>
          ) : (
            <span className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-inset ring-white/25 backdrop-blur-md">
              Free
            </span>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-4 sm:p-[18px]">
        <h3
          onClick={() => onOpen(w, 'registrations')}
          className="cursor-pointer text-[14.5px] font-bold leading-snug tracking-tight text-fg transition hover:text-brand-500 line-clamp-2"
          title={w.title}
        >
          {w.title}
        </h3>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <IconCalendar className="h-3.5 w-3.5 text-subtle" />
            {formatDate(w.startsAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconClock className="h-3.5 w-3.5 text-subtle" />
            {w.durationMins}m
          </span>
        </div>

        {/* Attendees Meter */}
        <div className="mt-3.5 flex items-center justify-between rounded-xl border border-line bg-panel-2/60 px-2.5 py-2 transition-colors group-hover:border-line">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <IconUsers className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-bold tabular-nums text-fg">
              {w.registrationCount ?? 0}
            </span>
            <span className="text-[11px] text-muted">registered</span>
          </div>
          <button
            onClick={() => onOpen(w, 'registrations')}
            className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px] font-bold text-brand-600 transition hover:gap-1.5 hover:bg-brand-500/10 dark:text-brand-400"
          >
            View
            <IconArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Primary Action Button Cluster */}
        <div className="mt-3.5 flex items-center gap-2">
          <Button
            variant={isLive ? 'danger' : 'primary'}
            size="sm"
            onClick={() => onJoin(w.slug)}
            isLoading={joining}
            leftIcon={<IconPlay className="h-3.5 w-3.5" />}
            className="flex-1"
          >
            {isLive ? 'Enter Live Studio' : 'Host Studio'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={copyPublicLink}
            title="Copy public link"
            className="px-2.5"
          >
            {copied ? (
              <IconCheck className="h-4 w-4 text-mint-500" />
            ) : (
              <IconCopy className="h-4 w-4" />
            )}
          </Button>

          <Link href={`/w/${w.slug}`}>
            <Button
              variant="outline"
              size="sm"
              title="Preview public registration page"
              className="px-2.5"
            >
              <IconExternal className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Secondary Tool Toolbar */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/60 pt-2.5">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onOpen(w, 'analytics')}
              title="Analytics"
              aria-label="Analytics"
              className="grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-panel-2 hover:text-fg active:scale-95"
            >
              <IconChart className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onOpen(w, 'engagement')}
              title="Engagement"
              aria-label="Engagement"
              className="grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-panel-2 hover:text-fg active:scale-95"
            >
              <IconSpark className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onOpen(w, 'payments')}
              title="Payments"
              aria-label="Payments"
              className="grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-panel-2 hover:text-fg active:scale-95"
            >
              <IconCard className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onOpen(w, 'recordings')}
              title="Recordings"
              aria-label="Recordings"
              className="grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-panel-2 hover:text-fg active:scale-95"
            >
              <IconDisc className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {w.status === 'DRAFT' && (
              <Button size="xs" variant="accent" onClick={() => onPublish(w)}>
                Publish
              </Button>
            )}
            <span className="mx-0.5 h-4 w-px bg-line" />
            <button
              onClick={() => onEdit(w)}
              title="Edit Settings"
              aria-label="Edit settings"
              className="grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-panel-2 hover:text-fg active:scale-95"
            >
              <IconEdit className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(w)}
              title="Delete Webinar"
              aria-label="Delete webinar"
              className="grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-red-500/10 hover:text-red-500 active:scale-95"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────── compact webinar row ─────────────────────────── */

function WebinarListRow({
  webinar: w,
  joining,
  onJoin,
  onOpen,
  onEdit,
  onPublish,
  onDelete,
  onToast,
}: {
  webinar: AdminWebinar;
  joining: boolean;
  onJoin: (slug: string) => void;
  onOpen: (w: AdminWebinar, tab: Tab) => void;
  onEdit: (w: AdminWebinar) => void;
  onPublish: (w: AdminWebinar) => void;
  onDelete: (w: AdminWebinar) => void;
  onToast: (msg: string, tone?: 'success' | 'info') => void;
}) {
  const [copied, setCopied] = useState(false);
  const paid = Boolean(w.settings?.requirePayment);
  const isLive = w.status === 'LIVE';
  const bannerSrc = getBannerSrc(w.bannerUrl);

  const copyPublicLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/w/${w.slug}`
      : `/w/${w.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    onToast('Webinar public link copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="group flex flex-col gap-3 p-3 transition-all duration-200 hover:border-brand-400/50 hover:shadow-pop md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-panel-2">
          {bannerSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-brand-500/10 text-brand-500">
              <IconVideo className="h-5 w-5" />
            </div>
          )}
          {isLive && (
            <span className="absolute right-1 top-1 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-panel" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant={statusToBadgeVariant(w.status)} size="sm" dot>
              {w.status}
            </Badge>
            {paid && (
              <span className="rounded-full bg-accent-500/15 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-accent-600 dark:text-accent-400">
                {formatPrice(Number(w.settings?.priceInPaise ?? 0))}
              </span>
            )}
            <h4
              onClick={() => onOpen(w, 'registrations')}
              className="cursor-pointer truncate text-[13.5px] font-bold text-fg transition hover:text-brand-500"
            >
              {w.title}
            </h4>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1">
              <IconCalendar className="h-3 w-3 text-subtle" />
              {formatDate(w.startsAt)}
            </span>
            <span className="text-subtle">•</span>
            <span className="inline-flex items-center gap-1">
              <IconClock className="h-3 w-3 text-subtle" />
              {w.durationMins}m
            </span>
            <span className="text-subtle">•</span>
            <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-fg">
              <IconUsers className="h-3 w-3 text-subtle" />
              {w.registrationCount ?? 0} registered
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 self-end md:self-auto">
        <Button
          size="xs"
          variant={isLive ? 'danger' : 'primary'}
          onClick={() => onJoin(w.slug)}
          isLoading={joining}
          leftIcon={<IconPlay className="h-3 w-3" />}
        >
          {isLive ? 'Live Studio' : 'Host Studio'}
        </Button>

        <Button
          size="xs"
          variant="outline"
          onClick={copyPublicLink}
          title="Copy link"
          aria-label="Copy public link"
          className="px-2"
        >
          {copied ? (
            <IconCheck className="h-3.5 w-3.5 text-mint-500" />
          ) : (
            <IconCopy className="h-3.5 w-3.5" />
          )}
        </Button>

        <Button
          size="xs"
          variant="outline"
          onClick={() => onOpen(w, 'registrations')}
          title="Manage webinar"
          aria-label="Manage webinar"
          className="px-2"
        >
          <IconUsers className="h-3.5 w-3.5" />
        </Button>

        <span className="mx-0.5 h-4 w-px bg-line" />

        <button
          onClick={() => onEdit(w)}
          title="Edit"
          aria-label="Edit webinar"
          className="grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-panel-2 hover:text-fg active:scale-95"
        >
          <IconEdit className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => onDelete(w)}
          title="Delete"
          aria-label="Delete webinar"
          className="grid h-7 w-7 place-items-center rounded-lg text-subtle transition hover:bg-red-500/10 hover:text-red-500 active:scale-95"
        >
          <IconTrash className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  );
}

/* ─────────────────────────── detail views ─────────────────────────── */

function DetailView({
  tab,
  onTabChange,
  webinars,
  selected,
  onSelect,
  onClear,
  onRefresh,
  joiningSlug,
  onJoin,
  registrations,
  analytics,
  onToast,
}: {
  tab: Tab;
  onTabChange: (nextTab: Tab) => void;
  webinars: AdminWebinar[];
  selected: AdminWebinar | null;
  onSelect: (w: AdminWebinar) => void;
  onClear: () => void;
  onRefresh: () => void;
  joiningSlug: string | null;
  onJoin: (slug: string) => void;
  registrations: Registration[];
  analytics: Analytics | null;
  onToast: (msg: string, tone?: 'success' | 'info') => void;
}) {
  const [copiedLink, setCopiedLink] = useState(false);

  // If no webinar is selected, provide the picker
  if (!selected) {
    if (tab === 'payments' || tab === 'integrations') {
      return (
        <div className="space-y-6">
          <GatewayConfigPanel />
          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold tracking-tight text-fg">
                  {tab === 'payments' ? 'Webinar payments & refunds' : 'Integrations & webhooks'}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {tab === 'payments'
                    ? 'Choose a webinar below to view its transactions and process refunds.'
                    : 'Choose a webinar below to configure webhooks, automation cues, and tracking pixels.'}
                </p>
              </div>
            </div>
            {webinars.length === 0 ? (
              <EmptyState title="No webinars created yet" className="mt-4" />
            ) : (
              <div className="mt-4 space-y-1.5">
                {webinars.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => onSelect(w)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-line hover:bg-panel-2"
                  >
                    <Badge variant={statusToBadgeVariant(w.status)} size="sm">
                      {w.status}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
                      {w.title}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted">
                      {w.registrationCount ?? 0} regs
                    </span>
                    <IconChevron className="h-4 w-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-fg" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      );
    }

    return (
      <Card className="p-5 sm:p-6">
        <h2 className="text-sm font-bold tracking-tight text-fg">
          Choose a webinar to view {TAB_TITLES[tab]}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {TAB_TITLES[tab]} data is scoped to a single session — pick one below to open its
          dashboard.
        </p>
        {webinars.length === 0 ? (
          <EmptyState title="No webinars created yet" className="mt-4" />
        ) : (
          <div className="mt-4 space-y-1.5">
            {webinars.map((w) => (
              <button
                key={w.id}
                onClick={() => onSelect(w)}
                className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition hover:border-line hover:bg-panel-2"
              >
                <Badge variant={statusToBadgeVariant(w.status)} size="sm">
                  {w.status}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
                  {w.title}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted">
                  {w.registrationCount ?? 0} registrations
                </span>
                <IconChevron className="h-4 w-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-fg" />
              </button>
            ))}
          </div>
        )}
      </Card>
    );
  }

  const copyLink = () => {
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/w/${selected.slug}`
      : `/w/${selected.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    onToast('Webinar public link copied');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* ── Scoped Webinar Context Header ── */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-subtle">
              <button
                onClick={onClear}
                className="inline-flex items-center gap-1 font-semibold text-brand-600 transition hover:underline dark:text-brand-400"
              >
                <IconChevron className="h-3 w-3 rotate-180" />
                All webinars
              </button>
              <IconChevron className="h-2.5 w-2.5" />
              <span className="truncate text-muted">{selected.title}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-bold tracking-tight text-fg">{selected.title}</h2>
              <Badge variant={statusToBadgeVariant(selected.status)} size="sm" dot>
                {selected.status}
              </Badge>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <IconCalendar className="h-3.5 w-3.5 text-subtle" />
                {formatDate(selected.startsAt)}
              </span>
              <span className="text-subtle">•</span>
              <span className="inline-flex items-center gap-1.5">
                <IconClock className="h-3.5 w-3.5 text-subtle" />
                {selected.durationMins} minutes
              </span>
              <span className="text-subtle">•</span>
              <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-fg">
                <IconUsers className="h-3.5 w-3.5 text-subtle" />
                {selected.registrationCount ?? 0} registered
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => onJoin(selected.slug)}
              isLoading={joiningSlug === selected.slug}
              leftIcon={<IconPlay className="h-3.5 w-3.5" />}
            >
              Host Studio
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={copyLink}
              leftIcon={
                copiedLink ? (
                  <IconCheck className="h-3.5 w-3.5 text-mint-500" />
                ) : (
                  <IconCopy className="h-3.5 w-3.5 text-subtle" />
                )
              }
            >
              {copiedLink ? 'Copied' : 'Copy link'}
            </Button>

            <Link href={`/w/${selected.slug}`}>
              <Button size="sm" variant="outline" title="Preview public page">
                <IconExternal className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Horizontal Detail Sub-Tabs Bar */}
        <div className="scrollbar-thin flex gap-1 overflow-x-auto border-t border-line/60 bg-panel-2/40 px-3 py-2">
          {DETAIL_TABS.map((subItem) => {
            const Icon = subItem.icon;
            const active = tab === subItem.key;
            return (
              <button
                key={subItem.key}
                onClick={() => onTabChange(subItem.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition ${
                  active
                    ? 'bg-panel text-brand-700 shadow-xs ring-1 ring-inset ring-brand-500/25 dark:text-brand-200'
                    : 'text-muted hover:bg-panel/70 hover:text-fg'
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${active ? 'text-brand-600 dark:text-brand-300' : 'text-subtle'}`}
                />
                <span>{subItem.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Main Scoped Tab Content Panel */}
      <Card className="p-4 sm:p-5 lg:p-6">
        {tab === 'registrations' ? (
          <RegistrationsTable registrations={registrations} />
        ) : tab === 'engagement' ? (
          <EngagementPanel webinarId={selected.id} />
        ) : tab === 'payments' ? (
          <div className="space-y-8">
            <GatewayConfigPanel />
            <div className="divider" />
            <PaymentsPanel webinarId={selected.id} />
          </div>
        ) : tab === 'recordings' ? (
          <RecordingsPanel
            webinarId={selected.id}
            slug={selected.slug}
            premiereRecordingId={
              (selected.settings.premiereRecordingId as string | null | undefined) ?? null
            }
            premiereStartedAt={
              (selected.settings.premiereStartedAt as string | null | undefined) ?? null
            }
            onPremiereChange={onRefresh}
          />
        ) : tab === 'audience' ? (
          <div className="space-y-8">
            <CustomFieldsPanel webinarId={selected.id} />
            <div className="divider" />
            <ApprovalPanel webinarId={selected.id} />
            <div className="divider" />
            <InvitePanel webinarId={selected.id} />
          </div>
        ) : tab === 'team' ? (
          <CohostsPanel webinarId={selected.id} />
        ) : tab === 'distribution' ? (
          <div className="space-y-8">
            <StreamsPanel webinarId={selected.id} isLive={selected.status === 'LIVE'} />
            <div className="divider" />
            <EmbedPanel webinarId={selected.id} />
            <div className="divider" />
            <SeriesPanel webinarId={selected.id} />
          </div>
        ) : tab === 'integrations' ? (
          <div className="space-y-8">
            <GatewayConfigPanel />
            <div className="divider" />
            <WebhooksPanel />
            <div className="divider" />
            <AnalyticsPanel webinarId={selected.id} />
            <div className="divider" />
            <AutomationPanel webinarId={selected.id} />
            <div className="divider" />
            <ApiTokensPanel />
          </div>
        ) : (
          <AnalyticsView analytics={analytics} />
        )}
      </Card>
    </div>
  );
}

function RegistrationsTable({ registrations }: { registrations: Registration[] }) {
  if (registrations.length === 0) {
    return (
      <EmptyState
        icon={IconUsers}
        title="No Registrations Yet"
        description="Share the registration link with your audience to gather attendees for this live event."
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-tight text-fg">Attendee list</h3>
        <span className="rounded-full border border-line bg-panel-2 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
          {registrations.length} total
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-panel-2/70">
            <tr className="text-[10px] uppercase tracking-[0.1em] text-subtle">
              <th className="px-3 py-2.5 font-bold">Name</th>
              <th className="px-3 py-2.5 font-bold">Email</th>
              <th className="px-3 py-2.5 font-bold">Phone</th>
              <th className="px-3 py-2.5 font-bold">Payment</th>
              <th className="px-3 py-2.5 font-bold">Attended</th>
              <th className="px-3 py-2.5 font-bold">Registered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {registrations.map((r) => {
              const initials = r.name
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? '')
                .join('');
              return (
                <tr key={r.id} className="transition hover:bg-panel-2/50">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500/10 text-[10px] font-bold text-brand-600 dark:text-brand-300">
                        {initials || '?'}
                      </span>
                      <span className="font-semibold text-fg">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted">{r.email}</td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-subtle">
                    {r.phone ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={r.paid ? 'success' : 'default'} size="sm">
                      {r.paid ? 'Paid' : 'Free'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={r.attended ? 'brand' : 'default'} size="sm">
                      {r.attended ? 'Attended' : 'Absent'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-[11.5px] text-subtle">
                    {formatDate(r.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsView({ analytics }: { analytics: Analytics | null }) {
  if (!analytics) {
    return (
      <div className="grid place-items-center py-16">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand-500" />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Registrations"
          value={String(analytics.registrations)}
          sub="All registered attendees"
          icon={IconUsers}
          tone="default"
        />
        <StatCard
          label="Paid Attendees"
          value={String(analytics.paidRegistrations)}
          sub="Verified payments"
          icon={IconCard}
          tone="mint"
        />
        <StatCard
          label="Total Revenue"
          value={formatPrice(analytics.revenuePaise)}
          sub="Gross ticket sales"
          icon={IconChart}
          tone="default"
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] text-subtle">
            Quiz &amp; poll performance
          </h4>
          <span className="text-[11px] tabular-nums text-muted">
            {analytics.quizzes.length} question{analytics.quizzes.length === 1 ? '' : 's'}
          </span>
        </div>
        {analytics.quizzes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-xs text-subtle">
            No quizzes configured or answered for this session.
          </p>
        ) : (
          <div className="space-y-2.5">
            {analytics.quizzes.map((q) => {
              const pct = q.answers > 0 ? Math.round((q.correct / q.answers) * 100) : 0;
              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-line bg-panel-2/60 p-3.5 transition hover:border-brand-500/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[13px] font-medium text-fg">{q.question}</span>
                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted">
                      {q.correct}/{q.answers} · {pct}%
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-mint-500 to-mint-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── calendar view ─────────────────────────── */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Local YYYY-MM-DD key so a webinar lands on the day the host sees. */
function dayKey(d: Date) {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const CAL_TONES: Record<string, { chip: string; dot: string }> = {
  LIVE: {
    chip: 'border-red-500/30 bg-red-500/10 text-red-700 hover:border-red-500/60 dark:text-red-300',
    dot: 'bg-red-500',
  },
  SCHEDULED: {
    chip: 'border-brand-500/30 bg-brand-500/10 text-brand-700 hover:border-brand-500/60 dark:text-brand-300',
    dot: 'bg-brand-500',
  },
  DRAFT: {
    chip: 'border-line bg-panel-2 text-muted hover:border-brand-500/40',
    dot: 'bg-slate-400 dark:bg-slate-500',
  },
  ENDED: {
    chip: 'border-line bg-panel-2/60 text-subtle hover:border-line',
    dot: 'bg-slate-300 dark:bg-slate-600',
  },
};

function WebinarCalendar({
  webinars,
  joiningSlug,
  onJoin,
  onOpen,
  onEdit,
  onCreate,
}: {
  webinars: AdminWebinar[];
  joiningSlug: string | null;
  onJoin: (slug: string) => void;
  onOpen: (w: AdminWebinar, tab: Tab) => void;
  onEdit: (w: AdminWebinar) => void;
  onCreate: () => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [activeDay, setActiveDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, AdminWebinar[]>();
    for (const w of webinars) {
      const d = new Date(w.startsAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = dayKey(d);
      const list = map.get(key);
      if (list) list.push(w);
      else map.set(key, [w]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    }
    return map;
  }, [webinars]);

  /** 6×7 grid starting Monday, covering the whole month plus padding days. */
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday = 0
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthWebinars = useMemo(
    () =>
      webinars
        .filter((w) => {
          const d = new Date(w.startsAt);
          return (
            !Number.isNaN(d.getTime()) &&
            d.getFullYear() === cursor.getFullYear() &&
            d.getMonth() === cursor.getMonth()
          );
        })
        .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    [webinars, cursor]
  );

  const upcoming = useMemo(
    () =>
      webinars
        .filter((w) => {
          const d = new Date(w.startsAt);
          return !Number.isNaN(d.getTime()) && d >= new Date(today.getFullYear(), today.getMonth(), today.getDate());
        })
        .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
        .slice(0, 5),
    [webinars, today]
  );

  const todayKey = dayKey(today);
  const shift = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── Month grid ─────────────────────────────────────── */}
      <Card className="min-w-0 overflow-hidden p-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
              <IconCalendarGrid className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13.5px] font-bold leading-tight tracking-tight text-fg">
                {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
              </p>
              <p className="text-[10.5px] font-medium text-subtle">
                {monthWebinars.length} session{monthWebinars.length === 1 ? '' : 's'} this month
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => shift(-1)}
              aria-label="Previous month"
              className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-panel text-subtle transition hover:border-brand-500/40 hover:text-fg"
            >
              <IconChevron className="h-3.5 w-3.5 rotate-180" />
            </button>
            <button
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="h-7 rounded-lg border border-line bg-panel px-2.5 text-[11px] font-semibold text-muted transition hover:border-brand-500/40 hover:text-fg"
            >
              Today
            </button>
            <button
              onClick={() => shift(1)}
              aria-label="Next month"
              className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-panel text-subtle transition hover:border-brand-500/40 hover:text-fg"
            >
              <IconChevron className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-line/70 bg-panel-2/50">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="min-w-0 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-subtle"
            >
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.slice(0, 1)}</span>
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const key = dayKey(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = key === todayKey;
            const items = byDay.get(key) ?? [];
            const isActive = activeDay === key;
            return (
              <div
                key={key + i}
                onClick={() => setActiveDay(isActive ? null : key)}
                className={`relative min-h-[62px] min-w-0 cursor-pointer border-b border-r border-line/50 p-1 transition-colors sm:min-h-[104px] sm:p-1.5 ${
                  inMonth ? 'bg-panel' : 'bg-panel-2/30'
                } ${isActive ? 'ring-1 ring-inset ring-brand-500/40' : 'hover:bg-panel-2/60'}`}
              >
                <div className="flex items-center justify-between gap-0.5">
                  <span
                    className={`grid h-5 min-w-[20px] place-items-center rounded-md px-1 text-[11px] font-bold tabular-nums ${
                      isToday
                        ? 'bg-brand-500 text-white shadow-sm'
                        : inMonth
                          ? 'text-fg'
                          : 'text-subtle'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {items.length > 2 && (
                    <span className="hidden text-[9px] font-bold tabular-nums text-subtle sm:inline">
                      +{items.length - 2}
                    </span>
                  )}
                </div>

                {/* Mobile: compact dots */}
                {items.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                    {items.slice(0, 4).map((w) => {
                      const tone = CAL_TONES[w.status] ?? CAL_TONES.DRAFT;
                      return (
                        <span
                          key={w.id}
                          className={`h-1.5 w-1.5 rounded-full ${tone.dot}`}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Desktop: event chips */}
                <div className="mt-1 hidden space-y-1 sm:block">
                  {items.slice(0, 2).map((w) => {
                    const tone = CAL_TONES[w.status] ?? CAL_TONES.DRAFT;
                    return (
                      <button
                        key={w.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(w, 'registrations');
                        }}
                        title={`${timeLabel(w.startsAt)} · ${w.title}`}
                        className={`flex w-full min-w-0 items-center gap-1 rounded-md border px-1.5 py-[3px] text-left transition ${tone.chip}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold leading-tight">
                          {w.title}
                        </span>
                        <span className="hidden shrink-0 text-[9px] font-medium tabular-nums opacity-70 xl:inline">
                          {timeLabel(w.startsAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line/70 bg-panel-2/40 px-4 py-2.5">
          {(['LIVE', 'SCHEDULED', 'DRAFT', 'ENDED'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">
              <span className={`h-1.5 w-1.5 rounded-full ${CAL_TONES[s].dot}`} />
              {s}
            </span>
          ))}
        </div>
      </Card>

      {/* ── Agenda rail ────────────────────────────────────── */}
      <aside className="min-w-0 space-y-3 xl:sticky xl:top-[92px] xl:self-start">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[12.5px] font-bold tracking-tight text-fg">
              <span className="h-3 w-[2.5px] shrink-0 rounded-full bg-brand-500" />
              Upcoming
            </h3>
            <span className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted">
              {upcoming.length}
            </span>
          </div>

          {upcoming.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-6 text-center text-[11px] text-subtle">
              Nothing scheduled ahead.
            </p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {upcoming.map((w) => {
                const tone = CAL_TONES[w.status] ?? CAL_TONES.DRAFT;
                const d = new Date(w.startsAt);
                return (
                  <button
                    key={w.id}
                    onClick={() => onOpen(w, 'registrations')}
                    className="group flex w-full items-start gap-2.5 rounded-xl border border-line bg-panel-2/50 p-2.5 text-left transition hover:border-brand-500/40 hover:bg-panel-2"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-panel">
                      <span className="text-[9px] font-bold uppercase leading-none text-subtle">
                        {MONTH_NAMES[d.getMonth()].slice(0, 3)}
                      </span>
                      <span className="text-[12px] font-bold leading-none tabular-nums text-fg">
                        {d.getDate()}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold leading-tight text-fg">
                        {w.title}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-subtle">
                        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                        {timeLabel(w.startsAt)} · {w.durationMins}m
                      </span>
                    </span>
                    <IconChevron className="mt-1 h-3 w-3 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="flex items-center gap-2 text-[12.5px] font-bold tracking-tight text-fg">
            <span className="h-3 w-[2.5px] shrink-0 rounded-full bg-mint-500" />
            Quick actions
          </h3>
          <div className="mt-3 space-y-1.5">
            <button
              onClick={onCreate}
              className="flex w-full items-center gap-2 rounded-xl border border-line bg-panel-2/50 px-2.5 py-2 text-[11.5px] font-semibold text-fg transition hover:border-brand-500/40 hover:bg-panel-2"
            >
              <IconPlus className="h-3.5 w-3.5 text-brand-500" />
              Schedule a webinar
            </button>
            {activeDay && (byDay.get(activeDay)?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-line bg-panel-2/50 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-subtle">
                  {new Date(`${activeDay}T00:00:00`).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
                <div className="mt-1.5 space-y-1">
                  {(byDay.get(activeDay) ?? []).map((w) => (
                    <button
                      key={w.id}
                      onClick={() => onOpen(w, 'registrations')}
                      className="block w-full truncate rounded-lg px-1.5 py-1 text-left text-[11px] font-medium text-muted transition hover:bg-panel hover:text-fg"
                    >
                      {timeLabel(w.startsAt)} · {w.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </aside>
    </div>
  );
}
