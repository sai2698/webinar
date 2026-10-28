'use client';

import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '@/store/roomStore';

/**
 * A short-lived banner over the stage announcing a purchase in real-time.
 *
 * Avoids displaying old historical enrollment messages when a user re-joins.
 * Includes an explicit close button so the user can dismiss it at any time.
 */
export function EnrollmentBanner() {
  const messages = useRoomStore((s) => s.messages);
  const [banner, setBanner] = useState<{ id: string; text: string } | null>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Only pick enrollment messages that arrived AFTER mounting
    const latest = [...messages]
      .reverse()
      .find(
        (m) =>
          m.system &&
          m.kind === 'enrollment' &&
          m.ts >= mountTimeRef.current - 1500 &&
          !seenRef.current.has(m.id)
      );

    if (!latest) return;

    seenRef.current.add(latest.id);
    setBanner({
      id: latest.id,
      text: latest.actor ? `${latest.actor} just enrolled in the course.` : latest.text,
    });

    const timer = setTimeout(() => {
      setBanner(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [messages]);

  if (!banner) return null;

  return (
    <div className="absolute inset-x-0 top-3 z-30 flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto animate-fade-up flex items-center gap-2.5 rounded-full border border-amber-400/50 bg-gradient-to-r from-amber-500/90 to-brand-600/90 py-1.5 pl-3.5 pr-2 shadow-2xl backdrop-blur-md">
        <span className="text-sm">👑</span>
        <p className="text-[12px] font-semibold text-white drop-shadow">{banner.text}</p>
        <button
          type="button"
          onClick={() => setBanner(null)}
          className="ml-1 rounded-full p-1 text-white/80 hover:bg-black/20 hover:text-white transition"
          aria-label="Dismiss banner"
          title="Dismiss"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
