'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminShell, type NavItem } from '@/components/admin/AdminShell';
import {
  IconArrowRight,
  IconCalendar,
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
  Dialog,
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

const NAV: { key: Tab; label: string; icon: NavItem['icon'] }[] = [
  { key: 'webinars', label: 'Webinars', icon: IconVideo },
  { key: 'registrations', label: 'Registrations', icon: IconUsers },
  { key: 'audience', label: 'Audience', icon: IconSend },
  { key: 'team', label: 'Team', icon: IconUsers },
  { key: 'analytics', label: 'Analytics', icon: IconChart },
  { key: 'engagement', label: 'Engagement', icon: IconSpark },
  { key: 'distribution', label: 'Distribution', icon: IconExternal },
  { key: 'integrations', label: 'Integrations', icon: IconSpark },
  { key: 'payments', label: 'Payments', icon: IconCard },
  { key: 'recordings', label: 'Recordings', icon: IconDisc },
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
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

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

  const subtitle = selected && tab !== 'webinars' ? selected.title : TAB_BLURBS[tab];

  return (
    <AdminShell
      nav={nav}
      active={tab}
      onNavigate={(key) => {
        setTab(key as Tab);
        if (key === 'webinars') setSelected(null);
      }}
      title={TAB_TITLES[tab]}
      subtitle={subtitle}
      user={user ? { name: user.name, role: user.role } : null}
      onSignOut={logout}
      actions={
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

      {tab === 'webinars' ? (
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

      {/* Modal Dialog for Webinar Create / Edit */}
      <Dialog
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        title={editing ? 'Edit webinar' : 'Create new webinar'}
        description="Configure streaming options, access controls, and ticketing."
        maxWidth="2xl"
      >
        <WebinarForm
          initial={initialForm}
          submitLabel={editing ? 'Save changes' : 'Create webinar'}
          busy={formBusy}
          error={formError}
          onSubmit={submitForm}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      </Dialog>
    </AdminShell>
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
  viewMode: 'cards' | 'list';
  onViewMode: (m: 'cards' | 'list') => void;
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
  return (
    <div className="space-y-6">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        />

        {/* Search & View Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search webinars…"
              leftIcon={<IconSearch className="h-4 w-4" />}
            />
          </div>

          <div className="flex items-center rounded-xl border border-line bg-panel p-1">
            <button
              onClick={() => onViewMode('cards')}
              className={`grid h-7 w-7 place-items-center rounded-lg transition ${
                viewMode === 'cards' ? 'bg-brand-500 text-white' : 'text-subtle hover:text-fg'
              }`}
              title="Card grid view"
              aria-label="Card grid view"
            >
              <IconGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => onViewMode('list')}
              className={`grid h-7 w-7 place-items-center rounded-lg transition ${
                viewMode === 'list' ? 'bg-brand-500 text-white' : 'text-subtle hover:text-fg'
              }`}
              title="Compact list view"
              aria-label="Compact list view"
            >
              <IconList className="h-4 w-4" />
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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
      ) : (
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
      )}
    </div>
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
    <Card className="group relative flex flex-col overflow-hidden hover:border-brand-500/40 hover:shadow-pop">
      {/* 16:9 Banner Header */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-panel-2">
        {bannerSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerSrc}
            alt={w.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 bg-gradient-to-b from-black/70 via-black/30 to-transparent">
          <Badge
            variant={statusToBadgeVariant(w.status)}
            size="sm"
            dot
            className="backdrop-blur-md"
          >
            {w.status}
          </Badge>

          {paid ? (
            <span className="rounded-full bg-accent-500/90 px-2 py-0.5 text-[10px] font-bold text-ink-950 shadow-sm backdrop-blur-md">
              {formatPrice(Number(w.settings?.priceInPaise ?? 0))}
            </span>
          ) : (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
              Free
            </span>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3
          onClick={() => onOpen(w, 'registrations')}
          className="cursor-pointer text-[15px] font-bold leading-snug text-fg transition hover:text-brand-500 line-clamp-2"
          title={w.title}
        >
          {w.title}
        </h3>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
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
        <div className="mt-3.5 flex items-center justify-between rounded-xl border border-line bg-panel-2 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-500/10 text-brand-500">
              <IconUsers className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-semibold text-fg">
              {w.registrationCount ?? 0}
            </span>
            <span className="text-[11px] text-muted">registered</span>
          </div>
          <button
            onClick={() => onOpen(w, 'registrations')}
            className="text-[11px] font-bold text-brand-600 dark:text-brand-400 transition hover:underline"
          >
            View list →
          </button>
        </div>

        {/* Primary Action Button Cluster */}
        <div className="mt-4 flex items-center gap-2">
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
        <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onOpen(w, 'analytics')}
              title="Analytics"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-fg hover:bg-panel-2 transition"
            >
              <IconChart className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onOpen(w, 'engagement')}
              title="Engagement"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-fg hover:bg-panel-2 transition"
            >
              <IconSpark className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onOpen(w, 'payments')}
              title="Payments"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-fg hover:bg-panel-2 transition"
            >
              <IconCard className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onOpen(w, 'recordings')}
              title="Recordings"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-fg hover:bg-panel-2 transition"
            >
              <IconDisc className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {w.status === 'DRAFT' && (
              <Button
                size="xs"
                variant="accent"
                onClick={() => onPublish(w)}
              >
                Publish
              </Button>
            )}
            <button
              onClick={() => onEdit(w)}
              title="Edit Settings"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-fg hover:bg-panel-2 transition"
            >
              <IconEdit className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(w)}
              title="Delete Webinar"
              className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition"
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
    <Card className="flex flex-col gap-3 p-3.5 transition hover:border-brand-400/50 hover:shadow-pop md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-xl bg-panel-2 border border-line">
          {bannerSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-brand-500/10 text-brand-500">
              <IconVideo className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant={statusToBadgeVariant(w.status)} size="sm" dot>
              {w.status}
            </Badge>
            {paid && (
              <span className="rounded-full bg-accent-500/15 px-1.5 py-0.5 text-[9px] font-bold text-accent-500">
                {formatPrice(Number(w.settings?.priceInPaise ?? 0))}
              </span>
            )}
            <h4
              onClick={() => onOpen(w, 'registrations')}
              className="cursor-pointer truncate text-sm font-bold text-fg hover:text-brand-500"
            >
              {w.title}
            </h4>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span>{formatDate(w.startsAt)}</span>
            <span>•</span>
            <span>{w.durationMins}m</span>
            <span>•</span>
            <span className="font-semibold text-fg">{w.registrationCount ?? 0} registered</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 self-end md:self-auto shrink-0">
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
          className="px-2"
        >
          {copied ? <IconCheck className="h-3.5 w-3.5 text-mint-500" /> : <IconCopy className="h-3.5 w-3.5" />}
        </Button>

        <Button
          size="xs"
          variant="outline"
          onClick={() => onOpen(w, 'registrations')}
          title="Manage webinar"
          className="px-2"
        >
          <IconUsers className="h-3.5 w-3.5" />
        </Button>

        <button
          onClick={() => onEdit(w)}
          title="Edit"
          className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-fg hover:bg-panel-2 transition"
        >
          <IconEdit className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => onDelete(w)}
          title="Delete"
          className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition"
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
          <Card className="p-6">
            <h2 className="text-sm font-bold text-fg">
              {tab === 'payments' ? 'Webinar Payments & Refunds' : 'Integrations & Webhooks'}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {tab === 'payments'
                ? 'Choose a webinar below to view its transactions and process refunds.'
                : 'Choose a webinar below to configure webhooks, automation cues, and tracking pixels.'}
            </p>
            {webinars.length === 0 ? (
              <EmptyState title="No webinars created yet" className="mt-4" />
            ) : (
              <div className="mt-4 divide-y divide-line">
                {webinars.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => onSelect(w)}
                    className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-panel-2 rounded-xl px-2"
                  >
                    <Badge variant={statusToBadgeVariant(w.status)} size="sm">
                      {w.status}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                      {w.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {w.registrationCount ?? 0} regs
                    </span>
                    <IconChevron className="h-4 w-4 shrink-0 text-subtle" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      );
    }

    return (
      <Card className="p-6">
        <h2 className="text-sm font-bold text-fg">Choose a webinar to view {TAB_TITLES[tab]}</h2>
        <p className="mt-1 text-xs text-muted">
          {TAB_TITLES[tab]} data is scoped to a single session — pick one below to open its dashboard.
        </p>
        {webinars.length === 0 ? (
          <EmptyState title="No webinars created yet" className="mt-4" />
        ) : (
          <div className="mt-4 divide-y divide-line">
            {webinars.map((w) => (
              <button
                key={w.id}
                onClick={() => onSelect(w)}
                className="flex w-full items-center gap-3 py-3.5 text-left transition hover:bg-panel-2 rounded-xl px-2"
              >
                <Badge variant={statusToBadgeVariant(w.status)} size="sm">
                  {w.status}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                  {w.title}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {w.registrationCount ?? 0} registrations
                </span>
                <IconChevron className="h-4 w-4 shrink-0 text-subtle" />
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
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                onClick={onClear}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 transition hover:underline"
              >
                <IconChevron className="h-3 w-3 rotate-180" />
                All webinars
              </button>
              <span className="text-subtle">/</span>
              <span className="truncate text-xs font-medium text-muted">
                {selected.title}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-bold text-fg">{selected.title}</h2>
              <Badge variant={statusToBadgeVariant(selected.status)} size="sm" dot>
                {selected.status}
              </Badge>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>{formatDate(selected.startsAt)}</span>
              <span>•</span>
              <span>{selected.durationMins} minutes</span>
              <span>•</span>
              <span className="font-semibold text-fg">{selected.registrationCount ?? 0} registered</span>
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
        <div className="mt-5 flex gap-1.5 overflow-x-auto border-t border-line/60 pt-4">
          {DETAIL_TABS.map((subItem) => {
            const Icon = subItem.icon;
            const active = tab === subItem.key;
            return (
              <button
                key={subItem.key}
                onClick={() => onTabChange(subItem.key)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  active
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-muted hover:bg-panel-2 hover:text-fg'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-white' : 'text-subtle'}`} />
                <span>{subItem.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Main Scoped Tab Content Panel */}
      <Card className="p-5 sm:p-6">
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
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-wider text-subtle">
            <th className="pb-3 pr-4 font-semibold">Name</th>
            <th className="pb-3 pr-4 font-semibold">Email</th>
            <th className="pb-3 pr-4 font-semibold">Phone</th>
            <th className="pb-3 pr-4 font-semibold">Payment</th>
            <th className="pb-3 pr-4 font-semibold">Attended</th>
            <th className="pb-3 font-semibold">Registered At</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {registrations.map((r) => (
            <tr key={r.id} className="transition hover:bg-panel-2/40">
              <td className="py-3.5 pr-4 font-medium text-fg">{r.name}</td>
              <td className="py-3.5 pr-4 text-muted">{r.email}</td>
              <td className="py-3.5 pr-4 text-subtle font-mono text-xs">{r.phone ?? '—'}</td>
              <td className="py-3.5 pr-4">
                <Badge variant={r.paid ? 'success' : 'default'} size="sm">
                  {r.paid ? 'Paid' : 'Free'}
                </Badge>
              </td>
              <td className="py-3.5 pr-4">
                <Badge variant={r.attended ? 'brand' : 'default'} size="sm">
                  {r.attended ? 'Attended' : 'Absent'}
                </Badge>
              </td>
              <td className="py-3.5 text-xs text-subtle">{formatDate(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">
          Quiz & Poll Performance
        </h4>
        {analytics.quizzes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-xs text-subtle">
            No quizzes configured or answered for this session.
          </p>
        ) : (
          <div className="space-y-3">
            {analytics.quizzes.map((q) => {
              const pct = q.answers > 0 ? Math.round((q.correct / q.answers) * 100) : 0;
              return (
                <div key={q.id} className="rounded-xl border border-line bg-panel-2 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-fg">{q.question}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted font-semibold">
                      {q.correct}/{q.answers} correct ({pct}%)
                    </span>
                  </div>
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-mint-500 transition-all duration-500"
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
