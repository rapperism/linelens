// In-app demo recording: getDisplayMedia(preferCurrentTab) + MediaRecorder.
// One click on the line-room PC produces a .webm the editor can cut into the
// 3-minute submission video.

export class DemoRecorder {
  constructor() {
    this.supported = Boolean(
      typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia && typeof window.MediaRecorder !== 'undefined',
    );
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.startedAt = 0;
    this.timer = null;
    this.onTick = null;
    this.surface = null;
  }

  get active() {
    return Boolean(this.recorder) && this.recorder.state !== 'inactive';
  }

  async start({ onTick, onStop } = {}) {
    if (!this.supported) throw new Error('unsupported');
    this.onTick = onTick;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30, displaySurface: 'browser' },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
    });
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings?.() || {};
    this.surface = settings.displaySurface || null;

    const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = mimeCandidates.find((m) => window.MediaRecorder.isTypeSupported?.(m)) || '';

    this.chunks = [];
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 4_500_000,
    });
    this.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `linelens-demo-${stamp}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.cleanup();
      onStop?.({ blob, surface: this.surface, mimeType });
    };

    // Stop when the user stops sharing from Chrome's own bar.
    track.addEventListener('ended', () => {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    });

    recorder.start(1000);
    this.startedAt = performance.now();
    const tick = () => {
      const seconds = Math.floor((performance.now() - this.startedAt) / 1000);
      this.onTick?.({ seconds });
    };
    tick();
    this.timer = setInterval(tick, 1000);
    return { surface: this.surface };
  }

  stop() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    else this.cleanup();
  }

  cleanup() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.recorder = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
