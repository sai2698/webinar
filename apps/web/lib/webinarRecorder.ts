'use client';

import { useRoomStore } from '@/store/roomStore';
import { API_URL } from '@/lib/api';
import { roomToken } from '@/lib/session';

export interface WebinarRecorderStatus {
  isRecording: boolean;
  recordingId: string | null;
  durationMs: number;
  isUploading: boolean;
  uploadProgress: number; // 0 - 100
  uploadError: string | null;
  mediaUrl: string | null;
}

class WebinarClientRecorder {
  private recordingId: string | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Dedicated secondary recorder for host & co-host cameras
  private camCanvas: HTMLCanvasElement | null = null;
  private camCtx: CanvasRenderingContext2D | null = null;
  private camMediaRecorder: MediaRecorder | null = null;
  private camChunks: Blob[] = [];

  private rafId: number | null = null;
  private renderIntervalId: NodeJS.Timeout | null = null;
  private screenVideo: HTMLVideoElement | null = null;
  private camVideo: HTMLVideoElement | null = null;
  private remoteVideos = new Map<string, HTMLVideoElement>();

  private audioCtx: AudioContext | null = null;
  private audioDest: MediaStreamAudioDestinationNode | null = null;
  private connectedAudioNodes = new Map<string, MediaStreamAudioSourceNode>();

  private startTime = 0;
  private timerId: NodeJS.Timeout | null = null;

  private listeners = new Set<(status: WebinarRecorderStatus) => void>();

  private status: WebinarRecorderStatus = {
    isRecording: false,
    recordingId: null,
    durationMs: 0,
    isUploading: false,
    uploadProgress: 0,
    uploadError: null,
    mediaUrl: null,
  };

  subscribe(fn: (status: WebinarRecorderStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) {
      try {
        fn({ ...this.status });
      } catch (err) {
        console.error('[WebinarRecorder] listener error', err);
      }
    }
  }

  private updateStatus(patch: Partial<WebinarRecorderStatus>) {
    this.status = { ...this.status, ...patch };
    this.notify();
  }

  get isRecording(): boolean {
    return this.status.isRecording;
  }

