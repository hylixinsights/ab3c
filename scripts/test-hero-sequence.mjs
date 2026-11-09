import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source = await fs.readFile(new URL('../src/scripts/hero-sequence.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { initHeroSequence, progressToFrame, frameWindow, copyOpacityForFrame } = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'));
for (const count of [81, 121]) {
  assert.equal(copyOpacityForFrame(0, count), 0);
  assert.equal(copyOpacityForFrame((count - 1) * 0.7, count), 0, 'copy stays hidden before the logo');
  assert.ok(Math.abs(copyOpacityForFrame((count - 1) * 0.725, count) - 0.5) < 0.001);
  assert.equal(copyOpacityForFrame((count - 1) * 0.75, count), 1);
  assert.equal(copyOpacityForFrame(count - 1, count), 1);
  assert.equal(progressToFrame(-5, count), 0);
  assert.equal(progressToFrame(0, count), 0);
  assert.equal(progressToFrame(0.5, count), (count - 1) / 2);
  assert.equal(progressToFrame(1, count), count - 1);
  assert.equal(progressToFrame(9, count), count - 1);
  for (let i = 0; i < count; i++) {
    for (const direction of [1, -1]) {
      const window = frameWindow(i, direction, count, 7);
      assert.equal(window[0], i);
      assert.ok(window.length <= 7);
      assert.ok(window.every((index) => index >= 0 && index < count));
      assert.equal(new Set(window).size, window.length);
    }
  }
}
assert.deepEqual(frameWindow(30, -1, 121, 6), [30, 29, 28, 31, 27, 32]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(test, label) {
  const stop = Date.now() + 2000;
  while (!test() && Date.now() < stop) await wait(5);
  assert.ok(test(), label);
}
class Element extends EventTarget {
  dataset = {};
  hidden = true;
  attributes = {};
  children = {};
  style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelector(name) { return this.children[name] || null; }
  querySelectorAll() { return this.cues || []; }
  contains(other) { return other === this || Object.values(this.children).some((child) => child.contains(other)); }
  compareDocumentPosition(other) { return other === this ? 0 : other.order > this.order ? 4 : 2; }
}
function setup({ mobile = false, reduced = false, fail = '', scroll = 0, staticURL = false, delay = 8, hash = '', overlay = false, viewportHeight = 800 } = {}) {
  const window = new EventTarget();
  Object.assign(window, {
    innerWidth: mobile ? 390 : 1440, innerHeight: viewportHeight, scrollY: scroll, devicePixelRatio: 2,
    location: { origin: 'https://example.org', href: 'https://example.org/project/en/' + (staticURL ? '?motion=static' : '') + hash, search: staticURL ? '?motion=static' : '', hash },
    setTimeout, clearTimeout, getComputedStyle: () => ({ paddingTop: '12px' }),
    scrollBy: ({ top }) => { window.scrollY = Math.max(0, window.scrollY + top); },
  });
  const mql = new EventTarget();
  mql.matches = reduced;
  window.matchMedia = () => mql;
  const document = new EventTarget();
  document.hidden = false;
  const shell = new Element();
  const hero = new Element();
  const stage = new Element();
  const canvas = new Element();
  const toggle = new Element();
  const bar = new Element();
  const cues = [new Element(), new Element()];
  const header = new Element();
  header.getBoundingClientRect = () => ({ height: 82 });
  document.querySelector = () => header;
  const top = new Element();
  const main = new Element();
  const heading = new Element();
  const followingSection = new Element();
  top.children = { main };
  main.children = { shell };
  [top, main, shell, heading, followingSection].forEach((element, index) => { element.order = index; });
  document.getElementById = (id) => ({ top, main, 'hero-h': heading, associacao: followingSection, comunidade: followingSection, xmeeting: followingSection })[id] || null;
  Object.assign(shell.dataset, { sequenceManifest: '/project/ab3c/hero-sequence/manifest.json', sequenceBase: '/project/' });
  Object.assign(shell.children, { '.hero': hero, '[data-sequence-stage]': stage, '[data-sequence-canvas]': canvas, '[data-sequence-toggle]': toggle, '[data-sequence-progress]': bar, '#hero-h': heading });
  shell.cues = cues;
  const isMobile = () => window.innerWidth < 900;
  const height = () => overlay
    ? isMobile() ? 540 : Math.max(420, Math.min(660, window.innerHeight - 120))
    : isMobile() ? 900 : 570;
  const heroTop = () => shell.dataset.sequencePin === 'true'
    ? Math.max(94 - window.scrollY, Math.min(94, 94 + window.innerHeight * 1.5 - window.scrollY))
    : 94 - window.scrollY;
  shell.getBoundingClientRect = () => ({ top: 82 - window.scrollY, bottom: 94 - window.scrollY + height() + (shell.dataset.sequencePin ? 1200 : 0), height: height() + 12 });
  hero.getBoundingClientRect = () => ({ top: heroTop(), bottom: heroTop() + height(), height: height() });
  stage.getBoundingClientRect = () => overlay
    ? { top: heroTop(), bottom: heroTop() + height(), width: window.innerWidth, height: height() }
    : { top: heroTop() + (isMobile() ? 600 : 100), bottom: heroTop() + (isMobile() ? 819 : 420), width: isMobile() ? 390 : 568.889, height: isMobile() ? 219.375 : 320 };
  const draws = [];
  const context = { clearRect() {}, drawImage(image) { draws.push(image.index); } };
  canvas.getContext = () => context;
  const open = new Set();
  let closed = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const fetched = [];
  let rafCalls = 0;
  const manifest = { variants: {} };
  for (const [name, count, width, height] of [['desktop', 121, 1280, 720], ['mobile', 81, 768, 432]]) {
    manifest.variants[name] = { frameCount: count, width, height, urls: Array.from({ length: count }, (_, i) => `ab3c/hero-sequence/${name}/frame-${String(i).padStart(4, '0')}.webp`) };
  }
  Object.assign(globalThis, {
    window, document,
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    IntersectionObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback) => { rafCalls++; return setTimeout(() => callback(Date.now()), 0); },
    cancelAnimationFrame: clearTimeout,
    createImageBitmap: async (blob) => {
      const bitmap = { index: Number(await blob.text()), close() { if (open.delete(this)) closed++; } };
      open.add(bitmap);
      return bitmap;
    },
    fetch: async (url, options = {}) => {
      const path = String(url);
      fetched.push(path);
      assert.ok(path.startsWith('https://example.org/project/') || path.startsWith('/project/'), 'configured base resolved');
      if (path.includes('manifest.json')) return new Response(JSON.stringify(manifest), { status: fail === 'manifest' ? 404 : 200 });
      const index = Number(path.match(/frame-(\d+)\.webp/)[1]);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(done, index === 60 ? delay * 5 : delay);
          function done() { options.signal?.removeEventListener('abort', abort); resolve(); }
          function abort() { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }
          options.signal?.addEventListener('abort', abort, { once: true });
          if (options.signal?.aborted) abort();
        });
        return new Response(String(index), { status: fail === 'first' && index === 0 ? 404 : fail === 'later' && index === 60 ? 404 : 200 });
      } finally { inFlight--; }
    },
  });
  const cleanup = initHeroSequence(shell);
  const move = (position) => { window.scrollY = position; window.dispatchEvent(new Event('scroll')); };
  return { shell, canvas, toggle, cues, window, document, open, draws, fetched, cleanup, move, mql,
    stats: () => ({ closed, inFlight, maxInFlight, rafCalls }) };
}
let env = setup();
await until(() => env.shell.dataset.sequenceState === 'ready' && env.shell.dataset.currentFrame === '0', 'opening frame');
assert.equal(env.shell.dataset.sequencePin, 'true');
assert.equal(env.shell.style['--sequence-copy-opacity'], '0', 'opening copy is hidden');
assert.ok(env.cues.every((cue) => !cue.hidden));
await wait(80);
assert.ok(Number(env.shell.dataset.cacheSize) <= 8);
assert.ok(env.stats().maxInFlight <= 3);
assert.ok(env.fetched.length < 12, 'does not fetch the entire sequence');
assert.ok(env.canvas.width <= 1280 && env.canvas.height <= 720);
env.move(600);
await wait(4);
env.move(1000);
await until(() => env.shell.dataset.currentFrame === '100', 'fast target takes priority');
await wait(80);
assert.equal(env.shell.dataset.currentFrame, '100', 'stale completion never replaces target');
assert.equal(env.shell.style['--sequence-copy-opacity'], '1', 'copy follows the logo that was actually drawn');
const steadyRaf = env.stats().rafCalls;
await wait(40);
assert.equal(env.stats().rafCalls, steadyRaf, 'stationary sequence has no continuous rAF');
env.move(700);
await until(() => env.shell.dataset.currentFrame === '70', 'reverse scroll');
assert.equal(env.shell.style['--sequence-copy-opacity'], '0', 'reverse scroll hides copy before the logo');
env.move(1250);
await until(() => env.shell.dataset.currentFrame === '120', 'exact source final');
env.move(1400);
await wait(30);
assert.equal(env.shell.dataset.currentFrame, '120', 'final persists through hero exit');
assert.ok(Number(env.shell.dataset.cacheSize) <= 8);
assert.ok(env.stats().closed > 0, 'evictions release decoded bitmaps');
env.toggle.dispatchEvent(new Event('click'));
assert.equal(env.shell.dataset.sequenceState, 'static');
assert.equal(env.shell.dataset.sequencePin, undefined);
assert.equal(env.shell.dataset.sequenceDrawn, undefined);
assert.equal(env.open.size, 0);
assert.ok(env.cues.every((cue) => cue.hidden));
assert.equal(env.window.scrollY, 200, 'static toggle compensates removed sticky distance');
env.cleanup();
await wait(20);
for (const fail of ['manifest', 'first']) {
  env = setup({ fail });
  await until(() => env.shell.dataset.sequenceState === 'failed', `startup ${fail} fallback`);
  assert.equal(env.shell.dataset.sequencePin, undefined);
  assert.equal(env.shell.dataset.sequenceDrawn, undefined);
  assert.ok(env.cues.every((cue) => cue.hidden));
  env.cleanup();
}
for (const settings of [{ reduced: true }, { staticURL: true }]) {
  env = setup(settings);
  await wait(25);
  assert.equal(env.shell.dataset.sequenceState, 'static');
  assert.equal(env.fetched.length, 0, 'static preference does not fetch animation assets');
  env.cleanup();
}
env = setup({ mobile: true });
await until(() => env.shell.dataset.currentFrame === '0', 'mobile arrival is first frame');
assert.equal(env.shell.dataset.sequencePin, undefined);
env.move(300);
await until(() => Number(env.shell.dataset.currentFrame) === 40, 'mobile artwork moves with natural scroll');
assert.ok(env.stats().maxInFlight <= 2);
assert.ok(Number(env.shell.dataset.cacheSize) <= 6);
env.move(600);
await until(() => env.shell.dataset.currentFrame === '80', 'mobile exact final');
env.cleanup();
assert.equal(env.open.size, 0);
await wait(20);
for (const settings of [{ mobile: true, viewportHeight: 800 }, { mobile: false, viewportHeight: 480 }]) {
  env = setup({ ...settings, overlay: true });
  const finalFrame = settings.mobile ? 80 : 120;
  const stageHeight = settings.mobile ? 540 : 420;
  const travel = Math.min(stageHeight * 0.35, settings.viewportHeight * 0.25);
  await until(() => env.shell.dataset.currentFrame === '0', 'overlay starts at its opening frame');
  assert.equal(env.shell.dataset.sequencePin, undefined, 'mobile and short desktop overlays stay in normal flow');
  env.move(1);
  await until(() => Number(env.shell.dataset.sequencePosition) > 0, 'overlay responds to the first scroll pixel');
  assert.ok(Number(env.shell.dataset.targetFrame) < finalFrame, 'stage at the header does not jump straight to its final frame');
  env.move(travel / 2);
  await until(() => Number(env.shell.dataset.currentFrame) === finalFrame / 2, 'overlay has a visible intermediate frame');
  env.move(travel);
  await until(() => Number(env.shell.dataset.currentFrame) === finalFrame, 'overlay reaches its final frame while still visible');
  env.cleanup();
  await wait(20);
}
env = setup({ fail: 'later' });
await until(() => env.shell.dataset.currentFrame === '0', 'later failure start');
env.move(600);
await until(() => env.shell.dataset.targetFrame === '60' && Number(env.shell.dataset.currentFrame) > 50, 'nearby valid frame fills temporary gap');
await wait(60);
assert.equal(env.shell.dataset.sequenceState, 'ready');
assert.equal(env.shell.dataset.sequenceDrawn, 'true');
assert.notEqual(env.shell.dataset.currentFrame, '60');
env.cleanup();
await wait(20);
env = setup();
await until(() => env.shell.dataset.currentFrame === '0', 'resize start');
env.move(600);
await until(() => env.shell.dataset.currentFrame === '60', 'resize midpoint');
env.window.innerHeight = 900;
env.window.dispatchEvent(new Event('resize'));
await wait(30);
assert.equal(env.window.scrollY, 600, 'resize preserves native scroll position');
assert.equal(env.shell.dataset.currentFrame, '60', 'resize preserves normalized visual position');
env.move(300);
await until(() => env.shell.dataset.currentFrame === '30', 'responsive resize starts from a visible intermediate frame');
const beforeVariantChange = env.draws.length;
env.window.innerWidth = 390;
env.window.dispatchEvent(new Event('resize'));
await until(() => env.shell.dataset.variant === 'mobile' && env.shell.dataset.currentFrame === '20', 'responsive variant retains normalized progress');
assert.ok(env.draws.slice(beforeVariantChange).every((index) => index !== 0), 'responsive replacement never paints its bootstrap frame over the current scene');
env.cleanup();
await wait(20);
for (const hash of ['#associacao', '#comunidade', '#xmeeting', '#%61ssociacao']) {
  env = setup({ hash });
  await until(() => env.shell.dataset.currentFrame === '0', `deep-link startup ${hash}`);
  assert.equal(env.window.scrollY, 0, 'fragment navigation can still be pending');
  assert.equal(env.shell.dataset.sequencePin, undefined, 'later-section anchor blocks initial pin before native scroll');
  env.move(300);
  await wait(10);
  env.move(0);
  env.window.dispatchEvent(new Event('resize'));
  await wait(15);
  assert.equal(env.shell.dataset.sequencePin, undefined, 'deep-link pin denial persists after returning to hero');
  env.cleanup();
}
for (const hash of ['#top', '#main', '#hero-h', '#missing', '#%invalid']) {
  env = setup({ hash });
  await until(() => env.shell.dataset.currentFrame === '0', `opening anchor startup ${hash}`);
  assert.equal(env.shell.dataset.sequencePin, 'true', 'hero/ancestor/missing anchors retain normal pin eligibility');
  env.cleanup();
}
await wait(20);
env = setup({ scroll: 2500 });
await wait(30);
assert.equal(env.fetched.length, 0, 'past-hero arrival does not decode offscreen');
env.move(300);
await until(() => env.shell.dataset.sequenceState === 'ready', 'returning to hero initializes');
assert.equal(env.shell.dataset.sequencePin, undefined, 'late initialization does not insert pin space');
env.cleanup();
await wait(20);
env = setup();
await until(() => env.shell.dataset.sequencePin === 'true', 'bfcache ready');
env.move(600);
await until(() => env.shell.dataset.currentFrame === '60', 'bfcache captures intermediate frame');
const beforeBfcache = env.draws.length;
const hide = new Event('pagehide');
Object.defineProperty(hide, 'persisted', { value: true });
env.window.dispatchEvent(hide);
assert.equal(env.open.size, 0, 'bfcache suspension releases decoded assets');
assert.equal(env.shell.dataset.sequencePin, 'true', 'bfcache preserves geometry');
const show = new Event('pageshow');
Object.defineProperty(show, 'persisted', { value: true });
env.window.dispatchEvent(show);
await until(() => env.shell.dataset.currentFrame === '60', 'bfcache resumes loader at the retained target');
assert.ok(env.draws.slice(beforeBfcache).every((index) => index !== 0), 'bfcache reload never flashes its bootstrap frame');
env.cleanup();
assert.equal(env.open.size, 0, 'cleanup closes remaining decoded assets');
const countAfterCleanup = env.fetched.length;
env.move(200);
await wait(30);
assert.equal(env.fetched.length, countAfterCleanup, 'cleanup removes scroll listener');
console.log('PASS: mapping, bounded loading/cache, stale completions, hold/reverse/final, static/reduced, startup/frame failures, mobile, overlay travel, responsive resize, deep links, late pin, bfcache and cleanup.');
