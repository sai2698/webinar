'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Socket } from 'socket.io-client';
import type { QuizOption, CtaForm, CtaFormFieldType, AttachmentInfo } from '@webinar/shared';
import { useRoomStore } from '@/store/roomStore';
import { endpoints } from '@/lib/api';
import { CtaFollowUp } from './CtaFollowUp';
import { GatewayConfigPanel } from './admin/GatewayConfigPanel';
import { webinarRecorder, type WebinarRecorderStatus } from '@/lib/webinarRecorder';

interface AdminQuiz {
  id: string;
  question: string;
  options: QuizOption[];
  correctOptionId: string | null;
  timeLimitSecs: number;
  answerCount: number;
}

interface AdminPoll {
  id: string;
  question: string;
  options: QuizOption[];
  timeLimitSecs: number;
  voteCount: number;
}

interface AdminCta {
  id: string;
  title: string;
  description: string | null;
  buttonText: string;
  priceOverridePaise: number | null;
  externalUrl: string | null;
  course: { title: string; pricePaise: number; currency: string } | null;
  /** How many distinct people have opened this offer. */
  clickCount: number;
  formEnabled: boolean;
  formIntro: string | null;
  formSubmitText: string;
  form: CtaForm | null;
}

type Tab = 'quiz' | 'poll' | 'offer' | 'files' | 'settings';

interface DraftOption {
  id: string;
  text: string;
}

/** One row in the offer form builder. */
interface DraftField {
  key: string;
  label: string;
  type: CtaFormFieldType;
  isRequired: boolean;
  placeholder: string;
  /** Comma-separated in the editor, split into options on save. */
  options: string;
}

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

const FIELD_TYPE_LABELS: Record<CtaFormFieldType, string> = {
  text: 'Short text',
  number: 'Number',
  email: 'Email',
  phone: 'Phone',
  textarea: 'Long text',
  select: 'Dropdown',
  checkbox: 'Checkbox',
};

/**
 * Host/moderator controls for launching quizzes and pushing offers.
 * Only rendered for staff roles.
 */
