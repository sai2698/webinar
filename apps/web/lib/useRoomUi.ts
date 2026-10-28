'use client';

import { useCallback, useEffect, useState } from 'react';

async function lockLandscape() {
  try {
    if (typeof screen !== 'undefined' && screen.orientation && 'lock' in screen.orientation) {
      await (screen.orientation as any).lock('landscape').catch(() => {});
    } else if (typeof screen !== 'undefined' && 'lockOrientation' in screen) {
      (screen as any).lockOrientation('landscape');
    }
  } catch {
    // Orientation lock may fail if unsupported or browser blocks it without user gesture
  }
}

async function unlockOrPortrait() {
  try {
    if (typeof screen !== 'undefined' && screen.orientation) {
      if ('unlock' in screen.orientation) {
        screen.orientation.unlock();
      }
      if ('lock' in screen.orientation) {
        await (screen.orientation as any).lock('portrait').catch(() => {});
      }
    } else if (typeof screen !== 'undefined' && 'unlockOrientation' in screen) {
      (screen as any).unlockOrientation();
    }
  } catch {
    // Ignore
  }
}

/**
 * Returns whether the room stage is currently in fullscreen mode.
 */
export function useIsFullscreen(): boolean {
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    function check() {
      setIsFs(
        Boolean(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement
        )
      );
    }
    check();
    document.addEventListener('fullscreenchange', check);
    document.addEventListener('webkitfullscreenchange', check);
    return () => {
      document.removeEventListener('fullscreenchange', check);
      document.removeEventListener('webkitfullscreenchange', check);
    };
  }, []);
  return isFs;
}

/**
 * Fullscreen for the room stage.
 *
 * Uses the standard Fullscreen API with webkit fallback and handles
 * locking to landscape mode on mobile, and restoring portrait mode on exit.
 */
export function useFullscreen(target: React.RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    async function onChange() {
      const active = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );
      setIsFullscreen(active);
      if (!active) {
        await unlockOrPortrait();
      }
    }
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggle = useCallback(async () => {
    const el = target.current;
    if (!el) return;

    try {
      const isCurrentlyFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );

      if (isCurrentlyFs) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
        else if ((document as any).mozCancelFullScreen) await (document as any).mozCancelFullScreen();
        await unlockOrPortrait();
      } else {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
        else if ((el as any).mozRequestFullScreen) await (el as any).mozRequestFullScreen();
        await lockLandscape();
      }
    } catch {
      // Some browsers refuse fullscreen without a direct user gesture
    }
  }, [target]);

  return { isFullscreen, toggle };
}

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

/**
 * Enumerates cameras and microphones.
 *
 * Labels are empty until the user has granted permission at least once, so
 * callers should re-run this after `getUserMedia` succeeds.
 */
export function useMediaDevices() {
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceOption[]>([]);

  const refresh = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(
        devices
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
      );
      setMicrophones(
        devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
      );
    } catch {
      /* enumerateDevices can throw in insecure contexts */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const md = navigator.mediaDevices;
    md?.addEventListener?.('devicechange', refresh);
    return () => md?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  return { cameras, microphones, refresh };
}

/**
 * Reports whether the referenced element is on screen.
 *
 * Used to keep off-screen tiles from mounting a `<video>` at all. A tile that
 * never mounts never asks the SFU for a layer, so a 200-person grid only
 * downloads the handful of streams the viewer can actually see.
 *
 * `rootMargin` pre-loads a little ahead of the scroll so tiles are already
 * playing by the time they slide into view.
 */
export function useInView(
  target: React.RefObject<HTMLElement | null>,
  rootMargin = '200px'
) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = target.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    let reported = false;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          reported = true;
          setInView(entry.isIntersecting);
        }
      },
      { rootMargin }
    );

    observer.observe(el);

    const failOpen = setTimeout(() => {
      if (!reported) setInView(true);
    }, 1500);

    return () => {
      clearTimeout(failOpen);
      observer.disconnect();
    };
  }, [target, rootMargin]);

  return inView;
}
