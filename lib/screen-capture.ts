/**
 * One-shot screen/tab snapshot via the Screen Capture API
 * (`getDisplayMedia`) — same approach as UserJot's "native screenshot".
 *
 * Flow: request stream (prefer current tab) → wait for first non-black
 * frame → draw to canvas → JPEG encode (with size budget) → stop tracks.
 *
 * Requires a user gesture. Returns null if the user cancels the picker or
 * the API is unavailable.
 */

export type ScreenCaptureResult = {
  file: File;
  width: number;
  height: number;
  dataUrl: string;
};

export type ScreenCaptureOptions = {
  /** Max long-edge in CSS/device pixels after capture. Default 1920. */
  maxEdge?: number;
  /** Target max file size in bytes. Default 1.4 MB (under feedback upload cap). */
  maxBytes?: number;
  /** Prefer JPEG quality before stepping down. Default 0.88. */
  quality?: number;
  /**
   * Called just before the capture frame is taken (e.g. hide the feedback
   * widget so it doesn't appear in the shot). Restored in a finally block
   * by the caller if needed; this helper does not restore UI.
   */
  beforeCapture?: () => void;
};

const DEFAULT_MAX_EDGE = 1920;
const DEFAULT_MAX_BYTES = 1_400_000;
const DEFAULT_QUALITY = 0.88;

function supportsDisplayMedia(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  );
}

async function waitForVideoFrame(
  video: HTMLVideoElement,
  stream: MediaStream,
  attempts = 50,
  intervalMs = 100,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      // Probe a tiny canvas for non-black pixels (some browsers deliver a
      // black first frame while the compositor catches up).
      const probe = document.createElement('canvas');
      const pw = Math.min(12, video.videoWidth);
      const ph = Math.min(12, video.videoHeight);
      probe.width = pw;
      probe.height = ph;
      const ctx = probe.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, pw, ph);
        const data = ctx.getImageData(0, 0, pw, ph).data;
        let hasContent = false;
        for (let p = 0; p < data.length; p += 4) {
          // ignore alpha channel
          if (data[p] > 2 || data[p + 1] > 2 || data[p + 2] > 2) {
            hasContent = true;
            break;
          }
        }
        if (hasContent) return;
      }
    }
    // Stream may have ended (user closed the picker share bar early)
    if (stream.getVideoTracks().every((t) => t.readyState === 'ended')) {
      throw new Error('Screen share ended before capture');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  // Proceed anyway — some surfaces are legitimately dark
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}

function scaleDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function canvasToJpegFile(
  canvas: HTMLCanvasElement,
  maxBytes: number,
  startQuality: number,
): Promise<{ file: File; dataUrl: string }> {
  let quality = startQuality;
  for (let attempt = 0; attempt < 6; attempt++) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    // data URL → blob without fetch (works offline / extension CSP)
    const comma = dataUrl.indexOf(',');
    const b64 = dataUrl.slice(comma + 1);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    if (bytes.byteLength <= maxBytes || quality <= 0.45) {
      const file = new File([bytes], `screenshot-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      return { file, dataUrl };
    }

    // Too big — drop quality, and after a couple tries also shrink canvas
    quality = Math.max(0.45, quality - 0.12);
    if (attempt === 2 || attempt === 4) {
      const nextW = Math.max(640, Math.round(canvas.width * 0.75));
      const nextH = Math.max(360, Math.round(canvas.height * 0.75));
      const smaller = document.createElement('canvas');
      smaller.width = nextW;
      smaller.height = nextH;
      const ctx = smaller.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, nextW, nextH);
        canvas.width = nextW;
        canvas.height = nextH;
        const ctx2 = canvas.getContext('2d');
        if (ctx2) {
          ctx2.drawImage(smaller, 0, 0);
        }
      }
    }
  }

  // Last resort
  const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
  const comma = dataUrl.indexOf(',');
  const b64 = dataUrl.slice(comma + 1);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], `screenshot-${Date.now()}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
  return { file, dataUrl };
}

/**
 * Capture a single snapshot of the current tab / a shared surface.
 * Returns null if the user cancels or the API is missing.
 */
export async function captureScreenSnapshot(
  options: ScreenCaptureOptions = {},
): Promise<ScreenCaptureResult | null> {
  if (!supportsDisplayMedia()) {
    throw new Error('Skærmoptagelse understøttes ikke i denne browser');
  }

  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const quality = options.quality ?? DEFAULT_QUALITY;

  const dpr = window.devicePixelRatio || 1;
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;

  try {
    // Chrome/Edge: preferCurrentTab + selfBrowserSurface make the current
    // Lectio tab the default pick (UserJot's options). Unknown keys are
    // ignored by browsers that don't support them.
    // Chromium extras (preferCurrentTab / selfBrowserSurface / …) aren't in
    // every lib.dom revision yet — cast keeps the call site clean.
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',
        width: { ideal: Math.round(window.innerWidth * dpr) },
        height: { ideal: Math.round(window.innerHeight * dpr) },
        frameRate: { ideal: 30 },
      },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      systemAudio: 'exclude',
      surfaceSwitching: 'exclude',
    } as DisplayMediaStreamOptions);

    video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    // Keep off-screen but still painted so frames decode
    video.setAttribute('playsinline', '');
    video.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;';
    document.documentElement.appendChild(video);

    await video.play();
    await waitForVideoFrame(video, stream);

    // Hide caller UI (feedback panel) so it doesn't end up in the shot
    options.beforeCapture?.();
    // One paint after hide
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 50));

    const srcW = video.videoWidth || Math.round(window.innerWidth * dpr);
    const srcH = video.videoHeight || Math.round(window.innerHeight * dpr);
    const { width, height } = scaleDimensions(srcW, srcH, maxEdge);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Kunne ikke oprette canvas');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(video, 0, 0, width, height);

    // Stop capture ASAP so the browser chrome "sharing" indicator goes away
    stopStream(stream);
    stream = null;
    if (video.parentNode) video.parentNode.removeChild(video);
    video.srcObject = null;
    video = null;

    const { file, dataUrl } = await canvasToJpegFile(canvas, maxBytes, quality);
    return { file, width, height, dataUrl };
  } catch (err) {
    stopStream(stream);
    if (video?.parentNode) video.parentNode.removeChild(video);

    // User cancelled the share picker — not an error worth surfacing hard
    if (
      err instanceof DOMException &&
      (err.name === 'NotAllowedError' || err.name === 'AbortError')
    ) {
      return null;
    }
    throw err;
  }
}

export function canCaptureScreen(): boolean {
  return supportsDisplayMedia();
}
