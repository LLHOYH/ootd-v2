// Local HTTP harness for the Lambda handler.
//
// Spins a minimal Node `http.Server` that translates each request into the
// same `APIGatewayProxyEventV2` shape AWS sends, invokes the same `handler`
// exported by src/index.ts, and writes the result back to the socket.
// This means the mobile dev build hits exactly the code that runs on
// Lambda — no second mock implementation drifts behind the real one.
//
// Run from repo root:
//   pnpm --filter @mei/api serve
// or
//   tsx services/api/src/local/serve.ts
//
// Env:
//   PORT        — defaults to 3001
//   SUPABASE_*  — required by handlers (see services/api/.env)

import http from 'node:http';
import { handler } from '../index';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context as LambdaContext,
} from 'aws-lambda';

function fakeLambdaContext(): LambdaContext {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'mei-api-local',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:local:0:function:mei-api-local',
    memoryLimitInMB: '512',
    awsRequestId: `local-${Date.now()}`,
    logGroupName: '/aws/lambda/mei-api-local',
    logStreamName: 'local',
    getRemainingTimeInMillis: () => 30_000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

async function readBody(req: http.IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (chunks.length === 0) return resolve(undefined);
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function buildEvent(
  req: http.IncomingMessage,
  body: string | undefined,
): APIGatewayProxyEventV2 {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers[k.toLowerCase()] = v;
    else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(',');
  }
  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    queryStringParameters[k] = v;
  });
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers,
    queryStringParameters,
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      domainName: req.headers.host ?? 'localhost',
      domainPrefix: 'local',
      http: {
        method: (req.method ?? 'GET').toUpperCase(),
        path: url.pathname,
        protocol: 'HTTP/1.1',
        sourceIp: req.socket.remoteAddress ?? '127.0.0.1',
        userAgent: req.headers['user-agent'] ?? 'mei-local-serve',
      },
      requestId: `local-${Date.now()}`,
      routeKey: '$default',
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    body,
    isBase64Encoded: false,
  };
}

function writeResponse(
  res: http.ServerResponse,
  out: APIGatewayProxyStructuredResultV2,
): void {
  res.statusCode = out.statusCode ?? 200;
  for (const [k, v] of Object.entries(out.headers ?? {})) {
    if (v != null) res.setHeader(k, String(v));
  }
  // Always set permissive CORS for the mobile dev build (Expo serves on a
  // different port). This is dev-only — production routes through API Gateway
  // which manages CORS itself.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader(
    'access-control-allow-headers',
    'authorization, content-type, x-requested-with',
  );
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.end(out.body ?? '');
}

const PORT = Number(process.env.PORT ?? 3001);

const server = http.createServer(async (req, res) => {
  // Preflight short-circuit so the browser/Expo dev origin can call us.
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader(
      'access-control-allow-headers',
      'authorization, content-type, x-requested-with',
    );
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.end();
    return;
  }
  try {
    const body = await readBody(req);
    const event = buildEvent(req, body);
    const out = (await handler(
      event,
      fakeLambdaContext(),
      () => {},
    )) as APIGatewayProxyStructuredResultV2 | undefined;
    if (!out) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'no result' } }));
      return;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[api] ${req.method} ${req.url} → ${out.statusCode}`,
    );
    writeResponse(res, out);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api] handler crash', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'crash' } }));
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] local server listening on http://127.0.0.1:${PORT}`);
});