export function HostPanel({ socket }: { socket: React.RefObject<Socket | null> }) {
  const webinarId = useRoomStore((s) => s.webinarId);
  const role = useRoomStore((s) => s.role);
  const activeQuiz = useRoomStore((s) => s.activeQuiz);
  const quizResults = useRoomStore((s) => s.quizResults);
  const activePoll = useRoomStore((s) => s.activePoll);
  const pollResults = useRoomStore((s) => s.pollResults);
  const activeCta = useRoomStore((s) => s.activeCta);
  /**
   * Live click tallies, pushed by the server on every click.
   *
   * Read from the store rather than from `ctas` because the list is fetched
   * once when the panel opens — a host watching the count needs it to move
   * without reopening the panel.
   */
  const ctaClickCounts = useRoomStore((s) => s.ctaClickCounts);
  const allowParticipantFullscreen = useRoomStore((s) => s.allowParticipantFullscreen);
  const allowMic = useRoomStore((s) => s.allowMic);
  const allowVideo = useRoomStore((s) => s.allowVideo);
  const showParticipantsToEachOther = useRoomStore((s) => s.showParticipantsToEachOther);

  // A moderator runs the room but does not own it: quizzes and offers are
  // theirs to launch, ending the webinar is not. The server enforces this
  // too — hiding the button just avoids offering an action that will fail.
  const canEndWebinar = role === 'HOST' || role === 'ADMIN';

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('quiz');
  const [quizzes, setQuizzes] = useState<AdminQuiz[]>([]);
  const [polls, setPolls] = useState<AdminPoll[]>([]);
  const [ctas, setCtas] = useState<AdminCta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const startedAt = useRoomStore((s) => s.startedAt);
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [lastRecording, setLastRecording] = useState<{ id: string; durationMs: number } | null>(null);
  const [recClientStatus, setRecClientStatus] = useState<WebinarRecorderStatus>({
    isRecording: false,
    recordingId: null,
    durationMs: 0,
    isUploading: false,
    uploadProgress: 0,
    uploadError: null,
    mediaUrl: null,
  });

  useEffect(() => {
    return webinarRecorder.subscribe((st) => setRecClientStatus(st));
  }, []);

  const recording = useRoomStore((s) => s.recording);
  const peers = useRoomStore((s) => s.peers);
  const spotlightedPeerId = useRoomStore((s) => s.spotlightedPeerId);
  const [stageMsg, setStageMsg] = useState<string | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<{
    configured: boolean;
    enabled: boolean;
    active: boolean;
    mode: 'mock' | 'test' | 'live';
  } | null>(null);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [payments, setPayments] = useState<{
    id: string;
    amountPaise: number;
    status: string;
    createdAt: string;
    user: { id: string; name: string; email: string };
    offerTitle?: string;
  }[]>([]);
  const [totalRevenuePaise, setTotalRevenuePaise] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);
  const [secretSaved, setSecretSaved] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [offerSubTab, setOfferSubTab] = useState<'offers' | 'sales'>('offers');
  const [offerSettingsOpen, setOfferSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  /* ── attachments (native presentation) ── */
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const presentation = useRoomStore((s) => s.presentation);

  const refreshGatewayStatus = useCallback(async () => {
    try {
      const res = await endpoints.paymentGateway();
      setGatewayStatus(res.gateway as any);
    } catch {
      // Offline or participant scope without admin access
    }
  }, []);

  const refreshPayments = useCallback(async () => {
    if (!webinarId) return;
    try {
      const [payRes, hookRes] = await Promise.all([
        endpoints.payments(webinarId) as Promise<any>,
        endpoints.webhookInfo(webinarId).catch(() => null),
      ]);
      if (payRes) {
        setPayments(payRes.payments || []);
        setTotalRevenuePaise(payRes.totalPaise || 0);
        setPaymentCount(payRes.count || 0);
      }
      if (hookRes?.webhookUrl) {
        setWebhookUrl(hookRes.webhookUrl);
      }
      if (hookRes?.webhookSecret !== undefined) {
        setWebhookSecret(hookRes.webhookSecret);
      }
    } catch {
      // Offline or error
    }
  }, [webinarId]);

  const handleSaveWebhookSecret = async () => {
    if (!webinarId) return;
    setSavingSecret(true);
    try {
      await endpoints.saveWebhookSecret(webinarId, webhookSecret);
      setSecretSaved(true);
      setTimeout(() => setSecretSaved(false), 2500);
    } catch (err: any) {
      alert(err instanceof Error ? err.message : 'Failed to save webhook secret');
    } finally {
      setSavingSecret(false);
    }
  };

  useEffect(() => {
    if (tab === 'offer') {
      void refreshGatewayStatus();
      void refreshPayments();
    }
  }, [tab, refreshGatewayStatus, refreshPayments]);

  /* ── attachments (native presentation) ─────────────────── */

  const refreshAttachments = useCallback(async () => {
    if (!webinarId) return;
    setAttachmentsLoading(true);
    setAttachmentError(null);
    try {
      const res = await endpoints.attachments(webinarId);
      setAttachments(res.attachments ?? []);
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Could not load files');
    } finally {
      setAttachmentsLoading(false);
    }
  }, [webinarId]);

  useEffect(() => {
    if (tab === 'files') void refreshAttachments();
  }, [tab, refreshAttachments]);

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files?.length || !webinarId) return;
    setAttachmentError(null);
    for (const file of Array.from(files)) {
      setUploadingFile(file.name);
      try {
        const res = await endpoints.uploadAttachment(webinarId, file);
        setAttachments((prev) => [res.attachment, ...prev]);
      } catch (err) {
        setAttachmentError(
          err instanceof Error ? `${file.name}: ${err.message}` : `Could not upload ${file.name}`
        );
      }
    }
    setUploadingFile(null);
  };

  const handlePresent = (att: AttachmentInfo) => {
    const sock = socket.current;
    if (!sock) return;
    sock.emit(
      'presentationStart',
      {
        attachmentId: att.id,
        name: att.name,
        url: att.url,
        kind: att.kind,
        pageCount: att.pageCount,
      },
      (res: { ok: boolean; error?: string }) => {
        if (!res?.ok) setAttachmentError(res?.error ?? 'Could not start presenting');
      }
    );
  };

  const [presentWebsiteUrl, setPresentWebsiteUrl] = useState('');

  useEffect(() => {
    if (presentation?.kind === 'browser') {
      setPresentWebsiteUrl(presentation.url || '');
    }
  }, [presentation?.kind, presentation?.url]);

  const handlePresentWebsite = (e?: React.FormEvent) => {
    e?.preventDefault();
    let target = presentWebsiteUrl.trim();
    const cleanLower = target.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    if (
      !target ||
      target === 'https://' ||
      target === 'http://' ||
      target === 'about:blank' ||
      cleanLower === 'google' ||
      cleanLower === 'google.com' ||
      cleanLower === 'chrome://newtab'
    ) {
      target = '';
    } else if (!/^https?:\/\//i.test(target)) {
      if (!target.includes(' ') && /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(target)) {
        target = 'https://' + target;
      }
    }
    const sock = socket.current;
    if (!sock) return;

    if (presentation?.kind === 'browser') {
      sock.emit('presentationUrl', { url: target });
      return;
    }

    let name = target ? 'Website' : 'Chrome New Tab';
    if (target) {
      try {
        const parsed = new URL(target);
        name = parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname : '');
      } catch {
        name = target.replace(/^https?:\/\//, '').replace(/\/$/, '') || target;
      }
    }
    sock.emit('presentationStart', {
      attachmentId: 'browser-' + Date.now(),
      name,
      url: target,
      kind: 'browser',
      pageCount: 1,
    });
  };

  const handleStopPresenting = () => {
    socket.current?.emit('presentationStop', () => {});
  };

  const handleDeleteAttachment = async (att: AttachmentInfo) => {
    try {
      await endpoints.deleteAttachment(att.id);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
      if (presentation?.attachmentId === att.id) handleStopPresenting();
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Could not delete file');
    }
  };

  useEffect(() => {
    const sock = socket.current;
    if (!sock) return;

    const onPayment = (p: {
      id: string;
      amountPaise: number;
      userName: string;
      userEmail?: string;
      itemTitle: string;
      status: string;
      createdAt: string;
    }) => {
      setToastMessage(`💰 Payment: ${p.userName} paid ₹${(p.amountPaise / 100).toLocaleString('en-IN')} for ${p.itemTitle}!`);
      setTimeout(() => setToastMessage(null), 6000);

      setPayments((prev) => [
        {
          id: p.id,
          amountPaise: p.amountPaise,
          status: p.status,
          createdAt: p.createdAt,
          user: { id: '', name: p.userName, email: p.userEmail || '' },
          offerTitle: p.itemTitle,
        },
        ...prev,
      ]);
      setTotalRevenuePaise((r) => r + p.amountPaise);
      setPaymentCount((c) => c + 1);
    };

    sock.on('paymentReceived' as any, onPayment);
    return () => {
      sock.off('paymentReceived' as any, onPayment);
    };
  }, [socket]);

  /** Speakers the host can put on stage — staff are already visible. */
  const speakers = Object.values(peers).filter((p) => p.isApprovedSpeaker);

  function spotlight(peerId: string | null) {
    if (!socket.current) return;
    setStageMsg(null);
    socket.current.emit(
      'spotlight',
      { peerId },
      (res: { ok: boolean; error?: string }) => {
        if (!res?.ok) setStageMsg(res?.error ?? 'Could not change the spotlight');
      }
    );
  }

  function muteAll() {
    if (!socket.current) return;
    setStageMsg(null);
    socket.current.emit(
      'muteAll',
      (res: { ok: boolean; error?: string; data?: { muted: number } }) => {
        if (!res?.ok) {
          setStageMsg(res?.error ?? 'Could not mute the room');
          return;
        }
        const n = res.data?.muted ?? 0;
        setStageMsg(n === 0 ? 'No speakers to mute' : `Muted ${n} speaker${n === 1 ? '' : 's'}`);
      }
    );
  }

  const load = useCallback(async () => {
    if (!webinarId) return;
    setLoading(true);
    setError(null);
    try {
      const [q, p, c] = await Promise.all([
        endpoints.quizzes(webinarId) as Promise<{ quizzes: AdminQuiz[] }>,
        endpoints.polls(webinarId) as Promise<{ polls: AdminPoll[] }>,
        endpoints.ctas(webinarId) as Promise<{ ctas: AdminCta[] }>,
      ]);
      setQuizzes(q.quizzes);
      setPolls(p.polls);
      setCtas(c.ctas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load engagement assets');
    } finally {
      setLoading(false);
    }
  }, [webinarId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const launch = (quizId: string) => {
    useRoomStore.getState().set({ quizResults: null });
    setQuizzes((prev) =>
      prev.map((q) => (q.id === quizId ? { ...q, answerCount: 0 } : q))
    );
    socket.current?.emit('quizLaunch', { quizId }, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) setError(res?.error ?? 'Could not launch quiz');
    });
  };

  const close = (quizId: string) =>
    socket.current?.emit('quizClose', { quizId }, () => {});

  const launchPoll = (pollId: string) => {
    useRoomStore.getState().set({ pollResults: null });
    setPolls((prev) =>
      prev.map((p) => (p.id === pollId ? { ...p, voteCount: 0 } : p))
    );
    socket.current?.emit('pollLaunch', { pollId }, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) setError(res?.error ?? 'Could not launch poll');
    });
  };

  const closePoll = (pollId: string) =>
    socket.current?.emit('pollClose', { pollId }, () => {});

  useEffect(() => {
    if (quizResults) {
      setQuizzes((prev) =>
        prev.map((q) =>
          q.id === quizResults.quizId ? { ...q, answerCount: quizResults.totalAnswers } : q
        )
      );
    }
  }, [quizResults]);

  useEffect(() => {
    if (pollResults) {
      setPolls((prev) =>
        prev.map((p) =>
          p.id === pollResults.pollId ? { ...p, voteCount: pollResults.totalVotes } : p
        )
      );
    }
  }, [pollResults]);

  const showCta = (ctaId: string, expand = false) =>
    socket.current?.emit('ctaShow', { ctaId, expand }, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) setError(res?.error ?? 'Could not show offer');
    });

  const expandCta = (expand = true) =>
    socket.current?.emit('ctaExpand', { expand }, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) setError(res?.error ?? 'Could not update offer expansion');
    });

  const hideCta = () => socket.current?.emit('ctaHide', () => {});

  /* ── inline authoring ─────────────────────────────────────
   * A host should not have to leave the live room, open the admin console and
   * come back just to write a question. These drafts let them build a quiz, a
   * poll or an offer in place and launch it immediately.
   */
  const [composing, setComposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<DraftOption[]>([
    { id: 'a', text: '' },
    { id: 'b', text: '' },
  ]);
  const [correct, setCorrect] = useState('a');
  const [limit, setLimit] = useState(30);

  const [ctaTitle, setCtaTitle] = useState('');
  const [ctaDesc, setCtaDesc] = useState('');
  const [ctaButton, setCtaButton] = useState('Enroll Now');
  const [ctaPrice, setCtaPrice] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [autoExpandOffer, setAutoExpandOffer] = useState(false);

  /* ── pre-payment form builder ─────────────────────────────
   * The form is what turns a click into a lead. It is authored here, in the
   * same composer as the offer, because a host who has just written the offer
   * is the only person who knows what they need to ask before taking money.
   */
  const [formEnabled, setFormEnabled] = useState(false);
  const [formIntro, setFormIntro] = useState('');
  const [formSubmitText, setFormSubmitText] = useState('Continue to payment');
  const [formFields, setFormFields] = useState<DraftField[]>([]);
  /**
   * The id of the quiz, poll or offer currently loaded into the composer, or
   * null when composing a new one.
   *
   * One piece of state rather than three, because only one tab is visible at a
   * time — a host cannot be editing a quiz and a poll simultaneously, and three
   * parallel flags would only create the question of which one wins.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  /**
   * True when the composer was opened from an offer's "Edit form" button, so
   * only the form is on screen. "Edit offer" loads the whole thing.
   */
  const [formOnly, setFormOnly] = useState(false);
  /**
   * Which offer's follow-up list is open.
   *
   * A separate piece of state from `editingId` because the two are different
   * jobs: one edits what the offer asks, the other reads who answered. Opening
   * one must not disturb the other.
   */
  const [followUpFor, setFollowUpFor] = useState<string | null>(null);
  /** Which row is awaiting a delete confirmation. */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function addField() {
    setFormFields((prev) =>
      prev.length >= 20
        ? prev
        : [
            ...prev,
            {
              key: `f${Date.now()}${prev.length}`,
              label: '',
              type: 'text',
              isRequired: false,
              placeholder: '',
              options: '',
            },
          ]
    );
  }

  function updateField(key: string, patch: Partial<DraftField>) {
    setFormFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function removeField(key: string) {
    setFormFields((prev) => prev.filter((f) => f.key !== key));
  }

  /** Turn the editor rows into the payload the server expects. */
  function formPayload() {
    return {
      formEnabled,
      formIntro: formIntro.trim() || null,
      formSubmitText: formSubmitText.trim() || 'Continue to payment',
      formFields: formFields
        .filter((f) => f.label.trim())
        .map((f) => ({
          label: f.label.trim(),
          type: f.type,
          isRequired: f.isRequired,
          placeholder: f.placeholder.trim() || null,
          // Options only mean something for a dropdown; sending them for a
          // text field would resurrect them if the type is switched back.
          options:
            f.type === 'select'
              ? f.options
                  .split(',')
                  .map((o) => o.trim())
                  .filter(Boolean)
                  .map((o) => ({ label: o, value: o }))
              : undefined,
        })),
    };
  }

  function resetFormDraft() {
    setFormEnabled(false);
    setFormIntro('');
    setFormSubmitText('Continue to payment');
    setFormFields([]);
    setEditingId(null);
    setFormOnly(false);
  }

  /** Load an existing offer's form into the builder. */
  function editForm(cta: AdminCta) {
    setEditingId(cta.id);
    setFormOnly(true);
    setFormEnabled(cta.formEnabled);
    setFormIntro(cta.formIntro ?? '');
    setFormSubmitText(cta.formSubmitText || 'Continue to payment');
    setFormFields(
      (cta.form?.fields ?? []).map((f, i) => ({
        key: `e${i}${f.id}`,
        label: f.label,
        type: f.type,
        isRequired: f.isRequired,
        placeholder: f.placeholder ?? '',
        options: f.options.map((o) => o.label).join(', '),
      }))
    );
    setComposing(true);
    setError(null);
  }

  /** Load a whole offer — copy, price, link and form — into the composer. */
  function editOffer(cta: AdminCta) {
    setEditingId(cta.id);
    setFormOnly(false);
    setCtaTitle(cta.title);
    setCtaDesc(cta.description ?? '');
    setCtaButton(cta.buttonText || 'Enroll Now');
    setCtaPrice(
      cta.priceOverridePaise === null ? '' : String(cta.priceOverridePaise / 100)
    );
    setCtaUrl(cta.externalUrl ?? '');
    setFormEnabled(cta.formEnabled);
    setFormIntro(cta.formIntro ?? '');
    setFormSubmitText(cta.formSubmitText || 'Continue to payment');
    setFormFields(
      (cta.form?.fields ?? []).map((f, i) => ({
        key: `e${i}${f.id}`,
        label: f.label,
        type: f.type,
        isRequired: f.isRequired,
        placeholder: f.placeholder ?? '',
        options: f.options.map((o) => o.label).join(', '),
      }))
    );
    setComposing(true);
    setError(null);
  }

  /** Load a quiz into the composer. */
  function editQuiz(quiz: AdminQuiz) {
    setEditingId(quiz.id);
    setFormOnly(false);
    setQuestion(quiz.question);
    setOptions(quiz.options.map((o) => ({ id: o.id, text: o.text })));
    setCorrect(quiz.correctOptionId ?? quiz.options[0]?.id ?? 'a');
    setLimit(quiz.timeLimitSecs);
    setComposing(true);
    setError(null);
  }

  /** Load a poll into the composer. */
  function editPoll(poll: AdminPoll) {
    setEditingId(poll.id);
    setFormOnly(false);
    setQuestion(poll.question);
    setOptions(poll.options.map((o) => ({ id: o.id, text: o.text })));
    setLimit(poll.timeLimitSecs);
    setComposing(true);
    setError(null);
  }

  async function saveForm() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      await endpoints.updateCta(editingId, formPayload());
      await load();
      setComposing(false);
      resetFormDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the form');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Delete a quiz, poll or offer.
   *
   * The confirmation is inline rather than a `window.confirm` because the panel
   * is a portal over a live room — a native dialog would steal focus from the
   * call and, on some browsers, drop the socket's audio context.
   */
  async function removeRow(kind: Tab, id: string) {
    setDeleting(true);
    setError(null);
    try {
      if (kind === 'quiz') await endpoints.deleteQuiz(id);
      else if (kind === 'poll') await endpoints.deletePoll(id);
      else await endpoints.deleteCta(id);
      setConfirmDelete(null);
      // A deleted offer cannot stay on screen for the room.
      if (kind === 'offer' && activeCta?.id === id) hideCta();
      if (followUpFor === id) setFollowUpFor(null);
      if (editingId === id) {
        setComposing(false);
        resetDraft();
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete it');
    } finally {
      setDeleting(false);
    }
  }

  const resetDraft = useCallback(() => {
    setQuestion('');
    setOptions([
      { id: 'a', text: '' },
      { id: 'b', text: '' },
    ]);
    setCorrect('a');
    // A quiz needs a countdown; a poll is usually left open until the host
    // closes it, so the two tabs get different defaults.
    setLimit(tab === 'poll' ? 0 : 30);
    setCtaTitle('');
    setCtaDesc('');
    setCtaButton('Enroll Now');
    setCtaPrice('');
    setCtaUrl('');
    setAutoExpandOffer(false);
    resetFormDraft();
    setError(null);
  }, [tab]);
  useEffect(() => {
    setComposing(false);
    resetDraft();
  }, [tab, resetDraft]);

  function setOptionText(index: number, text: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, text } : o)));
  }

  function addOption() {
    setOptions((prev) =>
      prev.length >= 6 ? prev : [...prev, { id: LETTERS[prev.length], text: '' }]
    );
  }

  function removeOption(index: number) {
    setOptions((prev) => {
      if (prev.length <= 2) return prev;
      // Re-letter so ids stay contiguous — the tally and the correct-answer
      // marker both key off these.
      const next = prev.filter((_, i) => i !== index).map((o, i) => ({ ...o, id: LETTERS[i] }));
      if (!next.some((o) => o.id === correct)) setCorrect(next[0].id);
      return next;
    });
  }

  /** Shared validation for the quiz and poll composers. */
  function draftOptions(): DraftOption[] | null {
    const filled = options.map((o) => ({ id: o.id, text: o.text.trim() })).filter((o) => o.text);
    if (question.trim().length < 3) {
      setError('Write a question first.');
      return null;
    }
    if (filled.length < 2) {
      setError('Add at least two options.');
      return null;
    }
    return filled;
  }

  async function createQuiz() {
    if (!webinarId) return;
    const opts = draftOptions();
    if (!opts) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        question: question.trim(),
        options: opts,
        correctOptionId: opts.some((o) => o.id === correct) ? correct : opts[0].id,
        timeLimitSecs: limit,
      };

      // Editing saves in place and does NOT relaunch: the host is fixing a
      // typo, not asking the room to answer again.
      if (editingId) {
        await endpoints.updateQuiz(editingId, payload);
        await load();
        setComposing(false);
        resetDraft();
        return;
      }

      const res = (await endpoints.createQuiz(webinarId, payload)) as {
        quiz?: { id?: string };
      };
      await load();
      setComposing(false);
      resetDraft();
      // Creating a quiz mid-session is almost always followed by launching it,
      // so do both — the host can still close it from the list.
      if (res.quiz?.id) launch(res.quiz.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the quiz');
    } finally {
      setSaving(false);
    }
  }

  async function createPoll() {
    if (!webinarId) return;
    const opts = draftOptions();
    if (!opts) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        question: question.trim(),
        options: opts,
        // 0 means "stay open until I close it", which is the sane default for
        // a poll asked mid-session.
        timeLimitSecs: limit,
      };

      if (editingId) {
        await endpoints.updatePoll(editingId, payload);
        await load();
        setComposing(false);
        resetDraft();
        return;
      }

      const res = (await endpoints.createPoll(webinarId, payload)) as {
        poll?: { id?: string };
      };
      await load();
      setComposing(false);
      resetDraft();
      if (res.poll?.id) launchPoll(res.poll.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the poll');
    } finally {
      setSaving(false);
    }
  }

  async function createOffer() {
    if (!webinarId) return;
    if (ctaTitle.trim().length < 2) {
      setError('Give the offer a title.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rupees = Number(ctaPrice);
      const payload = {
        title: ctaTitle.trim(),
        description: ctaDesc.trim() || undefined,
        buttonText: ctaButton.trim() || 'Enroll Now',
        priceOverridePaise:
          ctaPrice.trim() && Number.isFinite(rupees) && rupees >= 0
            ? Math.round(rupees * 100)
            : undefined,
        externalUrl: ctaUrl.trim() || undefined,
        ...formPayload(),
      };

      // Editing an offer must not re-push it to the room: the host may be
      // correcting a price, and flashing the card at everyone would be noise.
      if (editingId) {
        await endpoints.updateCta(editingId, payload);
        await load();
        setComposing(false);
        resetDraft();
        return;
      }

      const res = (await endpoints.createCta(webinarId, payload)) as {
        cta?: { id?: string };
      };
      await load();
      setComposing(false);
      resetDraft();
      if (res.cta?.id) showCta(res.cta.id, autoExpandOffer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the offer');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Starts or stops capture. The server broadcasts `recordingState`, which the
   * store already listens for, so the button label follows the real state
   * rather than a local guess — two hosts in the same room stay in sync.
   */
  function toggleRecording() {
    if (!socket.current) return;
    setRecBusy(true);
    setRecError(null);

    if (recording || webinarRecorder.isRecording) {
      socket.current.emit(
        'recordingStop',
        (res: {
          ok: boolean;
          error?: string;
          data?: { recordingId: string; durationMs: number };
        }) => {
          setRecBusy(false);
          if (!res?.ok) {
            setRecError(res?.error ?? 'Could not stop recording');
            return;
          }
          // Stop client recorder AFTER server confirms — this triggers the upload
          void webinarRecorder.stop();
          if (res.data?.recordingId) {
            setLastRecording({
              id: res.data.recordingId,
              durationMs: res.data.durationMs ?? 0,
            });
          }
        }
      );
      return;
    }

    socket.current.emit(
      'recordingStart',
      (res: { ok: boolean; error?: string; data?: { recordingId: string } }) => {
        setRecBusy(false);
        if (!res?.ok) {
          setRecError(res?.error ?? 'Could not start recording');
          return;
        }
        setLastRecording(null);
        if (res.data?.recordingId) {
          webinarRecorder.start(res.data.recordingId);
        }
      }
    );
  }

  function endWebinar() {
    if (!socket.current) return;
    setEnding(true);
    // If client recorder is running, stop and upload before ending
    if (recording || webinarRecorder.isRecording) {
      void webinarRecorder.stop();
    }
    socket.current.emit('webinarEnd', (res: { ok: boolean; error?: string }) => {
      setEnding(false);
      if (!res?.ok) {
        setError(res?.error ?? 'Could not end the webinar');
        return;
      }
      setConfirmEnd(false);
      setOpen(false);
    });
  }

  /**
   * Opens the session for everyone waiting in the room.
   *
   * Until this is pressed, participants see a waiting screen rather than an
   * empty stage — which is the point: the host gets to check their camera and
   * slides without an audience watching them do it.
   */
  function startWebinar() {
    if (!socket.current) return;
    setStarting(true);
    setStartError(null);
    socket.current.emit(
      'webinarStart',
      (res: { ok: boolean; error?: string }) => {
        setStarting(false);
        if (!res?.ok) setStartError(res?.error ?? 'Could not start the webinar');
      }
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold tracking-tight text-slate-700 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-slate-900 active:scale-[0.98] dark:text-slate-300 dark:hover:text-white"
        aria-label="Host tools"
        title="Host tools"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Host tools</span>
      </button>

      {open &&
        createPortal(
          // A right-anchored drawer rather than a centred modal: the host is
          // running a live room, and a dialog over the middle of the stage
          // hides the very thing they are reacting to. The portal target is
          // still `document.body` because the room layout has `backdrop-filter`
          // ancestors, which would otherwise trap a `fixed` child.
          <div className="fixed inset-0 z-40 flex justify-end">
            {/* Click-away backdrop, a sibling rather than a wrapper so the
                panel itself is never inside the click target. */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close host tools"
              tabIndex={-1}
              className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
            />

            <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/[0.07] bg-white dark:bg-ink-900 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-500 ring-1 ring-brand-500/25 dark:text-brand-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white">Host tools</h2>
                  <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                    Run the room — quizzes, polls, offers, stage
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-900 dark:hover:text-white"
                aria-label="Close host tools"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.07] bg-slate-100/80 p-1.5 dark:bg-ink-950/40">
              {(['quiz', 'poll', 'offer', 'files'] as Tab[]).map((t) => {
                // Each tab carries its own tally and a live dot, so the host can
                // see at a glance that a poll is still running or that an offer
                // is on screen without opening the tab to check.
                const count =
                  t === 'quiz'
                    ? quizzes.length
                    : t === 'poll'
                      ? polls.length
                      : t === 'offer'
                        ? ctas.length
                        : attachments.length;
                const live =
                  t === 'quiz'
                    ? Boolean(activeQuiz)
                    : t === 'poll'
                      ? Boolean(activePoll)
                      : t === 'offer'
                        ? Boolean(activeCta)
                        : Boolean(presentation);
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setTab(t);
                      // Leaving the Offers tab must drop the follow-up view,
                      // otherwise coming back lands on a stale list for an offer
                      // the host was no longer looking at.
                      setFollowUpFor(null);
                    }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-tight transition ${
                      tab === t
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/[0.08] dark:bg-white/[0.09] dark:text-white dark:ring-white/10'
                        : 'text-slate-500 hover:bg-white hover:text-slate-700 dark:hover:bg-white/[0.04] dark:hover:text-slate-300'
                    }`}
                  >
                    <span>
                      {t === 'quiz'
                        ? 'Quizzes'
                        : t === 'poll'
                          ? 'Polls'
                          : t === 'offer'
                            ? 'Offers'
                            : 'Files'}
                    </span>
                    <span
                      className={`rounded px-1 py-px text-[9px] font-bold tabular-nums ${
                        tab === t
                          ? 'bg-brand-500/20 text-brand-600 dark:bg-brand-500/25 dark:text-brand-200'
                          : 'bg-slate-200/70 text-slate-600 dark:bg-white/[0.06] dark:text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                    {live && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-mint-500 dark:bg-mint-400"
                        title="Live right now"
                        aria-label="Live right now"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="scrollbar-thin flex-1 overflow-y-auto p-3.5">
              {error && (
                <p className="mb-3 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-[11px] font-medium text-red-600 dark:text-red-300">
                  {error}
                </p>
              )}

              {loading && <p className="py-6 text-center text-[11px] text-slate-500">Loading…</p>}

              {/* ── inline composer ─────────────────────── */}
              {!loading && tab !== 'files' && (
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="h-1 w-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-600" />
                    <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {composing
                        ? tab === 'offer'
                          ? editingId
                            ? formOnly
                              ? 'Edit form'
                              : 'Edit offer'
                            : 'New offer'
                          : editingId
                            ? tab === 'poll'
                              ? 'Edit poll'
                              : 'Edit quiz'
                            : tab === 'poll'
                              ? 'New poll'
                              : 'New quiz'
                        : tab === 'offer'
                          ? `${ctas.length} offer${ctas.length === 1 ? '' : 's'}`
                          : tab === 'poll'
                            ? `${polls.length} poll${polls.length === 1 ? '' : 's'}`
                            : `${quizzes.length} quiz${quizzes.length === 1 ? '' : 'zes'}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {tab === 'offer' && !composing && (
                      <button
                        type="button"
                        onClick={() => setOfferSettingsOpen((v) => !v)}
                        aria-expanded={offerSettingsOpen}
                        aria-label={offerSettingsOpen ? 'Hide payment settings' : 'Show payment settings'}
                        title={offerSettingsOpen ? 'Hide payment settings' : 'Show payment settings'}
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border transition active:scale-[0.96] ${
                          offerSettingsOpen
                            ? 'border-brand-500/40 bg-brand-500/15 text-brand-600 dark:text-brand-300'
                            : 'border-white/10 bg-white/[0.03] text-slate-500 hover:bg-white/[0.07] hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setComposing((v) => !v);
                        resetDraft();
                      }}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold tracking-tight transition active:scale-[0.98] ${
                        composing
                          ? 'border-white/10 bg-white/[0.03] text-slate-500 hover:bg-white/[0.07] hover:text-slate-700 dark:hover:text-slate-200'
                          : 'border-brand-500/30 bg-brand-500/15 text-brand-600 shadow-sm hover:bg-brand-500/25 dark:text-brand-300'
                      }`}
                    >
                      {composing ? (
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                        </svg>
                      )}
                      {composing ? 'Cancel' : 'New'}
                    </button>
                  </div>
                </div>
              )}

              {!loading && composing && tab !== 'offer' && (
                <div className="animate-fade-in space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-500/15 text-brand-500 ring-1 ring-brand-500/25 dark:text-brand-300">
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        {tab === 'poll' ? (
                          <path d="M6 20V10M12 20V4M18 20v-7" strokeLinecap="round" />
                        ) : (
                          <path d="M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                      </svg>
                    </span>
                    <p className="text-[11px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                      {editingId
                        ? tab === 'poll'
                          ? 'Edit poll'
                          : 'Edit quiz'
                        : tab === 'poll'
                          ? 'New poll'
                          : 'New quiz'}
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500" htmlFor="draft-question">
                      Question
                    </label>
                    <input
                      id="draft-question"
                      className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="What should we cover next?"
                      maxLength={500}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Options</label>
                      <span className="text-[9px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
                        {options.length}/6
                      </span>
                    </div>
                    {options.map((opt, i) => (
                      <div
                        key={opt.id}
                        className="group/opt flex items-center gap-1.5 rounded-md border border-transparent transition hover:border-white/[0.06] hover:bg-white/[0.02]"
                      >
                        {tab === 'quiz' ? (
                          <button
                            type="button"
                            onClick={() => setCorrect(opt.id)}
                            title="Mark as the correct answer"
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold transition ${
                              correct === opt.id
                                ? 'bg-mint-500 text-ink-950 shadow-sm ring-1 ring-mint-400/50'
                                : 'bg-white/[0.08] text-slate-400 hover:bg-white/[0.14] hover:text-slate-600 dark:hover:text-slate-200'
                            }`}
                          >
                            {opt.id.toUpperCase()}
                          </button>
                        ) : (
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/[0.08] text-[10px] font-bold text-slate-400">
                            {opt.id.toUpperCase()}
                          </span>
                        )}
                        <input
                          className="w-full flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                          value={opt.text}
                          onChange={(e) => setOptionText(i, e.target.value)}
                          placeholder={`Option ${opt.id.toUpperCase()}`}
                          maxLength={200}
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(i)}
                          disabled={options.length <= 2}
                          className="shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 disabled:opacity-0 group-hover/opt:opacity-100"
                          aria-label={`Remove option ${opt.id.toUpperCase()}`}
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {options.length < 6 && (
                      <button
                        type="button"
                        onClick={addOption}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-white/[0.12] px-2 py-1 text-[10px] font-semibold tracking-tight text-slate-500 transition hover:border-brand-500/40 hover:text-brand-500 dark:hover:text-brand-300"
                      >
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                        </svg>
                        Add option
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500" htmlFor="draft-limit">
                      {tab === 'poll' ? 'Time limit (0 = open until closed)' : 'Time limit (seconds)'}
                    </label>
                    <input
                      id="draft-limit"
                      type="number"
                      className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs tabular-nums text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                      min={tab === 'poll' ? 0 : 5}
                      max={tab === 'poll' ? 3600 : 300}
                    />
                  </div>

                  {tab === 'quiz' && (
                    <p className="flex items-start gap-1.5 rounded-md border border-mint-500/20 bg-mint-500/[0.06] px-2.5 py-1.5 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
                      <svg viewBox="0 0 24 24" className="mt-px h-3 w-3 shrink-0 text-mint-500 dark:text-mint-400" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>
                        Tap a letter to mark the correct answer — currently{' '}
                        <span className="font-semibold text-mint-600 dark:text-mint-400">{correct.toUpperCase()}</span>.
                      </span>
                    </p>
                  )}

                  <button
                    onClick={tab === 'poll' ? createPoll : createQuiz}
                    disabled={saving}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-brand-400 to-brand-600 py-1.5 text-[11px] font-semibold tracking-tight text-white shadow-sm transition hover:from-brand-300 hover:to-brand-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {saving
                      ? 'Saving…'
                      : editingId
                        ? 'Save changes'
                        : tab === 'poll'
                          ? 'Create & launch poll'
                          : 'Create & launch quiz'}
                  </button>
                </div>
              )}

              {!loading && composing && tab === 'offer' && (
                <div className="animate-fade-in space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent-500/15 text-accent-600 ring-1 ring-accent-500/25 dark:text-accent-400">
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 7h18M3 12h18M3 17h10" strokeLinecap="round" />
                      </svg>
                    </span>
                    <p className="text-[11px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                      {editingId ? (formOnly ? 'Edit form' : 'Edit offer') : 'New offer'}
                    </p>
                  </div>
                  {editingId && (
                    <p className="rounded-md border border-brand-500/20 bg-brand-500/[0.08] px-2.5 py-1.5 text-[10px] font-medium text-brand-600 dark:text-brand-200">
                      {formOnly
                        ? 'Editing the form on an existing offer. The offer itself is unchanged.'
                        : 'Editing an existing offer. Saving updates it in place — it is not re-shown to the room.'}
                    </p>
                  )}
                  {!formOnly && (
                    <>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500" htmlFor="draft-cta-title">
                      Title
                    </label>
                    <input
                      id="draft-cta-title"
                      className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                      value={ctaTitle}
                      onChange={(e) => setCtaTitle(e.target.value)}
                      placeholder="Enroll in the full course"
                      maxLength={160}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500" htmlFor="draft-cta-desc">
                      Description
                    </label>
                    <textarea
                      id="draft-cta-desc"
                      className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                      rows={2}
                      value={ctaDesc}
                      onChange={(e) => setCtaDesc(e.target.value)}
                      placeholder="What do they get?"
                      maxLength={1000}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500" htmlFor="draft-cta-button">
                        Button text
                      </label>
                      <input
                        id="draft-cta-button"
                        className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                        value={ctaButton}
                        onChange={(e) => setCtaButton(e.target.value)}
                        maxLength={40}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500" htmlFor="draft-cta-price">
                        Price (₹)
                      </label>
                      <input
                        id="draft-cta-price"
                        type="number"
                        className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs tabular-nums text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                        value={ctaPrice}
                        onChange={(e) => setCtaPrice(e.target.value)}
                        placeholder="4999"
                        min={0}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500" htmlFor="draft-cta-url">
                      External link (optional)
                    </label>
                    <input
                      id="draft-cta-url"
                      className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                      value={ctaUrl}
                      onChange={(e) => setCtaUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </div>
                    </>
                  )}

                  {/* ── pre-payment form ──────────────────────── */}
                  <div className="rounded-md border border-white/[0.08] bg-white/[0.02] p-2.5">
                    <label className="flex cursor-pointer items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold tracking-tight text-slate-800 dark:text-slate-200">
                        Ask a form before payment
                      </span>
                      <input
                        type="checkbox"
                        checked={formEnabled}
                        onChange={(e) => setFormEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-white/5 accent-brand-500"
                      />
                    </label>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                      The card stays collapsed until someone clicks. Only then does the form
                      appear, so you are asking details of people who already want it.
                    </p>

                    {formEnabled && (
                      <div className="mt-3 space-y-2.5">
                        <div>
                          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500" htmlFor="draft-cta-form-intro">
                            Intro (optional)
                          </label>
                          <textarea
                            id="draft-cta-form-intro"
                            className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                            rows={2}
                            value={formIntro}
                            onChange={(e) => setFormIntro(e.target.value)}
                            placeholder="We just need a few details to send your access."
                            maxLength={500}
                          />
                        </div>

                        {formFields.map((field, i) => (
                          <div
                            key={field.key}
                            className="space-y-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] p-2"
                          >
                            <div className="flex items-center gap-1.5">
                              <input
                                className="w-full flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                                value={field.label}
                                onChange={(e) => updateField(field.key, { label: e.target.value })}
                                placeholder={`Question ${i + 1}`}
                                maxLength={120}
                              />
                              <button
                                onClick={() => removeField(field.key)}
                                aria-label="Remove field"
                                className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                              >
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                                </svg>
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <select
                                className="w-full flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-slate-900 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                                value={field.type}
                                onChange={(e) =>
                                  updateField(field.key, {
                                    type: e.target.value as CtaFormFieldType,
                                  })
                                }
                              >
                                {(Object.keys(FIELD_TYPE_LABELS) as CtaFormFieldType[]).map((t) => (
                                  <option key={t} value={t}>
                                    {FIELD_TYPE_LABELS[t]}
                                  </option>
                                ))}
                              </select>
                              <label className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                <input
                                  type="checkbox"
                                  checked={field.isRequired}
                                  onChange={(e) =>
                                    updateField(field.key, { isRequired: e.target.checked })
                                  }
                                  className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-brand-500"
                                />
                                Required
                              </label>
                            </div>
                            {field.type === 'select' && (
                              <input
                                className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                                value={field.options}
                                onChange={(e) => updateField(field.key, { options: e.target.value })}
                                placeholder="Options, comma separated"
                              />
                            )}
                            <input
                              className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                              value={field.placeholder}
                              onChange={(e) =>
                                updateField(field.key, { placeholder: e.target.value })
                              }
                              placeholder="Placeholder (optional)"
                              maxLength={160}
                            />
                          </div>
                        ))}

                        <button
                          onClick={addField}
                          disabled={formFields.length >= 20}
                          className="w-full rounded-md border border-dashed border-white/[0.12] py-1 text-[10px] font-semibold tracking-tight text-slate-500 transition hover:border-brand-500/40 hover:text-brand-500 disabled:opacity-40 dark:hover:text-brand-300"
                        >
                          + Add field
                        </button>

                        <div>
                          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500" htmlFor="draft-cta-form-submit">
                            Submit button text
                          </label>
                          <input
                            id="draft-cta-form-submit"
                            className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 dark:bg-ink-900/70 dark:text-slate-100"
                            value={formSubmitText}
                            onChange={(e) => setFormSubmitText(e.target.value)}
                            maxLength={40}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {!formOnly && !editingId && (
                    <label className="flex cursor-pointer items-center gap-2 pt-1 text-[11px] text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={autoExpandOffer}
                        onChange={(e) => setAutoExpandOffer(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 accent-accent-500 dark:border-white/20"
                      />
                      Expand offer automatically at participant end
                    </label>
                  )}

                  <button
                    onClick={formOnly ? saveForm : createOffer}
                    disabled={saving}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-b from-brand-400 to-brand-600 py-1.5 text-[11px] font-semibold tracking-tight text-white shadow-sm transition hover:from-brand-300 hover:to-brand-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {saving
                      ? 'Saving…'
                      : formOnly
                        ? 'Save form'
                        : editingId
                          ? 'Save changes'
                          : 'Create & show offer'}
                  </button>
                </div>
              )}

              {!loading && !composing && tab === 'quiz' && (
                <div className="space-y-2">
                  {quizzes.length === 0 && (
                    <div className="space-y-2 py-8 text-center">
                      <span className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.08]">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <p className="text-[11px] font-semibold tracking-tight text-slate-800 dark:text-slate-200">
                        No quizzes yet
                      </p>
                      <p className="mx-auto max-w-[15rem] text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                        Write a question with up to six options and launch it to the room instantly.
                      </p>
                    </div>
                  )}
                  {quizzes.map((q) => {
                    const isLive = activeQuiz?.id === q.id;
                    return (
                      <div
                        key={q.id}
                        className={`group/row relative overflow-hidden rounded-lg border bg-white/[0.02] p-3 pl-3.5 transition ${
                          isLive
                            ? 'border-mint-500/35 bg-mint-500/[0.05] shadow-[0_0_0_1px_rgba(34,197,94,0.12)]'
                            : 'border-white/[0.08] hover:border-white/[0.14] hover:bg-white/[0.04]'
                        }`}
                      >
                        <span
                          className={`absolute inset-y-0 left-0 w-[2px] ${
                            isLive ? 'bg-mint-500 dark:bg-mint-400' : 'bg-transparent'
                          }`}
                          aria-hidden
                        />
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-xs font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100">
                            {q.question}
                          </p>
                          {isLive && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-mint-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-mint-600 dark:text-mint-400">
                              <span className="h-1 w-1 rounded-full bg-mint-500 dark:bg-mint-400" />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="rounded bg-white/[0.05] px-1.5 py-px text-[9px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                            {q.options.length} options
                          </span>
                          <span className="rounded bg-white/[0.05] px-1.5 py-px text-[9px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                            {q.timeLimitSecs}s
                          </span>
                          <span className="rounded bg-brand-500/10 px-1.5 py-px text-[9px] font-semibold tabular-nums text-brand-600 dark:text-brand-300">
                            {isLive
                              ? 0
                              : quizResults?.quizId === q.id
                              ? quizResults.totalAnswers
                              : q.answerCount}{' '}
                            answers
                          </span>
                        </div>
                        <div className="mt-2.5 flex gap-1.5">
                          {isLive ? (
                            <button
                              onClick={() => close(q.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold tracking-tight text-slate-700 transition hover:bg-white/[0.09] active:scale-[0.98] dark:text-slate-200"
                            >
                              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="6" y="6" width="12" height="12" rx="1.5" />
                              </svg>
                              Close quiz
                            </button>
                          ) : (
                            <button
                              onClick={() => launch(q.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-brand-400 to-brand-600 px-2 py-1 text-[10px] font-semibold tracking-tight text-white shadow-sm transition hover:from-brand-300 hover:to-brand-500 active:scale-[0.98]"
                            >
                              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                                <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                              </svg>
                              Launch
                            </button>
                          )}
                        </div>
                        <RowActions
                          id={q.id}
                          editLabel="Edit quiz"
                          busy={deleting}
                          confirming={confirmDelete === q.id}
                          onEdit={() => editQuiz(q)}
                          onAskDelete={() => setConfirmDelete(q.id)}
                          onCancelDelete={() => setConfirmDelete(null)}
                          onDelete={() => void removeRow('quiz', q.id)}
                        />
                      </div>
                    );
                  })}

                  {quizResults && (
                    <div className="mt-3 rounded-lg border border-brand-500/25 bg-brand-500/[0.08] p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold tracking-tight text-brand-600 dark:text-brand-200">
                          Results for “{quizResults.question}”
                        </p>
                        <button
                          type="button"
                          onClick={() => useRoomStore.getState().set({ quizResults: null })}
                          className="rounded p-0.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-600 dark:hover:text-slate-200"
                          title="Dismiss results"
                          aria-label="Dismiss results"
                        >
                          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                        {quizResults.correctCount}/{quizResults.totalAnswers} correct
                      </p>
                      <ul className="mt-2 space-y-1">
                        {Object.entries(quizResults.distribution).map(([optId, count]) => (
                          <li key={optId} className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400">
                            <span className="w-4 font-mono text-slate-500">{optId}</span>
                            <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                              <span
                                className="block h-full rounded-full bg-brand-500"
                                style={{
                                  width: `${
                                    quizResults.totalAnswers
                                      ? (count / quizResults.totalAnswers) * 100
                                      : 0
                                  }%`,
                                }}
                              />
                            </span>
                            <span className="w-6 text-right tabular-nums">{count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!loading && !composing && tab === 'poll' && (
                <div className="space-y-2">
                  {polls.length === 0 && (
                    <div className="space-y-2 py-8 text-center">
                      <span className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.08]">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 20V10M12 20V4M18 20v-7" strokeLinecap="round" />
                        </svg>
                      </span>
                      <p className="text-[11px] font-semibold tracking-tight text-slate-800 dark:text-slate-200">
                        No polls yet
                      </p>
                      <p className="mx-auto max-w-[15rem] text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                        Ask the room a question and watch votes land live as they come in.
                      </p>
                    </div>
                  )}
                  {polls.map((p) => {
                    const isLive = activePoll?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`group/row relative overflow-hidden rounded-lg border bg-white/[0.02] p-3 pl-3.5 transition ${
                          isLive
                            ? 'border-accent-500/35 bg-accent-500/[0.05] shadow-[0_0_0_1px_rgba(245,158,11,0.12)]'
                            : 'border-white/[0.08] hover:border-white/[0.14] hover:bg-white/[0.04]'
                        }`}
                      >
                        <span
                          className={`absolute inset-y-0 left-0 w-[2px] ${
                            isLive ? 'bg-accent-500 dark:bg-accent-400' : 'bg-transparent'
                          }`}
                          aria-hidden
                        />
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-xs font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100">
                            {p.question}
                          </p>
                          {isLive && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-accent-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-accent-600 dark:text-accent-400">
                              <span className="h-1 w-1 rounded-full bg-accent-500 dark:bg-accent-400" />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="rounded bg-white/[0.05] px-1.5 py-px text-[9px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                            {p.options.length} options
                          </span>
                          <span className="rounded bg-white/[0.05] px-1.5 py-px text-[9px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                            {p.timeLimitSecs > 0 ? `${p.timeLimitSecs}s` : 'open until closed'}
                          </span>
                          <span className="rounded bg-accent-500/10 px-1.5 py-px text-[9px] font-semibold tabular-nums text-accent-600 dark:text-accent-400">
                            {isLive && pollResults
                              ? pollResults.totalVotes
                              : pollResults && pollResults.pollId === p.id
                              ? pollResults.totalVotes
                              : isLive
                              ? 0
                              : p.voteCount}{' '}
                            votes
                          </span>
                        </div>
                        <div className="mt-2.5 flex gap-1.5">
                          {isLive ? (
                            <button
                              onClick={() => closePoll(p.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold tracking-tight text-slate-700 transition hover:bg-white/[0.09] active:scale-[0.98] dark:text-slate-200"
                            >
                              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="6" y="6" width="12" height="12" rx="1.5" />
                              </svg>
                              Close poll
                            </button>
                          ) : (
                            <button
                              onClick={() => launchPoll(p.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-brand-400 to-brand-600 px-2 py-1 text-[10px] font-semibold tracking-tight text-white shadow-sm transition hover:from-brand-300 hover:to-brand-500 active:scale-[0.98]"
                            >
                              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                                <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                              </svg>
                              Launch
                            </button>
                          )}
                        </div>
                        <RowActions
                          id={p.id}
                          editLabel="Edit poll"
                          busy={deleting}
                          confirming={confirmDelete === p.id}
                          onEdit={() => editPoll(p)}
                          onAskDelete={() => setConfirmDelete(p.id)}
                          onCancelDelete={() => setConfirmDelete(null)}
                          onDelete={() => void removeRow('poll', p.id)}
                        />
                      </div>
                    );
                  })}

                  {pollResults && (
                    <div className="mt-3 rounded-lg border border-accent-500/25 bg-accent-500/[0.08] p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold tracking-tight text-accent-600 dark:text-accent-400">
                          {pollResults.closed ? 'Final tally' : 'Live tally'}
                        </p>
                        <button
                          type="button"
                          onClick={() => useRoomStore.getState().set({ pollResults: null })}
                          className="rounded p-0.5 text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-600 dark:hover:text-slate-200"
                          title="Dismiss results"
                          aria-label="Dismiss results"
                        >
                          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                        {pollResults.totalVotes}{' '}
                        {pollResults.totalVotes === 1 ? 'vote' : 'votes'}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {pollResults.options.map((opt) => {
                          const count = pollResults.distribution[opt.id] ?? 0;
                          return (
                            <li
                              key={opt.id}
                              className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400"
                            >
                              <span className="w-4 font-mono text-slate-500">
                                {opt.id.toUpperCase()}
                              </span>
                              <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                                <span
                                  className="block h-full rounded-full bg-accent-500"
                                  style={{
                                    width: `${
                                      pollResults.totalVotes
                                        ? (count / pollResults.totalVotes) * 100
                                        : 0
                                    }%`,
                                  }}
                                />
                              </span>
                              <span className="w-6 text-right tabular-nums">{count}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!loading && !composing && tab === 'offer' && followUpFor && (
                <CtaFollowUp ctaId={followUpFor} onClose={() => setFollowUpFor(null)} />
              )}

              {/* ── files (native presentation) ─────────── */}
              {tab === 'files' && (
                <div className="space-y-3">
                  {attachmentError && (
                    <p className="rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-[11px] font-medium text-red-600 dark:text-red-300">
                      {attachmentError}
                    </p>
                  )}

                  {presentation && (
                    <div className="flex items-center gap-2.5 rounded-lg border border-mint-500/30 bg-mint-500/[0.08] px-3 py-2">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint-500 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-mint-500" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                          {presentation.kind === 'browser' ? `🌐 ${presentation.name}` : presentation.name}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {presentation.kind === 'browser' ? 'Website on stage' : 'On stage'}
                          {presentation.kind !== 'browser' && presentation.pageCount > 0
                            ? ` · page ${presentation.page} of ${presentation.pageCount}`
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleStopPresenting}
                        className="shrink-0 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold tracking-tight text-red-600 transition hover:bg-red-500/20 active:scale-[0.98] dark:text-red-300"
                      >
                        Stop
                      </button>
                    </div>
                  )}

                  {/* ── present website / browser ── */}
                  <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                        <span className="text-sm">🌐</span> Present Website / Browser
                      </span>
                      {presentation?.kind === 'browser' && (
                        <span className="rounded bg-mint-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-mint-600 dark:text-mint-400">
                          Active
                        </span>
                      )}
                    </div>
                    <form onSubmit={handlePresentWebsite} className="flex gap-1.5">
                      <input
                        type="text"
                        value={presentWebsiteUrl}
                        onChange={(e) => setPresentWebsiteUrl(e.target.value)}
                        placeholder="https://... or leave empty for Chrome Search"
                        className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-100"
                      />
                      <button
                        type="submit"
                        className="h-8 shrink-0 rounded-md bg-brand-600 px-3 text-xs font-semibold text-white transition hover:bg-brand-500 active:scale-95"
                      >
                        {presentation?.kind === 'browser'
                          ? (presentWebsiteUrl.trim() ? 'Navigate' : 'New Tab')
                          : (presentWebsiteUrl.trim() ? 'Present URL' : 'Open Browser')}
                      </button>
                    </form>
                    <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      Leave blank to open Chrome New Tab with Google Search and bookmarks, or enter any web URL.
                    </p>
                  </div>

                  <label
                    className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center transition ${
                      uploadingFile
                        ? 'border-brand-500/40 bg-brand-500/[0.06]'
                        : 'border-white/[0.12] bg-white/[0.02] hover:border-brand-500/40 hover:bg-brand-500/[0.04]'
                    }`}
                  >
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.ppt,.pptx,image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/ogg,.mov,.mkv,video/*"
                      className="sr-only"
                      disabled={Boolean(uploadingFile)}
                      onChange={(e) => {
                        void handleUploadFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15 text-brand-500 ring-1 ring-brand-500/25 dark:text-brand-300">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="text-[11px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                      {uploadingFile ? `Uploading ${uploadingFile}…` : 'Upload a file to present'}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      PDF, PowerPoint, video, or image · up to 100 MB
                    </span>
                  </label>

                  {attachmentsLoading && (
                    <p className="py-4 text-center text-[11px] text-slate-500">Loading files…</p>
                  )}

                  {!attachmentsLoading && attachments.length === 0 && (
                    <p className="py-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
                      No files yet. Upload a deck and it appears here.
                    </p>
                  )}

                  {!attachmentsLoading && attachments.length > 0 && (
                    <ul className="space-y-1.5">
                      {attachments.map((att) => {
                        const onStage = presentation?.attachmentId === att.id;
                        return (
                          <li
                            key={att.id}
                            className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition ${
                              onStage
                                ? 'border-mint-500/30 bg-mint-500/[0.06]'
                                : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'
                            }`}
                          >
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-200/70 text-[8px] font-bold uppercase tracking-wide text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                              {att.kind === 'pdf' ? 'PDF' : att.kind === 'pptx' ? 'PPT' : att.kind === 'video' ? 'VID' : 'IMG'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                {att.name}
                              </p>
                              <p className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                                {(att.bytes / (1024 * 1024)).toFixed(1)} MB
                                {att.pageCount > 0 ? ` · ${att.pageCount} pages` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => (onStage ? handleStopPresenting() : handlePresent(att))}
                              className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold tracking-tight transition active:scale-[0.98] ${
                                onStage
                                  ? 'border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-300'
                                  : 'border-brand-500/30 bg-brand-500/15 text-brand-600 hover:bg-brand-500/25 dark:text-brand-300'
                              }`}
                            >
                              {onStage ? 'Stop' : 'Present'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteAttachment(att)}
                              aria-label={`Delete ${att.name}`}
                              title="Delete"
                              className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-red-500/10 hover:text-red-500"
                            >
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {!loading && !composing && tab === 'offer' && !followUpFor && (
                <div className="space-y-3">
                  {/* Payment Gateway Status & Dedicated Webinar Webhook Card */}
                  {offerSettingsOpen && (
                  <div className="animate-fade-in space-y-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-xs">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-500/15 text-brand-500 ring-1 ring-brand-500/25 dark:text-brand-300">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                            <path d="M2.5 10h19" strokeLinecap="round" />
                          </svg>
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="whitespace-nowrap text-[11px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                              Razorpay Payments
                            </span>
                            <span
                              className={`whitespace-nowrap rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wider ${
                                !gatewayStatus
                                  ? 'bg-slate-200 text-slate-500 dark:bg-white/10'
                                  : !gatewayStatus.enabled
                                  ? 'bg-red-500/15 text-red-600 ring-1 ring-red-500/20 dark:text-red-400'
                                  : gatewayStatus.mode === 'live'
                                  ? 'bg-mint-500/15 text-mint-600 ring-1 ring-mint-500/20 dark:text-mint-400'
                                  : gatewayStatus.mode === 'test'
                                  ? 'bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400'
                                  : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                              }`}
                            >
                              {!gatewayStatus
                                ? 'Checking…'
                                : !gatewayStatus.enabled
                                ? 'Disabled'
                                : gatewayStatus.mode === 'live'
                                ? 'Live active'
                                : gatewayStatus.mode === 'test'
                                ? 'Test active'
                                : 'Mock mode'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                            {!gatewayStatus
                              ? 'Checking payment gateway configuration…'
                              : !gatewayStatus.enabled
                              ? 'Online checkout is currently paused for attendees.'
                              : gatewayStatus.configured
                              ? 'Captures payments via UPI, QR, Cards, & Netbanking.'
                              : 'Auto-approves simulated checkout (no keys set).'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowGatewayModal(true)}
                        className="w-full shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold tracking-tight text-slate-700 shadow-sm transition hover:bg-white/[0.09] dark:text-slate-200 sm:w-auto"
                      >
                        Configure keys
                      </button>
                    </div>

                    {/* Dedicated Webinar Webhook Box */}
                    <div className="space-y-1 border-t border-white/[0.07] pt-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
                          Webhook URL for this webinar
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const effectiveUrl =
                              webhookUrl ||
                              (typeof window !== 'undefined'
                                ? `${window.location.origin.replace(':3000', ':4000')}/api/payments/webhook/${webinarId}`
                                : '');
                            if (effectiveUrl) {
                              navigator.clipboard.writeText(effectiveUrl);
                              setCopiedWebhook(true);
                              setTimeout(() => setCopiedWebhook(false), 2500);
                            }
                          }}
                          className="flex items-center gap-1 text-[10px] font-semibold text-amber-500 hover:underline"
                        >
                          {copiedWebhook ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <div className="flex items-center rounded-md border border-white/[0.08] bg-white/[0.03] p-1.5 dark:bg-black/30">
                        <input
                          type="text"
                          readOnly
                          value={
                            webhookUrl ||
                            (typeof window !== 'undefined'
                              ? `${window.location.origin.replace(':3000', ':4000')}/api/payments/webhook/${webinarId}`
                              : '')
                          }
                          className="flex-1 truncate bg-transparent font-mono text-[10px] text-slate-600 select-all focus:outline-none dark:text-slate-300"
                        />
                      </div>

                      {/* Webhook Secret Key */}
                      <div className="space-y-1.5 border-t border-dashed border-white/[0.07] pt-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            Webhook secret key
                          </span>
                          {secretSaved && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500">
                              Saved
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex-1">
                            <input
                              type={showSecret ? 'text' : 'password'}
                              value={webhookSecret}
                              onChange={(e) => {
                                setWebhookSecret(e.target.value);
                                setSecretSaved(false);
                              }}
                              placeholder="Enter Razorpay webhook secret…"
                              className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] py-1.5 pl-2.5 pr-7 font-mono text-[10px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:bg-black/30 dark:text-slate-200"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecret(!showSecret)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                              title={showSecret ? 'Hide secret' : 'Show secret'}
                              aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                            >
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                                {showSecret ? (
                                  <>
                                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" strokeLinejoin="round" />
                                    <circle cx="12" cy="12" r="3" />
                                  </>
                                ) : (
                                  <>
                                    <path d="M3 3l18 18" strokeLinecap="round" />
                                    <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.3 7.9A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4-.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </>
                                )}
                              </svg>
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={savingSecret}
                            onClick={handleSaveWebhookSecret}
                            className="shrink-0 rounded-md bg-brand-500 px-2.5 py-1.5 text-[10px] font-semibold tracking-tight text-white shadow-sm transition hover:bg-brand-400 active:scale-[0.98] disabled:opacity-50"
                          >
                            {savingSecret ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>

                      <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                        Add to Razorpay → Settings → Webhooks. Events:{' '}
                        <code className="font-mono text-amber-500">payment.captured</code>,{' '}
                        <code className="font-mono text-amber-500">order.paid</code>. Webhook secret: enter above or use your Razorpay key secret.
                      </p>
                    </div>
                  </div>
                  )}

                  {/* Sub-tabs: Offers vs Live Sales */}
                  <div className="flex items-center gap-1 rounded-md border border-white/[0.07] bg-slate-100/80 p-1 dark:bg-ink-950/40">
                    <button
                      type="button"
                      onClick={() => setOfferSubTab('offers')}
                      className={`flex-1 rounded px-2 py-1 text-[11px] font-semibold tracking-tight transition ${
                        offerSubTab === 'offers'
                          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/[0.08] dark:bg-white/[0.09] dark:text-white dark:ring-white/10'
                          : 'text-slate-500 hover:bg-white hover:text-slate-700 dark:hover:bg-white/[0.04] dark:hover:text-slate-300'
                      }`}
                    >
                      Offers <span className="tabular-nums">({ctas.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOfferSubTab('sales');
                        void refreshPayments();
                      }}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-[11px] font-semibold tracking-tight transition ${
                        offerSubTab === 'sales'
                          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/[0.08] dark:bg-white/[0.09] dark:text-white dark:ring-white/10'
                          : 'text-slate-500 hover:bg-white hover:text-slate-700 dark:hover:bg-white/[0.04] dark:hover:text-slate-300'
                      }`}
                    >
                      <span>Live sales</span>
                      <span className="rounded bg-black/[0.06] px-1 py-px text-[9px] font-bold tabular-nums dark:bg-white/[0.12]">
                        {paymentCount} · ₹{(totalRevenuePaise / 100).toLocaleString('en-IN')}
                      </span>
                    </button>
                  </div>

                  {/* Live Sales View */}
                  {offerSubTab === 'sales' && (
                    <div className="animate-fade-in space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                            Total revenue
                          </p>
                          <p className="mt-1 text-base font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                            ₹{(totalRevenuePaise / 100).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                            Successful sales
                          </p>
                          <p className="mt-1 text-base font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                            {paymentCount} paid
                          </p>
                        </div>
                      </div>

                      {payments.length === 0 ? (
                        <div className="space-y-2 py-8 text-center">
                          <span className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.08]">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                              <path d="M2.5 10h19" strokeLinecap="round" />
                            </svg>
                          </span>
                          <p className="text-[11px] font-semibold tracking-tight text-slate-800 dark:text-slate-200">
                            No payments recorded yet for this webinar
                          </p>
                          <p className="mx-auto max-w-xs text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                            When attendees pay through live offers or via the Razorpay webhook, captured transactions appear here in real-time.
                          </p>
                        </div>
                      ) : (
                        <div className="scrollbar-thin max-h-72 space-y-2 overflow-y-auto pr-0.5">
                          {payments.map((p) => (
                            <div
                              key={p.id}
                              className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 text-xs transition hover:border-white/[0.14]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-semibold tracking-tight text-slate-900 dark:text-white">
                                    {p.user?.name || 'Attendee'}
                                  </p>
                                  <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                                    {p.user?.email || 'No email'} · {p.offerTitle || 'Offer'}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-[11px] font-bold tabular-nums text-slate-900 dark:text-white">
                                    ₹{(p.amountPaise / 100).toLocaleString('en-IN')}
                                  </p>
                                  <span className="mt-0.5 inline-block rounded bg-mint-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-mint-600 dark:text-mint-400">
                                    {p.status}
                                  </span>
                                </div>
                              </div>
                              <p className="mt-1 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                                {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(p.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Offers List View */}
                  {offerSubTab === 'offers' && (
                    <div className="space-y-2">
                  {ctas.length === 0 && (
                    <div className="space-y-2 py-8 text-center">
                      <span className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.08]">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 7h18M3 12h18M3 17h10" strokeLinecap="round" />
                        </svg>
                      </span>
                      <p className="text-[11px] font-semibold tracking-tight text-slate-800 dark:text-slate-200">
                        No offers yet
                      </p>
                      <p className="mx-auto max-w-[15rem] text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                        Publish a course or product card to the room and collect payments in-stream.
                      </p>
                    </div>
                  )}
                  {ctas.map((c) => {
                    const isLive = activeCta?.id === c.id;
                    const price = c.priceOverridePaise ?? c.course?.pricePaise ?? 0;
                    return (
                      <div
                        key={c.id}
                        className={`group/row relative overflow-hidden rounded-lg border bg-white/[0.02] p-3 pl-3.5 transition ${
                          isLive
                            ? 'border-accent-500/35 bg-accent-500/[0.05] shadow-[0_0_0_1px_rgba(245,158,11,0.12)]'
                            : 'border-white/[0.08] hover:border-white/[0.14] hover:bg-white/[0.04]'
                        }`}
                      >
                        <span
                          className={`absolute inset-y-0 left-0 w-[2px] ${
                            isLive ? 'bg-accent-500 dark:bg-accent-400' : 'bg-transparent'
                          }`}
                          aria-hidden
                        />
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-xs font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100">
                            {c.title}
                          </p>
                          {isLive && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-accent-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-accent-600 dark:text-accent-400">
                              <span className="h-1 w-1 rounded-full bg-accent-500 dark:bg-accent-400" />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="rounded bg-mint-500/10 px-1.5 py-px text-[9px] font-semibold tabular-nums text-mint-600 dark:text-mint-400">
                            {price ? `₹${(price / 100).toLocaleString('en-IN')}` : 'Free'}
                          </span>
                          {c.course && (
                            <span className="truncate rounded bg-white/[0.05] px-1.5 py-px text-[9px] font-medium text-slate-500 dark:text-slate-400">
                              {c.course.title}
                            </span>
                          )}
                          {c.formEnabled && (
                            <span className="rounded bg-brand-500/10 px-1.5 py-px text-[9px] font-medium text-brand-600 dark:text-brand-300">
                              form before payment
                            </span>
                          )}
                        </div>
                        {/* The tally, live from the socket, falling back to the
                            count fetched with the list so it is right the
                            moment the panel opens. It is a summary only — the
                            names behind it live in the follow-up list. */}
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-accent-500 dark:text-accent-400">
                          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 11.5V6a1.5 1.5 0 0 1 3 0v5m0 0V4.5a1.5 1.5 0 0 1 3 0V11m0 0V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.2a5 5 0 0 1-3.9-1.9L4 14.5a1.6 1.6 0 0 1 2.4-2.1L9 15" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="font-semibold tabular-nums">
                            {ctaClickCounts[c.id] ?? c.clickCount ?? 0}
                          </span>
                          opened
                          {isLive && activeCta?.expanded && (
                            <span className="ml-1 rounded border border-accent-500/30 bg-accent-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-accent-500 dark:text-accent-400">
                              Expanded on audience screens
                            </span>
                          )}
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {isLive ? (
                            <>
                              <button
                                onClick={hideCta}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold tracking-tight text-slate-700 transition hover:bg-white/[0.09] active:scale-[0.98] dark:text-slate-200"
                              >
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 3l18 18M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.3 7.9A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4-.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Hide offer
                              </button>
                              <button
                                onClick={() => expandCta(!activeCta?.expanded)}
                                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold tracking-tight transition active:scale-[0.98] ${
                                  activeCta?.expanded
                                    ? 'border border-amber-500/40 bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-300'
                                    : 'bg-gradient-to-b from-accent-400 to-accent-600 text-ink-950 shadow-sm hover:from-accent-300 hover:to-accent-500'
                                }`}
                              >
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                  {activeCta?.expanded ? (
                                    <path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M14 4h6m0 0v6m0-6l-7 7M4 10h6m0 0V4m0 6L3 3" strokeLinecap="round" strokeLinejoin="round" />
                                  ) : (
                                    <path d="M15 3h6m0 0v6m0-6L14 10M9 21H3m0 0v-6m0 6l7-7M3 9V3m0 0h6m-6 0l7 7m11 5v6m0 0h-6m6 0l-7-7" strokeLinecap="round" strokeLinejoin="round" />
                                  )}
                                </svg>
                                {activeCta?.expanded ? 'Collapse on audience' : 'Expand at participant end'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => showCta(c.id, false)}
                                className="inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-brand-400 to-brand-600 px-2 py-1 text-[10px] font-semibold tracking-tight text-white shadow-sm transition hover:from-brand-300 hover:to-brand-500 active:scale-[0.98]"
                              >
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" strokeLinejoin="round" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                                Show offer
                              </button>
                              <button
                                onClick={() => showCta(c.id, true)}
                                className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-accent-400 to-accent-600 px-2 py-1 text-[10px] font-semibold tracking-tight text-ink-950 shadow-sm transition hover:from-accent-300 hover:to-accent-500 active:scale-[0.98]"
                                title="Publish offer and automatically open it expanded for all participants"
                              >
                                <span>Show &amp; expand</span>
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M15 3h6m0 0v6m0-6L14 10M9 21H3m0 0v-6m0 6l7-7M3 9V3m0 0h6m-6 0l7 7m11 5v6m0 0h-6m6 0l-7-7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setFollowUpFor(c.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold tracking-tight text-slate-700 transition hover:bg-white/[0.09] active:scale-[0.98] dark:text-slate-200"
                          >
                            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Follow up
                          </button>
                          <button
                            onClick={() => editForm(c)}
                            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold tracking-tight text-slate-700 transition hover:bg-white/[0.09] active:scale-[0.98] dark:text-slate-200"
                          >
                            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
                            </svg>
                            {c.formEnabled ? 'Edit form' : 'Add form'}
                          </button>
                        </div>
                        <RowActions
                          id={c.id}
                          editLabel="Edit offer"
                          busy={deleting}
                          confirming={confirmDelete === c.id}
                          onEdit={() => editOffer(c)}
                          onAskDelete={() => setConfirmDelete(c.id)}
                          onCancelDelete={() => setConfirmDelete(null)}
                          onDelete={() => void removeRow('offer', c.id)}
                        />
                      </div>
                    );
                  })}
                    </div>
                  )}
                </div>
              )}
            </div>

              {tab === 'settings' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-ink-950/40">
                    <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-white/5">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Audience Permissions</h3>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Controls participant features and display settings</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Participant Fullscreen Toggle */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-900 dark:text-white">Participant Fullscreen</span>
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${allowParticipantFullscreen ? 'bg-mint-500/15 text-mint-600 dark:text-mint-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'}`}>
                              {allowParticipantFullscreen ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                            {allowParticipantFullscreen
                              ? 'Participants can freely enter and view webinar in fullscreen.'
                              : 'Participants cannot fullscreen. Any attendee currently in fullscreen is forced out.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={allowParticipantFullscreen}
                          onClick={() => {
                            socket.current?.emit('setParticipantFullscreen', { allowed: !allowParticipantFullscreen });
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            allowParticipantFullscreen ? 'bg-mint-500' : 'bg-slate-300 dark:bg-white/20'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              allowParticipantFullscreen ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Audience Mic */}
                      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/5">
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">Allow audience mic</p>
                          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                            {allowMic ? 'Attendees can unmute their microphones' : 'Audience microphones are locked'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={allowMic}
                          onClick={() => {
                            socket.current?.emit('updateRoomSettings', { allowMic: !allowMic }, () => {});
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            allowMic ? 'bg-mint-500' : 'bg-slate-300 dark:bg-white/20'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              allowMic ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Audience Camera */}
                      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/5">
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">Allow audience camera</p>
                          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                            {allowVideo ? 'Attendees can turn on their cameras' : 'Audience cameras are locked'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={allowVideo}
                          onClick={() => {
                            socket.current?.emit('updateRoomSettings', { allowVideo: !allowVideo }, () => {});
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            allowVideo ? 'bg-mint-500' : 'bg-slate-300 dark:bg-white/20'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              allowVideo ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Participants See Each Other */}
                      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/5">
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">Participants see each other</p>
                          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                            {showParticipantsToEachOther ? 'Zoom call mode (everyone visible)' : 'Webinar broadcast mode (staff on stage)'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={showParticipantsToEachOther}
                          onClick={() => {
                            socket.current?.emit('updateRoomSettings', { showParticipantsToEachOther: !showParticipantsToEachOther }, () => {});
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            showParticipantsToEachOther ? 'bg-brand-500' : 'bg-slate-300 dark:bg-white/20'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              showParticipantsToEachOther ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* ── stage control ───────────────────────────── */}
            <div className="border-t border-white/[0.07] px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-tight text-slate-900 dark:text-white">Stage</p>
                  <p className="text-[10px] text-slate-500">
                    {spotlightedPeerId
                      ? 'One speaker is pinned to the big tile.'
                      : 'Pin a speaker to the big tile for everyone.'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {spotlightedPeerId && (
                    <button
                      onClick={() => spotlight(null)}
                      className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold tracking-tight text-slate-700 transition hover:bg-white/[0.09] dark:text-slate-200"
                    >
                      Clear spotlight
                    </button>
                  )}
                  <button
                    onClick={muteAll}
                    className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold tracking-tight text-slate-700 transition hover:bg-white/[0.09] dark:text-slate-200"
                  >
                    Mute all
                  </button>
                </div>
              </div>

              {speakers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {speakers.map((p) => {
                    const active = p.peerId === spotlightedPeerId;
                    return (
                      <button
                        key={p.peerId}
                        onClick={() => spotlight(active ? null : p.peerId)}
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-tight transition ${
                          active
                            ? 'border-brand-500/40 bg-brand-500/15 text-brand-600 dark:text-brand-200'
                            : 'border-white/10 bg-white/[0.03] text-slate-600 hover:bg-white/[0.08] dark:text-slate-300'
                        }`}
                      >
                        {active ? '★ ' : ''}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {stageMsg && (
                <p className="mt-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-600 dark:text-slate-300">
                  {stageMsg}
                </p>
              )}
            </div>

            {/* ── go live ─────────────────────────────────── */}
            {canEndWebinar && startedAt === null && (
              <div className="border-t border-brand-500/20 bg-brand-500/[0.06] px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-tight text-slate-900 dark:text-white">Start the webinar</p>
                    <p className="text-[10px] text-slate-500">
                      Participants are waiting. They join the moment you start.
                    </p>
                  </div>
                  <button
                    onClick={startWebinar}
                    disabled={starting}
                    className="shrink-0 rounded-md bg-brand-500 px-3 py-1.5 text-[11px] font-semibold tracking-tight text-white shadow-sm transition hover:bg-brand-400 active:scale-[0.98] disabled:opacity-50"
                  >
                    {starting ? 'Starting…' : 'Go live'}
                  </button>
                </div>
                {startError && (
                  <p className="mt-2 rounded-md border border-red-500/25 bg-red-500/[0.08] px-2 py-1 text-[10px] text-red-600 dark:text-red-300">
                    {startError}
                  </p>
                )}
              </div>
            )}

            {/* ── recording ───────────────────────────────── */}
            {canEndWebinar && (
              <div className="border-t border-white/[0.07] px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-slate-900 dark:text-white">
                      Session recording
                      {recording && (
                        <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-500 ring-1 ring-red-500/25">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                          REC
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {recording
                        ? 'Capturing host video, screen share, and timeline events.'
                        : 'Record this session (screen + video + audio) for replay.'}
                    </p>
                  </div>
                  <button
                    onClick={toggleRecording}
                    disabled={recBusy || recClientStatus.isUploading}
                    className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold tracking-tight transition active:scale-[0.98] disabled:opacity-50 ${
                      recording
                        ? 'bg-amber-500 text-amber-950 shadow-sm hover:bg-amber-400'
                        : 'border border-white/10 bg-white/[0.04] text-slate-700 hover:bg-white/[0.09] dark:text-slate-200'
                    }`}
                  >
                    {recBusy
                      ? 'Working…'
                      : recClientStatus.isUploading
                      ? `Uploading ${recClientStatus.uploadProgress}%`
                      : recording
                      ? 'Stop recording'
                      : 'Start recording'}
                  </button>
                </div>

                {recClientStatus.isUploading && (
                  <div className="mt-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-medium text-brand-500 dark:text-brand-400">
                      <span>Uploading high-definition recording...</span>
                      <span className="tabular-nums">{recClientStatus.uploadProgress}%</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all duration-300"
                        style={{ width: `${recClientStatus.uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {recError && (
                  <p className="mt-2 rounded-md border border-red-500/25 bg-red-500/[0.08] px-2 py-1 text-[10px] text-red-600 dark:text-red-300">
                    {recError}
                  </p>
                )}

                {recClientStatus.uploadError && (
                  <p className="mt-2 rounded-md border border-red-500/25 bg-red-500/[0.08] px-2 py-1 text-[10px] text-red-600 dark:text-red-300">
                    Upload failed: {recClientStatus.uploadError}
                  </p>
                )}

                {lastRecording && (
                  <div className="mt-2 flex items-center justify-between rounded-md border border-brand-500/20 bg-brand-500/[0.06] px-2.5 py-1.5">
                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                      Recording ready ({formatDuration(lastRecording.durationMs)})
                    </span>
                    <a
                      href={`/replay/${lastRecording.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Watch replay →
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* ── danger zone ─────────────────────────────── */}
            {canEndWebinar && (
              <div className="border-t border-red-500/15 bg-red-500/[0.04] px-3.5 py-3">
                {confirmEnd ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-medium text-red-600 dark:text-red-300">
                      End for everyone? This cannot be undone.
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setConfirmEnd(false)}
                        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-white/[0.09] dark:text-slate-300"
                        disabled={ending}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={endWebinar}
                        disabled={ending}
                        className="rounded-md bg-red-500 px-2 py-1 text-[10px] font-semibold text-white shadow-sm transition hover:bg-red-400 active:scale-[0.98] disabled:opacity-50"
                      >
                        {ending ? 'Ending…' : 'Yes, end it'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmEnd(true)}
                    className="text-[10px] font-semibold tracking-tight text-red-500 transition hover:text-red-400 dark:text-red-400 dark:hover:text-red-300"
                  >
                    End webinar for everyone
                  </button>
                )}
              </div>
            )}
            </aside>
          </div>,
          document.body
        )}

      {/* Host Live Payment Toast Notification */}
      {toastMessage && (
        <div className="animate-fade-in fixed right-5 top-5 z-[99999] flex items-center gap-2.5 rounded-lg bg-amber-500 px-3.5 py-2.5 text-[11px] font-bold tracking-tight text-slate-950 shadow-2xl">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10L5.6 18.4" strokeLinecap="round" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Gateway Configuration Modal for Host */}
      {showGatewayModal &&
        createPortal(
          <div className="animate-fade-in fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="scrollbar-thin relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-white/[0.08] bg-white p-5 shadow-2xl dark:bg-ink-950 sm:p-6">
              <div className="mb-4 flex items-center justify-between border-b border-white/[0.07] pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-500 ring-1 ring-brand-500/25 dark:text-brand-300">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                      <path d="M2.5 10h19" strokeLinecap="round" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white">
                      Razorpay gateway setup
                    </h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Configure credentials to accept attendee payments in live webinars.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGatewayModal(false)}
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-700 dark:hover:text-white"
                  aria-label="Close gateway setup"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <GatewayConfigPanel
                compact
                onSaved={() => {
                  void refreshGatewayStatus();
                }}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * Edit and delete for one authored row.
 *
 * The delete confirmation is inline rather than a `window.confirm` because the
 * panel is a portal over a live call — a native dialog steals focus from the
 * room and, on some browsers, suspends the audio context while it is open.
 */
function RowActions({
  id,
  editLabel,
  busy,
  confirming,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  id: string;
  editLabel: string;
  busy: boolean;
  confirming: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  if (confirming) {
    return (
      <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-md border border-red-500/25 bg-red-500/[0.08] px-2.5 py-1.5">
        <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="flex-1 text-[10px] font-medium text-red-600 dark:text-red-300">Delete this for good?</p>
        <button
          onClick={onCancelDelete}
          disabled={busy}
          className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold tracking-tight text-slate-600 transition hover:bg-white/[0.09] disabled:opacity-40 dark:text-slate-300"
        >
          Cancel
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-semibold tracking-tight text-white shadow-sm transition hover:bg-red-400 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex items-center gap-1 border-t border-white/[0.06] pt-2">
      <button
        onClick={onEdit}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold tracking-tight text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-800 dark:hover:text-slate-200"
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {editLabel}
      </button>
      <button
        onClick={onAskDelete}
        aria-label={`Delete ${id}`}
        className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold tracking-tight text-slate-400 transition hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400"
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Delete
      </button>
    </div>
  );
}

/** `m:ss` — long enough for a webinar, short enough to sit in a link. */
function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
