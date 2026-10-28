'use client';

import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from '@/store/roomStore';

/**
 * AudioRenderer plays all incoming remote audio streams from speakers, hosts, and co-hosts.
 *
 * In WebRTC / Mediasoup, audio and video tracks arrive on separate consumers.
 * While video tracks are attached to <video> elements in VideoTile, incoming audio tracks
 * must be attached to <audio> elements with autoPlay and playsInline so the browser
 * outputs the sound to the participant's speakers or headphones.
 */
export function AudioRenderer() {
  const remoteStreams = useRoomStore((s) => s.remoteStreams);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const audioStreams = Object.values(remoteStreams).filter(
    (rs) => rs.kind === 'audio' && rs.stream
  );

  return (
    <>
      <div className="sr-only" aria-hidden="true">
        {audioStreams.map((rs) => (
          <RemoteAudioTrack
            key={rs.producerId}
            stream={rs.stream}
            paused={rs.paused}
            onAutoplayBlocked={() => setAutoplayBlocked(true)}
            onPlaySuccess={() => setAutoplayBlocked(false)}
          />
        ))}
      </div>

      {autoplayBlocked && audioStreams.length > 0 && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 animate-bounce">
          <button
            type="button"
            onClick={() => {
              setAutoplayBlocked(false);
            }}
            className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/90 px-4 py-2 text-xs font-semibold text-white shadow-2xl backdrop-blur transition hover:bg-amber-500 active:scale-95"
          >
            <span>🔊</span>
            <span>Tap to enable sound</span>
          </button>
        </div>
      )}
    </>
  );
}

function RemoteAudioTrack({
  stream,
  paused,
  onAutoplayBlocked,
  onPlaySuccess,
}: {
  stream: MediaStream | null;
  paused?: boolean;
  onAutoplayBlocked: () => void;
  onPlaySuccess: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !stream) return;

    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }

    if (paused) {
      el.pause();
      return;
    }

    const playAudio = () => {
      el.play()
        .then(() => {
          onPlaySuccess();
        })
        .catch((err) => {
          console.warn('[AudioRenderer] Autoplay blocked, waiting for user gesture:', err);
          onAutoplayBlocked();

          const unlock = () => {
            el.play()
              .then(() => onPlaySuccess())
              .catch(() => {});
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
          };

          window.addEventListener('click', unlock, { once: true });
          window.addEventListener('touchstart', unlock, { once: true });
          window.addEventListener('pointerdown', unlock, { once: true });
          window.addEventListener('keydown', unlock, { once: true });
        });
    };

    playAudio();

    // Listen to track unmuting or ending
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const handleUnmute = () => {
        if (!paused) playAudio();
      };
      audioTrack.addEventListener('unmute', handleUnmute);
      return () => {
        audioTrack.removeEventListener('unmute', handleUnmute);
      };
    }
  }, [stream, paused, onAutoplayBlocked, onPlaySuccess]);

  return <audio ref={audioRef} autoPlay playsInline />;
}

