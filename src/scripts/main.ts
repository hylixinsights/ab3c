import { translations, type Language, type TranslationKey } from '../data/translations';
import { site } from '../data/site';
import { initHeroSequence } from './hero-sequence';

type NetworkController = { setLanguage(language: Language): void; destroy(): void };
let language: Language = document.documentElement.lang === 'en' ? 'en' : 'pt';
let network: NetworkController | undefined;
const storageKey = 'ab3c-language';
const sections = Array.from(document.querySelectorAll<HTMLElement>('main > section, footer.closing'));
const switches = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-language]'));
const other = (current: Language): Language => current === 'pt' ? 'en' : 'pt';
const pathFor = (target: Language) => target === 'pt' ? '/' : '/en/';

function updateLanguageLinks() {
  switches.forEach(link => {
    // A toggle always points at the other language; a fixed link keeps its own and marks the current one.
    if (link.hasAttribute('data-language-toggle')) {
      const target = other(language);
      link.dataset.language = target;
      link.textContent = translations[language].otherLanguage;
      link.setAttribute('lang', target === 'pt' ? 'pt-BR' : 'en');
      link.setAttribute('hreflang', target === 'pt' ? 'pt-BR' : 'en');
    } else if (link.dataset.language === language) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
    link.href = `${pathFor(link.dataset.language as Language)}${location.hash}`;
  });
}
function applyLanguage(next: Language, { persist = true, updateUrl = true, preservePosition = true } = {}) {
  const activeSection = sections.find(section => section.getBoundingClientRect().bottom > 72);
  const previousTop = activeSection?.getBoundingClientRect().top;
  language = next;
  const t = translations[next];
  document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n as TranslationKey;
    if (key in t) element.textContent = t[key];
  });
  for (const attribute of ['aria-label', 'title', 'alt'] as const) {
    document.querySelectorAll<HTMLElement>(`[data-i18n-${attribute}]`).forEach(element => {
      const key = element.getAttribute(`data-i18n-${attribute}`) as TranslationKey;
      if (key in t) element.setAttribute(attribute, t[key]);
    });
  }
  document.title = t.pageTitle;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t.description);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', t.pageTitle);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', t.description);
  document.querySelector('meta[property="og:locale"]')?.setAttribute('content', next === 'pt' ? 'pt_BR' : 'en_US');
  const path = pathFor(next);
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', `${site.origin}${path}`);
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', `${site.origin}${path}`);
  if (updateUrl) history.replaceState({ language: next }, '', `${path}${location.search}${location.hash}`);
  if (persist) { try { localStorage.setItem(storageKey, next); } catch { /* Preference is optional when storage is unavailable. */ } }
  network?.setLanguage(next);
  updateLanguageLinks();
  if (preservePosition && activeSection && previousTop !== undefined && window.scrollY > 0) {
    const difference = activeSection.getBoundingClientRect().top - previousTop;
    if (Math.abs(difference) > 1) window.scrollBy({ top: difference, behavior: 'instant' });
  }
}
switches.forEach(link => link.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  applyLanguage(link.dataset.language as Language);
}));
window.addEventListener('hashchange', updateLanguageLinks);
window.addEventListener('popstate', () => applyLanguage(location.pathname.startsWith('/en') ? 'en' : 'pt', { updateUrl: false, preservePosition: false }));
try {
  const saved = localStorage.getItem(storageKey);
  if (location.pathname === '/' && saved === 'en') applyLanguage('en', { persist: false, preservePosition: false });
  else applyLanguage(language, { persist: false, updateUrl: false, preservePosition: false });
} catch { applyLanguage(language, { persist: false, updateUrl: false, preservePosition: false }); }

// Import D3 and the network data only as the community section approaches the viewport.
const root = document.querySelector<HTMLElement>('#community-network');
const fallback = document.querySelector<HTMLElement>('#network-fallback');
if (root) {
  let started = false;
  const loadNetwork = async () => {
    if (started) return;
    started = true;
    try {
      const { mountNetwork } = await import('./network');
      network = mountNetwork(root, language);
      if (fallback) fallback.hidden = true;
    } catch {
      root.replaceChildren();
      if (fallback) fallback.hidden = false;
      started = false;
    }
  };
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      void loadNetwork();
      observer.disconnect();
    }
  }, { rootMargin: '200px' });
  observer.observe(root.parentElement ?? root);
}

// The image sequence follows native scrolling; static HTML remains the fallback.
const hero = document.querySelector<HTMLElement>('[data-sequence]');
const disposeSequence = hero ? initHeroSequence(hero) : undefined;
if (import.meta.hot) import.meta.hot.dispose(() => {
  disposeSequence?.();
  network?.destroy();
});
