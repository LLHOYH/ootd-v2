// Local invoke CLI — builds a fake APIGW v2 event and runs the handler in
// the current Node process. Useful smoke test before any AWS deploy.
//
// Usage:
//   pnpm --filter @mei/api local -- --method GET --path /_health
//   pnpm --filter @mei/api local -- --method POST --path /closet/items \
//        --body '{"name":"linen shirt"}' --auth eyJraWQ...
//
// This is a dev-only entrypoint; never imported by the deployed Lambda.

import { handler } from '../index';
import type {
  APIGatewayProxyEventV2,
  Context as LambdaContext,
} from 'aws-lambda';

interface CliArgs {
  method: string;
  path: string;
  body?: string;
  auth?: string;
  query?: Record<string, string>;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { query: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === undefined) continue;
    switch (a) {
      case '--method':
        if (next !== undefined) args.method = next;
        i++;
        break;
      case '--path':
        if (next !== undefined) args.path = next;
        i++;
        break;
      case '--body':
        if (next !== undefined) args.body = next;
        i++;
        break;
      case '--auth':
        if (next !== undefined) args.auth = next;
        i++;
        break;
      case '--query':
        // `--query key=val` — repeatable.
        if (next && next.includes('=')) {
          const [k, v] = next.split('=', 2);
          if (k) (args.query as Record<string, string>)[k] = v ?? '';
        }
        i++;
        break;
      default:
        // ignore unknown flags
        break;
    }
  }
  if (!args.method || !args.path) {
    throw new Error(
      'Usage: invoke --method <M> --path </p> [--body <json>] [--auth <token>]',
    );
  }
  return args as CliArgs;
}

function buildEvent(args: CliArgs): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (args.body) headers['content-type'] = 'application/json';
  if (args.auth) headers['authorization'] = `Bearer ${args.auth}`;

  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: args.path,
    rawQueryString: '',
    headers,
    queryStringParameters: args.query,
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      domainName: 'localhost',
      domainPrefix: 'local',
      http: {
        method: args.method.toUpperCase(),
        path: args.path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'mei-local-invoke',
      },
      requestId: `local-${Date.now()}`,
      routeKey: '$default',
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    body: args.body,
    isBase64Encoded: false,
  };
}

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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const event = buildEvent(args);
  const ctx = fakeLambdaContext();
  const res = await (handler as unknown as (
    e: APIGatewayProxyEventV2,
    c: LambdaContext,
  ) => Promise<unknown>)(event, ctx);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
