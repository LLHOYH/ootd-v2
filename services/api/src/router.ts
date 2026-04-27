// Tiny path-matching router. Supports static segments and `:param` captures.
// Not a full framework — just enough to fan APIGW events to handler functions.
//
// Routes are matched in registration order; first match wins. 404s are
// handled by the caller (index.ts) when `match` returns null.

import type { Handler, HttpMethod, RequestContext } from './context';

export interface RouteDef {
  method: HttpMethod;
  /** Path template, e.g. `/closet/items/:itemId`. Must start with `/`. */
  path: string;
  handler: Handler;
}

export interface CompiledRoute extends RouteDef {
  /** Pre-split segments for fast matching. */
  segments: string[];
  /** Names of `:param` segments, in positional order. */
  paramNames: string[];
}

export interface Router {
  routes: CompiledRoute[];
  match(method: HttpMethod, path: string): MatchResult | null;
}

export interface MatchResult {
  handler: Handler;
  params: Record<string, string>;
}

function compile(route: RouteDef): CompiledRoute {
  if (!route.path.startsWith('/')) {
    throw new Error(`Route path must start with '/': ${route.path}`);
  }
  const segments = route.path.split('/').filter(Boolean);
  const paramNames: string[] = [];
  for (const seg of segments) {
    if (seg.startsWith(':')) paramNames.push(seg.slice(1));
  }
  return { ...route, segments, paramNames };
}

export function defineRouter(routes: RouteDef[]): Router {
  const compiled = routes.map(compile);

  return {
    routes: compiled,
    match(method, path) {
      const incoming = path.split('/').filter(Boolean);
      for (const r of compiled) {
        if (r.method !== method) continue;
        if (r.segments.length !== incoming.length) continue;
        const params: Record<string, string> = {};
        let ok = true;
        for (let i = 0; i < r.segments.length; i++) {
          const tpl = r.segments[i]!;
          const seg = incoming[i]!;
          if (tpl.startsWith(':')) {
            params[tpl.slice(1)] = decodeURIComponent(seg);
          } else if (tpl !== seg) {
            ok = false;
            break;
          }
        }
        if (ok) return { handler: r.handler, params };
      }
      return null;
    },
  };
}

/** Convenience for handlers that need to read a single path param strictly. */
export function requireParam(ctx: RequestContext, name: string): string {
  const v = ctx.params[name];
  if (!v) throw new Error(`Missing path param: ${name}`);
  return v;
}
