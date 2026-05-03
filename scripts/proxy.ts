// scripts/proxy.ts
//
// Single-port reverse proxy that fans out to the four Mei backend
// services by URL prefix:
//
//   /api/...          → http://127.0.0.1:3001/...
//   /stylist/...      → http://127.0.0.1:8080/...
//   /image-worker/... → http://127.0.0.1:8090/...
//   /notifier/...     → http://127.0.0.1:8082/...
//   /_health          → aggregated status of all four upstreams
//
// Why this exists:
//   ngrok's free plan gives one reserved/static domain and one
//   simultaneous tunnel. To keep apps/mobile/.env stable across
//   sessions (no IP/URL re-juggling each time you restart Expo) we
//   tunnel ONE port through ngrok and have the proxy route to the
//   four services internally. The mobile env vars become
//
//     EXPO_PUBLIC_API_URL=https://<your-domain>/api
//     EXPO_PUBLIC_STYLIST_URL=https://<your-domain>/stylist
//     EXPO_PUBLIC_IMAGE_WORKER_URL=https://<your-domain>/image-worker
//
//   …and stay that way forever (the static domain doesn't rotate).
//
// SSE notes:
//   Stella streams text/event-stream back via the stylist. Plain
//   `req.pipe(proxyReq)` + `proxyRes.pipe(res)` preserves the
//   chunked transfer encoding without buffering, so token-by-token
//   delivery works end-to-end.
//
// Run:
//   pnpm proxy            # listens on PROXY_PORT (default 8000)

import http from 'node:http';

interface Upstream {
  prefix: string; // path prefix on the proxy
  base: URL; // upstream root
  healthPath: string;
}

const UPSTREAMS: Upstream[] = [
  {
    prefix: '/api',
    base: new URL('http://127.0.0.1:3001'),
    healthPath: '/_health',
  },
  {
    prefix: '/stylist',
    base: new URL('http://127.0.0.1:8080'),
    healthPath: '/health',
  },
  {
    prefix: '/image-worker',
    base: new URL('http://127.0.0.1:8090'),
    healthPath: '/health',
  },
  {
    prefix: '/notifier',
    base: new URL('http://127.0.0.1:8082'),
    healthPath: '/health',
  },
];

const PORT = Number(process.env.PROXY_PORT ?? 8000);

function findUpstream(reqUrl: string): {
  upstream: Upstream;
  upstreamPath: string;
} | null {
  for (const u of UPSTREAMS) {
    if (reqUrl === u.prefix) {
      return { upstream: u, upstreamPath: '/' };
    }
    if (reqUrl.startsWith(u.prefix + '/') || reqUrl.startsWith(u.prefix + '?')) {
      return { upstream: u, upstreamPath: reqUrl.slice(u.prefix.length) || '/' };
    }
  }
  return null;
}

async function aggregateHealth(): Promise<string> {
  const results = await Promise.all(
    UPSTREAMS.map(async (u) => {
      const url = new URL(u.healthPath, u.base).toString();
      try {
        const r = await fetch(url, {
          signal: AbortSignal.timeout(1500),
        });
        return { name: u.prefix, ok: r.ok, status: r.status };
      } catch (err) {
        return {
          name: u.prefix,
          ok: false,
          status: 0,
          error: err instanceof Error ? err.message : 'unknown',
        };
      }
    }),
  );
  const allOk = results.every((r) => r.ok);
  return JSON.stringify(
    { ok: allOk, upstreams: results, version: 'proxy-1' },
    null,
    2,
  );
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url ?? '/';

  // Aggregated health probe so a single curl of /_health tells you
  // whether all four backends are alive.
  if (reqUrl === '/_health' || reqUrl === '/health') {
    void aggregateHealth().then((body) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(body + '\n');
    });
    return;
  }

  const match = findUpstream(reqUrl);
  if (!match) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        error: {
          code: 'NO_UPSTREAM',
          message: `No backend matches path ${reqUrl}. Try one of: ${UPSTREAMS.map(
            (u) => u.prefix,
          ).join(', ')}.`,
        },
      }),
    );
    return;
  }

  const { upstream, upstreamPath } = match;
  const target = new URL(upstreamPath, upstream.base);

  // Forward headers but rewrite Host to point at the upstream so virtual-
  // hosted services don't get confused by the proxy's external domain.
  // x-forwarded-* headers are appended so upstreams can log the original
  // caller if they care.
  const fwdHeaders: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    if (k.toLowerCase() === 'host') continue; // overwritten below
    fwdHeaders[k] = v as string | string[];
  }
  fwdHeaders.host = `${target.hostname}:${target.port}`;
  const origHost = (req.headers.host as string | undefined) ?? '';
  if (origHost) fwdHeaders['x-forwarded-host'] = origHost;
  fwdHeaders['x-forwarded-proto'] =
    (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';

  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: Number(target.port),
      path: target.pathname + target.search,
      method: req.method ?? 'GET',
      headers: fwdHeaders,
    },
    (proxyRes) => {
      // Surface upstream status + headers verbatim. SSE-friendly: no
      // buffering, no compression rewrite. Just pass bytes through.
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          error: {
            code: 'UPSTREAM_UNREACHABLE',
            message: `${upstream.prefix} (${upstream.base.host}): ${err.message}`,
          },
        }),
      );
    } else {
      res.destroy(err);
    }
  });

  // Stream the request body to the upstream.
  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[proxy] listening on http://127.0.0.1:${PORT}`);
  // eslint-disable-next-line no-console
  console.log('[proxy] routes:');
  for (const u of UPSTREAMS) {
    // eslint-disable-next-line no-console
    console.log(`         ${u.prefix.padEnd(15)} → ${u.base.host}`);
  }
});
