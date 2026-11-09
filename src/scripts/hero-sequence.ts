type VariantName = 'desktop' | 'mobile';

interface SequenceVariant {
  frameCount: number;
  width: number;
  height: number;
  urls: string[];
}

interface SequenceManifest {
  variants: Record<VariantName, SequenceVariant>;
}

interface DecodedFrame {
  image: CanvasImageSource;
  close: () => void;
}

interface FrameRequest {
  controller: AbortController;
  promise: Promise<DecodedFrame>;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** The manifest, rather than the source video's nominal duration, owns the count. */
export function progressToFrame(progress: number, frameCount: number): number {
  return Math.round(clamp(progress) * Math.max(0, frameCount - 1));
}

/** The supplied film reveals the logo between 70% and 75% of its sampled frames. */
export function copyOpacityForFrame(frame: number, frameCount: number): number {
  const position = frame / Math.max(1, frameCount - 1);
  return clamp((position - 0.7) / 0.05);
}

/** Current frame first, followed by a small directional working set. */
export function frameWindow(target: number, direction: number, count: number, limit: number): number[] {
  const step = direction < 0 ? -1 : 1;
  const offsets = [0, step, 2 * step, -step, 3 * step, -2 * step, 4 * step, 5 * step];
  return offsets.map((offset) => target + offset).filter((index) => index >= 0 && index < count).slice(0, limit);
}

function readManifest(value: unknown): SequenceManifest {
  const manifest = value as SequenceManifest | undefined;
  for (const name of ['desktop', 'mobile'] as const) {
    const variant = manifest?.variants?.[name];
    if (!variant || !Number.isInteger(variant.frameCount) || variant.frameCount < 2 ||
      !Number.isFinite(variant.width) || !Number.isFinite(variant.height) ||
      variant.width <= 0 || variant.height <= 0 || !Array.isArray(variant.urls) ||
      variant.urls.length !== variant.frameCount || variant.urls.some((url) => typeof url !== 'string' || !url)) {
      throw new Error('Invalid hero sequence manifest');
    }
  }
  return manifest!;
}

function initialAnchorSkipsHero(shell: HTMLElement): boolean {
  if (!window.location.hash) return false;
  let id: string;
  try { id = decodeURIComponent(window.location.hash.slice(1)); }
  catch { return false; }
  const anchor = document.getElementById(id);
  return Boolean(anchor && !anchor.contains(shell) && !shell.contains(anchor) &&
    (shell.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING));
}

async function decodeFrame(blob: Blob, signal: AbortSignal): Promise<DecodedFrame> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      if (signal.aborted) {
        bitmap.close();
        throw new DOMException('Aborted', 'AbortError');
      }
      return { image: bitmap, close: () => bitmap.close() };
    } catch (error) {
      if (signal.aborted) throw error;
      // Some browser/codec combinations support <img> but not ImageBitmap.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const clear = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', abort);
    };
    const close = () => { URL.revokeObjectURL(url); image.removeAttribute('src'); };
    const abort = () => {
      clear();
      close();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    image.onload = () => {
      clear();
      URL.revokeObjectURL(url);
      resolve({ image, close });
    };
    image.onerror = () => { clear(); close(); reject(new Error('Could not decode hero frame')); };
    signal.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
}

