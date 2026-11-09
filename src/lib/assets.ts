/** Resolve public assets against Astro's deployment base, never the language route. */
export function assetPath(path: string, base = import.meta.env.BASE_URL): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}