  /**
   * Starts capturing the webinar stage (screen share + camera + audio).
   */
  start(recordingId: string): boolean {
    if (typeof window === 'undefined') return false;
    if (this.status.isRecording) return true;

    try {
      this.recordingId = recordingId;
      this.chunks = [];
      this.startTime = Date.now();

      // Create hidden 1280x720 canvas
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not create canvas 2d context');

      this.canvas = canvas;
      this.ctx = ctx;

      // Hidden video elements for decoding screen share and camera streams
      const screenVideo = document.createElement('video');
      screenVideo.muted = true;
      screenVideo.playsInline = true;
      screenVideo.autoplay = true;

      const camVideo = document.createElement('video');
      camVideo.muted = true;
      camVideo.playsInline = true;
      camVideo.autoplay = true;

      this.screenVideo = screenVideo;
      this.camVideo = camVideo;

      // 1. Paint initial base frame to canvas immediately
      ctx.fillStyle = '#070913';
      ctx.fillRect(0, 0, 1280, 720);

      // Web Audio setup for combining host mic + participant audio
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        try {
          const audioCtx = new AudioCtxClass();
          if (audioCtx.state === 'suspended') {
            void audioCtx.resume();
          }
          this.audioCtx = audioCtx;
          this.audioDest = audioCtx.createMediaStreamDestination();

          // Feed a silent oscillator through a 0-gain node. This forces the Web Audio
          // clock to advance in Chromium so MediaRecorder never stalls waiting for audio clock packets.
          const osc = audioCtx.createOscillator();
          const silence = audioCtx.createGain();
          silence.gain.value = 0.0;
          osc.connect(silence);
          silence.connect(this.audioDest);
          osc.start();
        } catch (audioErr) {
          console.warn('[WebinarRecorder] Web Audio setup warning:', audioErr);
        }
      }

      // Capture 30 fps stream from the canvas
      const canvasStream = canvas.captureStream(30);
      const combinedStream = new MediaStream();

      // Add video track from canvas
      const videoTrack = canvasStream.getVideoTracks()[0];
      if (videoTrack) combinedStream.addTrack(videoTrack);

      // Add audio destination track if available
      if (this.audioDest) {
        const audioTrack = this.audioDest.stream.getAudioTracks()[0];
        if (audioTrack) combinedStream.addTrack(audioTrack);
      }

      // Detect best supported MIME type
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ];
      let selectedMime = '';
      if (typeof MediaRecorder !== 'undefined') {
        for (const type of mimeTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            selectedMime = type;
            break;
          }
        }
      }

      const recorder = new MediaRecorder(
        combinedStream,
        selectedMime
          ? { mimeType: selectedMime, videoBitsPerSecond: 2_500_000 }
          : undefined
      );

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
          console.info(`[WebinarRecorder] Chunk #${this.chunks.length} received (${e.data.size} bytes)`);
        }
      };

      recorder.onerror = (e) => {
        console.warn('[WebinarRecorder] error', e);
      };

      recorder.start(1000); // 1-second chunks
      this.mediaRecorder = recorder;

      // Create dedicated 640x360 canvas for recording host & co-host cameras separately
      const camCanvas = document.createElement('canvas');
      camCanvas.width = 640;
      camCanvas.height = 360;
      const camCtx = camCanvas.getContext('2d', { alpha: false });
      if (camCtx) {
        camCtx.fillStyle = '#070913';
        camCtx.fillRect(0, 0, 640, 360);
        this.camCanvas = camCanvas;
        this.camCtx = camCtx;
        this.camChunks = [];

        try {
          const camStream = camCanvas.captureStream(30);
          const camRecorder = new MediaRecorder(
            camStream,
            selectedMime
              ? { mimeType: selectedMime, videoBitsPerSecond: 1_200_000 }
              : undefined
          );
          camRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              this.camChunks.push(e.data);
            }
          };
          camRecorder.start(1000);
          this.camMediaRecorder = camRecorder;
        } catch (camErr) {
          console.warn('[WebinarRecorder] camMediaRecorder setup warning:', camErr);
        }
      }

      // Start render loop
      this.startRenderLoop();

      // Start duration timer
      this.timerId = setInterval(() => {
        if (this.status.isRecording) {
          this.updateStatus({ durationMs: Date.now() - this.startTime });
        }
      }, 500);

      this.updateStatus({
        isRecording: true,
        recordingId,
        durationMs: 0,
        isUploading: false,
        uploadProgress: 0,
        uploadError: null,
      });

      console.info(`[WebinarRecorder] Started recording ${recordingId} (${selectedMime || 'default'})`);
      return true;
    } catch (err) {
      console.error('[WebinarRecorder] Failed to start client recording', err);
      return false;
    }
  }

  /**
   * Renders the composite stage on every frame:
   * - Screen share full frame when active
   * - Host camera picture-in-picture in bottom-right corner when both screen and camera are active
   * - Full camera when only camera is active
   * - Elegant branded presentation screen if neither video source is active yet
   */
  private syncRemoteVideos(
    remoteStreams: Record<string, import('@/store/roomStore').RemoteStream>
  ) {
    const activeProducerIds = new Set<string>();

    for (const [producerId, item] of Object.entries(remoteStreams)) {
      if (item.kind === 'video' && item.stream) {
        const track = item.stream.getVideoTracks()[0];
        if (track && track.readyState === 'live' && track.enabled) {
          activeProducerIds.add(producerId);
          let video = this.remoteVideos.get(producerId);
          if (!video) {
            video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.autoplay = true;
            video.srcObject = item.stream;
            video.play().catch(() => undefined);
            this.remoteVideos.set(producerId, video);
          } else if (video.srcObject !== item.stream) {
            video.srcObject = item.stream;
            video.play().catch(() => undefined);
          }
        }
      }
    }

    // Clean up closed remote videos
    for (const [id, video] of this.remoteVideos.entries()) {
      if (!activeProducerIds.has(id)) {
        video.srcObject = null;
        this.remoteVideos.delete(id);
      }
    }
  }

  private startRenderLoop() {
    let lastTime = performance.now();

    const render = () => {
      if (!this.status.isRecording || !this.canvas || !this.ctx) return;

      const now = performance.now();
      lastTime = now;

      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;

      // Read current state from room store
      const storeState = useRoomStore.getState();
      const screenStream = storeState.screenStream;
      const localStream = storeState.localStream;
      const webinarTitle = storeState.title || 'Live Webinar Presentation';

      // ── 1. Update Video Elements ────────────────────────────
      if (this.screenVideo) {
        const hasScreenTrack = Boolean(
          screenStream &&
          screenStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
        );
        if (hasScreenTrack && this.screenVideo.srcObject !== screenStream) {
          this.screenVideo.srcObject = screenStream;
          this.screenVideo.play().catch(() => undefined);
        } else if (!hasScreenTrack && this.screenVideo.srcObject) {
          this.screenVideo.srcObject = null;
        }
      }

      if (this.camVideo) {
        const hasCamTrack = Boolean(
          localStream &&
          storeState.camOn &&
          localStream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
        );
        if (hasCamTrack && this.camVideo.srcObject !== localStream) {
          this.camVideo.srcObject = localStream;
          this.camVideo.play().catch(() => undefined);
        } else if (!hasCamTrack && this.camVideo.srcObject) {
          this.camVideo.srcObject = null;
        }
      }

      // Sync remote participant video streams
      this.syncRemoteVideos(storeState.remoteStreams);

      // ── 2. Update Audio Mixing ──────────────────────────────
      this.syncAudioTracks(localStream, storeState.remoteStreams);

      // ── 3. Detect Active Media ──────────────────────────────
      // Local screen share
      const hasLocalScreen = Boolean(
        this.screenVideo &&
        this.screenVideo.srcObject &&
        this.screenVideo.readyState >= 2 &&
        this.screenVideo.videoWidth > 0
      );

      // Remote screen share (if a participant / moderator is sharing screen)
      let activeScreenVideo: HTMLVideoElement | null = hasLocalScreen ? this.screenVideo : null;

      if (!activeScreenVideo) {
        for (const [producerId, item] of Object.entries(storeState.remoteStreams)) {
          if (item.kind === 'video' && item.source === 'screen') {
            const v = this.remoteVideos.get(producerId);
            if (v && v.readyState >= 2 && v.videoWidth > 0) {
              activeScreenVideo = v;
              break;
            }
          }
        }
      }

      // Collect all active camera sources: host & remote speakers/moderators
      const cameraSources: { video: HTMLVideoElement; label: string; isSpotlight?: boolean }[] = [];

      // Host camera
      const hasHostCam = Boolean(
        this.camVideo &&
        this.camVideo.srcObject &&
        this.camVideo.readyState >= 2 &&
        this.camVideo.videoWidth > 0
      );
      if (hasHostCam && this.camVideo) {
        cameraSources.push({
          video: this.camVideo,
          label: storeState.name ? `${storeState.name} (Host)` : 'Host',
          isSpotlight: storeState.spotlightedPeerId === storeState.peerId,
        });
      }

      // Remote cameras
      for (const [producerId, item] of Object.entries(storeState.remoteStreams)) {
        if (item.kind === 'video' && item.source !== 'screen') {
          const v = this.remoteVideos.get(producerId);
          if (v && v.readyState >= 2 && v.videoWidth > 0) {
            const peer = storeState.peers[item.peerId];
            const name = peer?.name || 'Moderator';
            const role = peer?.role ? ` (${peer.role.toLowerCase()})` : '';
            cameraSources.push({
              video: v,
              label: `${name}${role}`,
              isSpotlight: storeState.spotlightedPeerId === item.peerId,
            });
          }
        }
      }

      // Prioritize spotlighted speaker first if any
      cameraSources.sort((a, b) => (b.isSpotlight ? 1 : 0) - (a.isSpotlight ? 1 : 0));

      // ── 4. Render Composite Canvas ──────────────────────────
      // Base background
      ctx.fillStyle = '#070913';
      ctx.fillRect(0, 0, w, h);

      if (activeScreenVideo) {
        // Mode A: SCREEN SHARE ACTIVE
        // Draw clean screen share fitted with 'contain' so nothing is zoomed or cropped
        // Host camera is recorded separately in camCanvas, NOT burned into slides!
        drawTile(ctx, activeScreenVideo, 0, 0, w, h, '', 'contain', 0);
      } else if (cameraSources.length === 1) {
        // Mode B: SINGLE CAMERA - Fill stage edge-to-edge (just like live webinar)
        drawTile(ctx, cameraSources[0].video, 0, 0, w, h, '', 'cover', 0);
      } else if (cameraSources.length === 2) {
        // Mode C: DUAL CAMERA - Side-by-side full height
        const halfW = Math.round(w / 2);
        drawTile(ctx, cameraSources[0].video, 0, 0, halfW, h, cameraSources[0].label, 'cover', 0);
        drawTile(ctx, cameraSources[1].video, halfW, 0, halfW, h, cameraSources[1].label, 'cover', 0);
      } else if (cameraSources.length >= 3) {
        // Mode D: MULTI-SPEAKER 4-UP GRID - Full 2x2 edge-to-edge
        const halfW = Math.round(w / 2);
        const halfH = Math.round(h / 2);
        drawTile(ctx, cameraSources[0].video, 0, 0, halfW, halfH, cameraSources[0].label, 'cover', 0);
        drawTile(ctx, cameraSources[1].video, halfW, 0, halfW, halfH, cameraSources[1].label, 'cover', 0);
        if (cameraSources[2]) drawTile(ctx, cameraSources[2].video, 0, halfH, halfW, halfH, cameraSources[2].label, 'cover', 0);
        if (cameraSources[3]) drawTile(ctx, cameraSources[3].video, halfW, halfH, halfW, halfH, cameraSources[3].label, 'cover', 0);
      } else {
        // Mode E: BRANDED WAITING STAGE (No video active)
        const glow = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 400);
        glow.addColorStop(0, 'rgba(14, 165, 233, 0.15)');
        glow.addColorStop(1, 'rgba(7, 9, 19, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);

        const cardW = 540;
        const cardH = 260;
        const cardX = (w - cardW) / 2;
        const cardY = (h - cardH) / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, cardX, cardY, cardW, cardH, 20);
        ctx.fill();
        ctx.stroke();

        const pulse = (Math.sin(now / 300) + 1) / 2;
        ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + pulse * 0.6})`;
        ctx.beginPath();
        ctx.arc(cardX + cardW / 2 - 80, cardY + 60, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '700 13px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.fillText('REC • LIVE WEBINAR', cardX + cardW / 2 - 65, cardY + 64);

        ctx.font = '700 24px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        const displayTitle = webinarTitle.length > 40 ? webinarTitle.slice(0, 38) + '...' : webinarTitle;
        ctx.fillText(displayTitle, w / 2, cardY + 120);

        ctx.font = '500 14px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Session audio and stage feed active', w / 2, cardY + 155);

        const waveY = cardY + 205;
        const barCount = 18;
        const barW = 4;
        const barGap = 6;
        const totalW = barCount * (barW + barGap) - barGap;
        const startX = (w - totalW) / 2;

        ctx.fillStyle = '#38bdf8';
        for (let i = 0; i < barCount; i++) {
          const barH = 6 + Math.abs(Math.sin((now / 200) + i * 0.4)) * 24;
          const bx = startX + i * (barW + barGap);
          const by = waveY - barH / 2;
          ctx.fillRect(bx, by, barW, barH);
        }

        ctx.textAlign = 'start';
      }

      // ── 5. Render Dedicated Host Camera Feed (for top-strip tile) ──
      if (this.camCtx && this.camCanvas) {
        const camCtx = this.camCtx;
        const cw = this.camCanvas.width;
        const ch = this.camCanvas.height;

        camCtx.fillStyle = '#070913';
        camCtx.fillRect(0, 0, cw, ch);

        if (cameraSources.length === 1) {
          // Single host: clean full cover tile
          drawTile(camCtx, cameraSources[0].video, 0, 0, cw, ch, cameraSources[0].label, 'cover', 0);
        } else if (cameraSources.length === 2) {
          // Dual host: side-by-side
          const halfW = Math.round(cw / 2);
          drawTile(camCtx, cameraSources[0].video, 0, 0, halfW, ch, cameraSources[0].label, 'cover', 0);
          drawTile(camCtx, cameraSources[1].video, halfW, 0, halfW, ch, cameraSources[1].label, 'cover', 0);
        } else if (cameraSources.length >= 3) {
          // Multi-host 2x2 grid
          const halfW = Math.round(cw / 2);
          const halfH = Math.round(ch / 2);
          drawTile(camCtx, cameraSources[0].video, 0, 0, halfW, halfH, cameraSources[0].label, 'cover', 0);
          drawTile(camCtx, cameraSources[1].video, halfW, 0, halfW, halfH, cameraSources[1].label, 'cover', 0);
          if (cameraSources[2]) drawTile(camCtx, cameraSources[2].video, 0, halfH, halfW, halfH, cameraSources[2].label, 'cover', 0);
          if (cameraSources[3]) drawTile(camCtx, cameraSources[3].video, halfW, halfH, halfW, halfH, cameraSources[3].label, 'cover', 0);
        } else {
          // Host camera is off: render dummy avatar tile with initials
          camCtx.fillStyle = '#0f172a';
          camCtx.fillRect(0, 0, cw, ch);
          const hostName = storeState.name || 'Host';
          const initials = hostName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'H';
          camCtx.fillStyle = '#38bdf8';
          camCtx.beginPath();
          camCtx.arc(cw / 2, ch / 2 - 16, 42, 0, Math.PI * 2);
          camCtx.fill();
          camCtx.font = '700 32px system-ui, -apple-system, sans-serif';
          camCtx.fillStyle = '#ffffff';
          camCtx.textAlign = 'center';
          camCtx.fillText(initials, cw / 2, ch / 2 - 5);
          camCtx.font = '600 16px system-ui, -apple-system, sans-serif';
          camCtx.fillStyle = '#cbd5e1';
          camCtx.fillText(`${hostName} (Host)`, cw / 2, ch / 2 + 54);
        }
      }
    };

    // 1. rAF loop for smooth rendering on active tab
    const animLoop = () => {
      if (!this.status.isRecording) return;
      render();
      this.rafId = requestAnimationFrame(animLoop);
    };
    this.rafId = requestAnimationFrame(animLoop);

    // 2. 30fps interval timer fallback so screen share + cameras continue
    // to composite even when the webinar tab is minimized or in the background
    this.renderIntervalId = setInterval(() => {
      render();
    }, 1000 / 30);
  }

  /**
   * Connects microphone and remote audio streams to the audio destination node.
   */
  private syncAudioTracks(
    localStream: MediaStream | null,
    remoteStreams: Record<string, { stream: MediaStream; kind: 'audio' | 'video' }>
  ) {
    if (!this.audioCtx || !this.audioDest) return;

    // 1. Connect local mic
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === 'live' && audioTrack.enabled) {
        if (!this.connectedAudioNodes.has('local-mic')) {
          try {
            const source = this.audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
            source.connect(this.audioDest);
            this.connectedAudioNodes.set('local-mic', source);
          } catch {
            // ignore
          }
        }
      } else {
        const existing = this.connectedAudioNodes.get('local-mic');
        if (existing) {
          try {
            existing.disconnect();
          } catch {
            // ignore
          }
          this.connectedAudioNodes.delete('local-mic');
        }
      }
    }

    // 2. Connect remote participant audio
    for (const [key, item] of Object.entries(remoteStreams)) {
      if (item.kind === 'audio' && item.stream) {
        const audioTrack = item.stream.getAudioTracks()[0];
        if (audioTrack && audioTrack.readyState === 'live' && audioTrack.enabled) {
          if (!this.connectedAudioNodes.has(key)) {
            try {
              const source = this.audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
              source.connect(this.audioDest);
              this.connectedAudioNodes.set(key, source);
            } catch {
              // ignore
            }
          }
        }
      }
    }
  }

  /**
   * Stops recording and uploads the media blob to the server.
   */
  async stop(): Promise<Blob | null> {
    if (!this.status.isRecording) return null;

    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.renderIntervalId) {
      clearInterval(this.renderIntervalId);
      this.renderIntervalId = null;
    }

    const recordingId = this.recordingId;
    this.updateStatus({ isRecording: false });

    // Stop media recorder and wait for final blob
    const blob = await new Promise<Blob | null>((resolve) => {
      const recorder = this.mediaRecorder;
      if (!recorder || recorder.state === 'inactive') {
        const b = this.chunks.length > 0 ? new Blob(this.chunks, { type: this.chunks[0].type }) : null;
        return resolve(b);
      }

      recorder.onstop = () => {
        const mime = this.chunks[0]?.type || 'video/webm';
        const finalBlob = new Blob(this.chunks, { type: mime });
        resolve(finalBlob);
      };

      try {
        if (recorder.state === 'recording') {
          try { recorder.requestData(); } catch {}
        }
        recorder.stop();
      } catch (stopErr) {
        console.warn('[WebinarRecorder] recorder.stop error:', stopErr);
        const b = this.chunks.length > 0 ? new Blob(this.chunks, { type: this.chunks[0].type }) : null;
        resolve(b);
      }
    });

    // Cleanup video elements & audio nodes
    if (this.screenVideo) {
      this.screenVideo.srcObject = null;
      this.screenVideo = null;
    }
    if (this.camVideo) {
      this.camVideo.srcObject = null;
      this.camVideo = null;
    }
    for (const v of this.remoteVideos.values()) {
      v.srcObject = null;
    }
    this.remoteVideos.clear();
    for (const node of this.connectedAudioNodes.values()) {
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
    this.connectedAudioNodes.clear();

    if (this.audioCtx) {
      try {
        await this.audioCtx.close();
      } catch {
        // ignore
      }
      this.audioCtx = null;
      this.audioDest = null;
    }

    // Stop cam recorder and wait for cam blob
    const camBlob = await new Promise<Blob | null>((resolve) => {
      const camRec = this.camMediaRecorder;
      if (!camRec || camRec.state === 'inactive') {
        const b = this.camChunks.length > 0 ? new Blob(this.camChunks, { type: this.camChunks[0].type }) : null;
        return resolve(b);
      }
      camRec.onstop = () => {
        const mime = this.camChunks[0]?.type || 'video/webm';
        resolve(new Blob(this.camChunks, { type: mime }));
      };
      try {
        if (camRec.state === 'recording') {
          try { camRec.requestData(); } catch {}
        }
        camRec.stop();
      } catch (camStopErr) {
        console.warn('[WebinarRecorder] camMediaRecorder.stop error:', camStopErr);
        const b = this.camChunks.length > 0 ? new Blob(this.camChunks, { type: this.camChunks[0].type }) : null;
        resolve(b);
      }
    });

    this.mediaRecorder = null;
    this.canvas = null;
    this.ctx = null;
    this.camMediaRecorder = null;
    this.camCanvas = null;
    this.camCtx = null;

    if (!blob || blob.size < 1024 || !recordingId) {
      console.warn('[WebinarRecorder] Finished with empty or tiny blob:', blob?.size ?? 0);
      return blob;
    }

    console.info(`[WebinarRecorder] Finished client capture for ${recordingId}: main=${(blob.size / 1024 / 1024).toFixed(2)} MB, cam=${((camBlob?.size ?? 0) / 1024 / 1024).toFixed(2)} MB`);

    // Upload both streams to server
    void (async () => {
      try {
        await this.uploadMedia(recordingId, blob, 'main');
        if (camBlob && camBlob.size >= 1024) {
          await this.uploadMedia(recordingId, camBlob, 'cam');
        }
      } catch (uploadErr) {
        console.error('[WebinarRecorder] Failed uploading recordings:', uploadErr);
      }
    })();

    return blob;
  }

  /**
   * Uploads recorded media to `/api/recordings/:id/upload`.
   */
  private async uploadMedia(recordingId: string, blob: Blob, track: 'main' | 'cam' = 'main') {
    if (track === 'main') {
      this.updateStatus({
        isUploading: true,
        uploadProgress: 10,
        uploadError: null,
      });
    }

    try {
      const token = roomToken();
      const uploadUrl = `${API_URL}/api/recordings/${encodeURIComponent(recordingId)}/upload?track=${track}`;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', blob.type || 'video/webm');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
          this.updateStatus({ uploadProgress: percent });
        }
      };

      const result = await new Promise<{ ok: boolean; mediaBytes: number }>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              resolve(res);
            } catch {
              resolve({ ok: true, mediaBytes: blob.size });
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during recording upload'));
        xhr.send(blob);
      });

      console.info(`[WebinarRecorder] Successfully uploaded media for ${recordingId} (${result.mediaBytes} bytes)`);

      this.updateStatus({
        isUploading: false,
        uploadProgress: 100,
        mediaUrl: `${API_URL}/api/recordings/${encodeURIComponent(recordingId)}/media`,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Upload failed';
      console.error('[WebinarRecorder] Upload failed:', err);
      this.updateStatus({
        isUploading: false,
        uploadError: errMsg,
      });
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws a video element fitted and clipped into [x, y, w, h] with optional rounded corners and label chip.
 */
function drawTile(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  fit: 'contain' | 'cover' = 'cover',
  radius = 0
) {
  if (video.readyState < 2 || video.videoWidth === 0) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  ctx.save();

  if (radius > 0) {
    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;

    // Fill background behind tile
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = '#0b0f19';
    ctx.fill();

    // Clip to rounded rectangle
    ctx.clip();
    ctx.shadowColor = 'transparent';
  }

  let dw = w;
  let dh = h;
  let dx = x;
  let dy = y;

  if (fit === 'contain') {
    const scale = Math.min(w / vw, h / vh);
    dw = vw * scale;
    dh = vh * scale;
    dx = x + (w - dw) / 2;
    dy = y + (h - dh) / 2;
  } else {
    const scale = Math.max(w / vw, h / vh);
    dw = vw * scale;
    dh = vh * scale;
    dx = x + (w - dw) / 2;
    dy = y + (h - dh) / 2;
  }

  ctx.drawImage(video, dx, dy, dw, dh);

  // Gradient overlay & name label badge at bottom
  if (label) {
    const gradH = 34;
    const grad = ctx.createLinearGradient(x, y + h - gradH, x, y + h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + h - gradH, w, gradH);

    ctx.font = '600 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + 12, y + h - 10);
  }

  // Border
  if (radius > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();
  }

  ctx.restore();
}

export const webinarRecorder = new WebinarClientRecorder();