/** Native scrolling + one CSS sticky owner. All essential content stays in HTML. */
export function initHeroSequence(shell: HTMLElement): () => void {
  const heroElement = shell.querySelector<HTMLElement>('.hero');
  const stageElement = shell.querySelector<HTMLElement>('[data-sequence-stage]');
  const canvasElement = shell.querySelector<HTMLCanvasElement>('[data-sequence-canvas]');
  const toggle = shell.querySelector<HTMLButtonElement>('[data-sequence-toggle]');
  const progressBar = shell.querySelector<HTMLElement>('[data-sequence-progress]');
  const motionCues = shell.querySelectorAll<HTMLElement>('.sequence-cue, .sequence-track');
  const canvasContext = canvasElement?.getContext('2d', { alpha: true });
  if (!heroElement || !stageElement || !canvasElement || !canvasContext || !shell.dataset.sequenceManifest) {
    shell.dataset.sequenceState = 'failed';
    delete shell.dataset.sequencePin;
    return () => {};
  }
  const hero = heroElement;
  const stage = stageElement;
  const canvas = canvasElement;
  const context = canvasContext;

  const header = document.querySelector<HTMLElement>('.site-header');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const assetBase = new URL(shell.dataset.sequenceBase || '/', window.location.origin);
  const manifestURL = new URL(shell.dataset.sequenceManifest, window.location.href).href;
  const cache = new Map<number, DecodedFrame>();
  const requests = new Map<number, FrameRequest>();
  const failures = new Map<number, number>();
  let manifest: SequenceManifest | undefined;
  let manifestController: AbortController | undefined;
  let variantName: VariantName = window.innerWidth < 900 ? 'mobile' : 'desktop';
  let variant: SequenceVariant | undefined;
  let manualStatic = new URLSearchParams(window.location.search).get('motion') === 'static';
  let disposed = false;
  let suspended = false;
  let ready = false;
  let starting = false;
  let failed = false;
  let epoch = 0;
  let raf = 0;
  let geometryDirty = true;
  let compositionDirty = true;
  let resized = false;
  let topOffset = 94;
  let distance = window.innerHeight * 1.5;
  let shellTop = 0;
  let shellInset = 0;
  let progress = 0;
  let direction = 1;
  let target = 0;
  let displayed = -1;
  let pinDecided = false;
  let pinAllowed = false;
  // Native fragment scrolling may still report scrollY=0 when this module initializes.
  let anchorSkipsHero = initialAnchorSkipsHero(shell);
  let resizeAnchor: { raw: number; progress: number } | undefined;

  const isStatic = () => manualStatic || reducedMotion.matches;
  const isPaused = () => disposed || suspended || document.hidden || isStatic();
  const cacheLimit = () => variantName === 'desktop' ? 8 : 6;
  const concurrency = () => variantName === 'desktop' ? 3 : 2;
  const updateDiagnostics = () => {
    shell.dataset.currentFrame = String(displayed);
    shell.dataset.targetFrame = String(target);
    shell.dataset.variant = variantName;
    shell.dataset.cacheSize = String(cache.size);
    shell.dataset.inFlight = String(requests.size);
    shell.dataset.sequencePosition = progress.toFixed(4);
  };
  const stageIsNear = () => {
    const rect = stage.getBoundingClientRect();
    return rect.bottom > topOffset - 100 && rect.top < window.innerHeight + 140;
  };
  const schedule = () => {
    if (!raf && !disposed && !suspended && !document.hidden) raf = requestAnimationFrame(render);
  };
  const clearFrames = () => {
    for (const request of requests.values()) request.controller.abort();
    requests.clear();
    for (const resource of cache.values()) resource.close();
    cache.clear();
    failures.clear();
    updateDiagnostics();
  };
  const stopLoading = () => {
    epoch += 1;
    manifestController?.abort();
    manifestController = undefined;
    starting = false;
    clearFrames();
  };
  const showPoster = (state: 'static' | 'failed') => {
    const previousHero = hero.getBoundingClientRect();
    const preservePosition = shell.dataset.sequencePin === 'true' &&
      previousHero.bottom > topOffset && previousHero.top < window.innerHeight;
    stopLoading();
    ready = false;
    displayed = -1;
    delete shell.dataset.sequenceDrawn;
    delete shell.dataset.sequencePin;
    shell.dataset.sequenceState = state;
    shell.style.removeProperty('--sequence-distance');
    if (preservePosition) {
      // Removing the sticky interval should not move the control the visitor just used.
      const shift = hero.getBoundingClientRect().top - previousHero.top;
      if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: 'instant' });
    }
    motionCues.forEach((cue) => { cue.hidden = true; });
    if (progressBar) progressBar.style.transform = 'scaleX(0)';
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(state === 'static'));
      toggle.hidden = state === 'failed' || reducedMotion.matches;
    }
    updateDiagnostics();
  };

  function trimCache() {
    while (cache.size > cacheLimit()) {
      const eviction = [...cache.keys()]
        .filter((index) => index !== target && index !== displayed)
        .sort((a, b) => Math.abs(b - target) - Math.abs(a - target))[0];
      if (eviction === undefined) break;
      cache.get(eviction)?.close();
      cache.delete(eviction);
    }
    updateDiagnostics();
  }

  function loadFrame(index: number): Promise<DecodedFrame> {
    const cached = cache.get(index);
    if (cached) return Promise.resolve(cached);
    const existing = requests.get(index);
    if (existing) return existing.promise;
    const selected = variant;
    if (!selected) return Promise.reject(new Error('Sequence is not initialized'));
    const requestEpoch = epoch;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const promise = (async () => {
      const response = await fetch(new URL(selected.urls[index], assetBase), {
        signal: controller.signal,
        cache: 'force-cache',
      });
      if (!response.ok) throw new Error(`Hero frame unavailable: ${response.status}`);
      const resource = await decodeFrame(await response.blob(), controller.signal);
      if (disposed || controller.signal.aborted || requestEpoch !== epoch) {
        resource.close();
        throw new DOMException('Aborted', 'AbortError');
      }
      cache.set(index, resource);
      trimCache();
      return resource;
    })().finally(() => {
      window.clearTimeout(timeout);
      if (requests.get(index)?.controller === controller) requests.delete(index);
      updateDiagnostics();
    });
    requests.set(index, { controller, promise });
    updateDiagnostics();
    return promise;
  }

  function pump() {
    if (!ready || !variant || isPaused() || !stageIsNear()) return;
    const wanted = frameWindow(target, direction, variant.frameCount, cacheLimit() - 1);
    // Release obsolete requests after a fast scroll so the current target cannot starve.
    for (const [index, request] of requests) {
      if (!wanted.includes(index) && Math.abs(index - target) > cacheLimit()) {
        request.controller.abort();
      }
    }
    for (const index of wanted) {
      if (requests.size >= concurrency()) break;
      if (cache.has(index) || requests.has(index) || (failures.get(index) || 0) > Date.now()) continue;
      const requestEpoch = epoch;
      void loadFrame(index).catch((error: unknown) => {
        if (requestEpoch === epoch && !(error instanceof DOMException && error.name === 'AbortError')) {
          failures.set(index, Date.now() + 4_000);
        }
      }).finally(() => {
        if (requestEpoch === epoch) schedule();
      });
    }
  }

  function measure() {
    topOffset = Math.ceil(header?.getBoundingClientRect().height || 0) + 12;
    distance = Math.round(window.innerHeight * 1.5);
    shellTop = shell.getBoundingClientRect().top + window.scrollY;
    shellInset = parseFloat(window.getComputedStyle(shell).paddingTop) || 0;
    shell.style.setProperty('--sequence-top', `${topOffset}px`);
    shell.style.setProperty('--sequence-distance', `${distance}px`);
    if (ready && !isStatic()) {
      const nearStart = window.scrollY <= shellTop + 24;
      if (!pinDecided) {
        pinDecided = true;
        pinAllowed = nearStart && !anchorSkipsHero;
      }
      const fits = window.innerWidth >= 1000 && hero.getBoundingClientRect().height <= window.innerHeight - topOffset - 8;
      const alreadyPinned = shell.dataset.sequencePin === 'true';
      if (pinAllowed && fits && (alreadyPinned || nearStart)) {
        shell.dataset.sequencePin = 'true';
      } else {
        delete shell.dataset.sequencePin;
        if (!nearStart) pinAllowed = false;
      }
    }
    geometryDirty = false;
  }

  function rawProgress(): number {
    if (shell.dataset.sequencePin === 'true') {
      return clamp((window.scrollY - (shellTop + shellInset - topOffset)) / Math.max(1, distance));
    }
    const artwork = stage.getBoundingClientRect();
    const artworkTop = artwork.top + window.scrollY;
    const start = Math.max(0, artworkTop - window.innerHeight);
    // A background stage can begin directly below the header. Keep enough native
    // scroll travel to reveal it progressively, finishing while its logo is visible.
    const minimumTravel = Math.min(artwork.height * 0.35, window.innerHeight * 0.25);
    const end = Math.max(start + Math.max(1, minimumTravel), artworkTop - topOffset);
    return clamp((window.scrollY - start) / (end - start));
  }

  function mappedProgress(raw: number): number {
    if (!resizeAnchor) return raw;
    const anchor = resizeAnchor;
    return raw <= anchor.raw
      ? anchor.progress * raw / anchor.raw
      : anchor.progress + (1 - anchor.progress) * (raw - anchor.raw) / (1 - anchor.raw);
  }

  async function start() {
    if (starting || ready || failed || isPaused() || !stageIsNear()) return;
    starting = true;
    shell.dataset.sequenceState = 'loading';
    motionCues.forEach((cue) => { cue.hidden = true; });
    const startEpoch = epoch;
    try {
      if (!manifest) {
        const controller = new AbortController();
        manifestController = controller;
        const timeout = window.setTimeout(() => controller.abort(), 10_000);
        try {
          const response = await fetch(manifestURL, { signal: controller.signal, cache: 'force-cache' });
          if (!response.ok) throw new Error('Hero manifest unavailable');
          const value: unknown = await response.json();
          if (startEpoch !== epoch || disposed) return;
          manifest = readManifest(value);
        } finally {
          window.clearTimeout(timeout);
          if (manifestController === controller) manifestController = undefined;
        }
      }
      if (startEpoch !== epoch || isPaused() || !stageIsNear()) return;
      variantName = window.innerWidth < 900 ? 'mobile' : 'desktop';
      variant = manifest.variants[variantName];
      // A verified opening frame is the boundary between loading and a working animation.
      await loadFrame(0);
      if (startEpoch !== epoch || isPaused()) return;
      ready = true;
      shell.dataset.sequenceState = 'ready';
      motionCues.forEach((cue) => { cue.hidden = false; });
      if (toggle) { toggle.hidden = false; toggle.setAttribute('aria-pressed', 'false'); }
      geometryDirty = true;
      compositionDirty = true;
      schedule();
    } catch (error) {
      if (startEpoch === epoch && !isPaused()) {
        // Later missing frames simply hold the last valid image; only startup fails closed.
        failed = true;
        showPoster('failed');
      }
    } finally {
      if (startEpoch === epoch) starting = false;
    }
  }

  function draw() {
    if (!variant || !cache.size || !stageIsNear()) return;
    // Responsive reloads and bfcache keep their last painted canvas until its replacement is ready.
    if (displayed < 0 && shell.dataset.sequenceDrawn === 'true' && !cache.has(target)) return;
    let index = cache.has(target) ? target : [...cache.keys()].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    if (index === undefined) return;
    if (displayed >= 0 && cache.has(displayed) && Math.abs(displayed - target) < Math.abs(index - target)) index = displayed;
    if (index === displayed && !compositionDirty) return;
    const resource = cache.get(index);
    if (!resource) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const density = Math.min(window.devicePixelRatio || 1, 1.5, variant.width / rect.width, variant.height / rect.height);
    const width = Math.max(1, Math.round(rect.width * density));
    const height = Math.max(1, Math.round(rect.height * density));
    const ratio = Math.min(width / variant.width, height / variant.height);
    const drawWidth = variant.width * ratio;
    const drawHeight = variant.height * ratio;
    // A valid replacement is ready before touching the backing store; no empty-frame paint.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(resource.image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    displayed = index;
    // Follow the image actually painted, so slow loads cannot reveal text before the logo.
    shell.style.setProperty('--sequence-copy-opacity', String(copyOpacityForFrame(index, variant.frameCount)));
    compositionDirty = false;
    shell.dataset.sequenceDrawn = 'true';
    trimCache();
  }

  function render() {
    raf = 0;
    if (isPaused()) return;
    if (geometryDirty) measure();
    if (!ready) { void start(); return; }
    const raw = rawProgress();
    if (resized) {
      // Preserve the visitor's current visual position while retaining both natural endpoints.
      resizeAnchor = raw > 0 && raw < 1 && progress > 0 && progress < 1 ? { raw, progress } : undefined;
      resized = false;
    }
    const nextProgress = clamp(mappedProgress(raw));
    if (nextProgress !== progress) direction = nextProgress > progress ? 1 : -1;
    progress = nextProgress;
    target = progressToFrame(progress, variant!.frameCount);
    if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
    updateDiagnostics();
    if (!stageIsNear()) {
      for (const request of requests.values()) request.controller.abort();
      return;
    }
    draw();
    pump();
  }

  const onScroll = () => schedule();
  const onResize = () => {
    geometryDirty = true;
    compositionDirty = true;
    resized = ready;
    const nextVariant: VariantName = window.innerWidth < 900 ? 'mobile' : 'desktop';
    if (nextVariant !== variantName) {
      stopLoading();
      variantName = nextVariant;
      variant = manifest?.variants[nextVariant];
      ready = false;
      displayed = -1;
      // The existing canvas remains visible until the responsive replacement has decoded.
    }
    schedule();
  };
  const onModeChange = () => {
    if (isStatic()) {
      showPoster('static');
    } else {
      failed = false;
      ready = false;
      pinDecided = false;
      pinAllowed = false;
      resizeAnchor = undefined;
      geometryDirty = true;
      shell.dataset.sequenceState = 'loading';
      if (toggle) toggle.setAttribute('aria-pressed', 'false');
      schedule();
    }
  };
  const onToggle = () => {
    manualStatic = !manualStatic;
    if (!manualStatic) anchorSkipsHero = false;
    onModeChange();
  };
  const onVisibility = () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const request of requests.values()) request.controller.abort();
    } else {
      geometryDirty = true;
      schedule();
    }
  };
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) { cleanup(); return; }
    suspended = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stopLoading();
    ready = false;
    displayed = -1;
    // Keep the existing CSS geometry and painted canvas for bfcache scroll restoration.
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || disposed) return;
    suspended = false;
    geometryDirty = true;
    compositionDirty = true;
    schedule();
  };
  const intersection = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(() => schedule(), { rootMargin: '140px 0px' })
    : undefined;
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    geometryDirty = true;
    compositionDirty = true;
    schedule();
  }) : undefined;

  function cleanup() {
    if (disposed) return;
    disposed = true;
    stopLoading();
    if (raf) cancelAnimationFrame(raf);
    intersection?.disconnect();
    resizeObserver?.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', onVisibility);
    reducedMotion.removeEventListener('change', onModeChange);
    toggle?.removeEventListener('click', onToggle);
    delete shell.dataset.sequencePin;
    delete shell.dataset.sequenceDrawn;
    shell.dataset.sequenceState = 'static';
    shell.style.removeProperty('--sequence-distance');
    motionCues.forEach((cue) => { cue.hidden = true; });
    if (toggle) toggle.hidden = true;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', onVisibility);
  reducedMotion.addEventListener('change', onModeChange);
  toggle?.addEventListener('click', onToggle);
  intersection?.observe(stage);
  resizeObserver?.observe(hero);
  resizeObserver?.observe(stage);
  if (header) resizeObserver?.observe(header);
  updateDiagnostics();
  if (isStatic()) showPoster('static');
  else { shell.dataset.sequenceState = 'loading'; schedule(); }
  document.documentElement?.removeAttribute('data-sequence-pending');
  return cleanup;
}
