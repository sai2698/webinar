'use client';

import { useCallback, useEffect, useState } from 'react';
import type { QuizOption } from '@webinar/shared';
import { endpoints, ApiError } from '@/lib/api';
import { Button, Input, Textarea, Tabs, Card, Badge } from '@/components/ui';

interface AdminQuiz {
  id: string;
  question: string;
  options: QuizOption[];
  correctOptionId: string | null;
  timeLimitSecs: number;
  answerCount: number;
}

interface AdminCta {
  id: string;
  title: string;
  description: string | null;
  buttonText: string;
  priceOverridePaise: number | null;
  externalUrl: string | null;
  course: { id: string; title: string; pricePaise: number; currency: string } | null;
}

interface AdminCourse {
  id: string;
  title: string;
  description: string | null;
  pricePaise: number;
  currency: string;
}

type Tab = 'quizzes' | 'offers' | 'courses';

const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f'];

function formatPrice(paise: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function EngagementPanel({ webinarId }: { webinarId: string }) {
  const [tab, setTab] = useState<Tab>('quizzes');
  const [quizzes, setQuizzes] = useState<AdminQuiz[]>([]);
  const [ctas, setCtas] = useState<AdminCta[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* ── quiz draft ─────────────────────────────────────────── */
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [timeLimit, setTimeLimit] = useState(30);

  /* ── offer draft ────────────────────────────────────────── */
  const [ctaTitle, setCtaTitle] = useState('');
  const [ctaDescription, setCtaDescription] = useState('');
  const [ctaButton, setCtaButton] = useState('Enroll Now');
  const [ctaCourseId, setCtaCourseId] = useState('');
  const [ctaPrice, setCtaPrice] = useState('');

  /* ── course draft ───────────────────────────────────────── */
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [coursePrice, setCoursePrice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qz, ct, cr] = await Promise.all([
        endpoints.quizzes(webinarId),
        endpoints.ctas(webinarId),
        endpoints.courses(),
      ]);
      setQuizzes(qz.quizzes as AdminQuiz[]);
      setCtas(ct.ctas as AdminCta[]);
      setCourses(cr.courses as AdminCourse[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load engagement tools');
    } finally {
      setLoading(false);
    }
  }, [webinarId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Operation failed');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addQuiz() {
    if (question.trim().length < 3) {
      setError('Please provide a valid question.');
      return;
    }
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      setError('A quiz needs at least two options.');
      return;
    }
    const ok = await run(() =>
      endpoints.createQuiz(webinarId, {
        question: question.trim(),
        options: cleanOptions.map((text, i) => ({ id: OPTION_IDS[i], text })),
        correctOptionId: OPTION_IDS[correctIndex] ?? OPTION_IDS[0],
        timeLimitSecs: timeLimit,
      })
    );
    if (ok) {
      setQuestion('');
      setOptions(['', '']);
      setCorrectIndex(0);
      setTimeLimit(30);
    }
  }

  async function addCta() {
    if (ctaTitle.trim().length < 2) {
      setError('Please provide an offer title.');
      return;
    }
    const ok = await run(() =>
      endpoints.createCta(webinarId, {
        title: ctaTitle.trim(),
        description: ctaDescription.trim() || undefined,
        buttonText: ctaButton.trim() || 'Enroll Now',
        courseId: ctaCourseId || undefined,
        priceOverridePaise: ctaPrice ? Math.round(Number(ctaPrice) * 100) : undefined,
      })
    );
    if (ok) {
      setCtaTitle('');
      setCtaDescription('');
      setCtaButton('Enroll Now');
      setCtaCourseId('');
      setCtaPrice('');
    }
  }

  async function addCourse() {
    if (courseTitle.trim().length < 2) {
      setError('Please provide a course title.');
      return;
    }
    const ok = await run(() =>
      endpoints.createCourse({
        title: courseTitle.trim(),
        description: courseDescription.trim() || undefined,
        pricePaise: Math.round(Number(coursePrice || 0) * 100),
        currency: 'INR',
      })
    );
    if (ok) {
      setCourseTitle('');
      setCourseDescription('');
      setCoursePrice('');
    }
  }

  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { id: 'quizzes', label: `Quizzes (${quizzes.length})` },
          { id: 'offers', label: `Flash Offers (${ctas.length})` },
          { id: 'courses', label: `Courses (${courses.length})` },
        ]}
        active={tab}
        onChange={setTab}
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-16">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand-500" />
        </div>
      ) : tab === 'quizzes' ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Creator form */}
          <div className="rounded-2xl border border-line bg-panel-2/60 p-5 space-y-4">
            <h4 className="text-sm font-bold text-fg">Create Timed Quiz</h4>
            <Input
              label="Question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which WebRTC transport routes packets over UDP?"
            />

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Answers — select the correct option
              </p>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct-option"
                      checked={correctIndex === i}
                      onChange={() => setCorrectIndex(i)}
                      className="h-4 w-4 accent-brand-500 cursor-pointer"
                      title="Mark as correct answer"
                    />
                    <Input
                      value={opt}
                      onChange={(e) =>
                        setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
                      }
                      placeholder={`Option ${OPTION_IDS[i].toUpperCase()}`}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                        className="text-xs text-subtle hover:text-red-500 transition px-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {options.length < 6 && (
                <button
                  type="button"
                  onClick={() => setOptions((prev) => [...prev, ''])}
                  className="mt-2 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                >
                  + Add option
                </button>
              )}
            </div>

            <Input
              type="number"
              label="Time limit (seconds)"
              min={5}
              max={300}
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
            />

            <Button
              type="button"
              variant="primary"
              onClick={addQuiz}
              isLoading={busy}
              className="w-full"
            >
              Add Quiz
            </Button>
          </div>

          {/* List of quizzes */}
          <div className="rounded-2xl border border-line bg-panel-2/60 p-5 space-y-3">
            <h4 className="text-sm font-bold text-fg">Configured Quizzes ({quizzes.length})</h4>
            {quizzes.length === 0 ? (
              <p className="py-12 text-center text-xs text-muted">No quizzes created yet.</p>
            ) : (
              <div className="space-y-2.5">
                {quizzes.map((q) => (
                  <div key={q.id} className="rounded-xl border border-line bg-panel p-3.5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-fg">{q.question}</p>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => run(() => endpoints.deleteQuiz(q.id))}
                        className="text-red-500 hover:text-red-600"
                      >
                        Delete
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                      <Badge size="sm">{q.options.length} options</Badge>
                      <span>•</span>
                      <span>{q.timeLimitSecs}s timer</span>
                      <span>•</span>
                      <span>{q.answerCount} responses</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : tab === 'offers' ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Create Offer */}
          <div className="rounded-2xl border border-line bg-panel-2/60 p-5 space-y-4">
            <h4 className="text-sm font-bold text-fg">Create In-Stream Flash Offer</h4>
            <Input
              label="Offer Title"
              value={ctaTitle}
              onChange={(e) => setCtaTitle(e.target.value)}
              placeholder="e.g. Masterclass Enrollment — 50% Off"
            />

            <Textarea
              label="Description"
              value={ctaDescription}
              onChange={(e) => setCtaDescription(e.target.value)}
              placeholder="Highlight bonuses, curriculum, and limited seat details."
              rows={2}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Button Text"
                value={ctaButton}
                onChange={(e) => setCtaButton(e.target.value)}
                placeholder="Enroll Now"
              />
              <Input
                type="number"
                label="Price (₹ INR)"
                min={0}
                value={ctaPrice}
                onChange={(e) => setCtaPrice(e.target.value)}
                placeholder="Leave blank for course price"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                Linked Course (Razorpay)
              </label>
              <select
                className="w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 text-xs text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                value={ctaCourseId}
                onChange={(e) => setCtaCourseId(e.target.value)}
              >
                <option value="">No course link (external action)</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} — {formatPrice(c.pricePaise)}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              variant="accent"
              onClick={addCta}
              isLoading={busy}
              className="w-full text-xs font-bold"
            >
              Add In-Stream Offer
            </Button>
          </div>

          {/* List of Offers */}
          <div className="rounded-2xl border border-line bg-panel-2/60 p-5 space-y-3">
            <h4 className="text-sm font-bold text-fg">Configured Offers ({ctas.length})</h4>
            {ctas.length === 0 ? (
              <p className="py-12 text-center text-xs text-muted">No offers configured yet.</p>
            ) : (
              <div className="space-y-2.5">
                {ctas.map((c) => (
                  <div key={c.id} className="rounded-xl border border-line bg-panel p-3.5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-fg">{c.title}</p>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => run(() => endpoints.deleteCta(c.id))}
                        className="text-red-500 hover:text-red-600"
                      >
                        Delete
                      </Button>
                    </div>
                    {c.description && (
                      <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-2">{c.description}</p>
                    )}
                    <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-line/60">
                      <span className="font-semibold text-accent-600 dark:text-accent-400">
                        {c.priceOverridePaise != null
                          ? formatPrice(c.priceOverridePaise)
                          : c.course
                            ? formatPrice(c.course.pricePaise)
                            : 'Free / External'}
                      </span>
                      <Badge size="sm" variant="brand">{c.buttonText}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Create Course */}
          <div className="rounded-2xl border border-line bg-panel-2/60 p-5 space-y-4">
            <h4 className="text-sm font-bold text-fg">Add Monetized Course</h4>
            <Input
              label="Course Title"
              value={courseTitle}
              onChange={(e) => setCourseTitle(e.target.value)}
              placeholder="e.g. Full-Stack WebRTC Masterclass"
            />

            <Textarea
              label="Description"
              value={courseDescription}
              onChange={(e) => setCourseDescription(e.target.value)}
              placeholder="Course outline and deliverables."
              rows={2}
            />

            <Input
              type="number"
              label="Course Price (₹ INR)"
              min={0}
              value={coursePrice}
              onChange={(e) => setCoursePrice(e.target.value)}
              placeholder="e.g. 2999"
            />

            <Button
              type="button"
              variant="primary"
              onClick={addCourse}
              isLoading={busy}
              className="w-full"
            >
              Save Course
            </Button>
          </div>

          {/* List of Courses */}
          <div className="rounded-2xl border border-line bg-panel-2/60 p-5 space-y-3">
            <h4 className="text-sm font-bold text-fg">Courses ({courses.length})</h4>
            {courses.length === 0 ? (
              <p className="py-12 text-center text-xs text-muted">No courses created yet.</p>
            ) : (
              <div className="space-y-2.5">
                {courses.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3.5 shadow-sm">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-fg">{c.title}</p>
                      <p className="text-xs font-semibold text-mint-600 dark:text-mint-400 mt-0.5">
                        {formatPrice(c.pricePaise)}
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => run(() => endpoints.deleteCourse(c.id))}
                      className="text-red-500 hover:text-red-600"
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
