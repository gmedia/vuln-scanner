export type PrerenderRoute = {
  path: string;
  title: string;
  description: string;
};

export type RouteHtmlMeta = {
  title: string;
  description: string;
  url: string;
};

export const DEFAULT_LOCALE: string;

export function buildRouteHtml(
  baseHtml: string,
  meta: RouteHtmlMeta,
): string;

export function readProductRoutes(
  root: string,
  locale?: string,
): PrerenderRoute[];

export function prerenderProductRoutes(options?: {
  origin?: string;
}): {
  name: string;
  apply: string;
  configResolved(config: { root: string; build: { outDir: string } }): void;
  closeBundle(): void;
};
