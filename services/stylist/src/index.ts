// Stella Lambda entry point.
//
// API Gateway v2 with response streaming via `awslambda.streamifyResponse`.
// The body is a JSON envelope:
//   { convoId: string, userId: string, text: string }
//
// We stream SSE-framed events (one `data: <json>\n\n` per StellaSseEvent).
// HTTP/SSE wiring at the API Gateway layer lands in a follow-up branch; this
// file just produces the bytes.

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { StellaSseEvent } from '@mei/types';
import { loadConfig } from './config';
import { getProvider } from './llm/factory';
import { ConversationStore } from './store/conversationStore';
import { runStella } from './agent/runStella';

interface RequestEnvelope {
  convoId: string;
  userId: string;
  text: string;
}

// Lambda response-streaming primitives. AWS injects an `awslambda` global
// inside the Lambda runtime; outside (smoke tests, unit tests) it's
// undefined. We probe via `globalThis` so this module is safe to import in
// any context.
interface AwsLambdaGlobal {
  streamifyResponse: (
    handler: (
      event: APIGatewayProxyEventV2,
      responseStream: NodeJS.WritableStream,
      context?: unknown,
    ) => Promise<void>,
  ) => unknown;
  HttpResponseStream?: {
    from(
      stream: NodeJS.WritableStream,
      meta: { statusCode: number; headers?: Record<string, string> },
    ): NodeJS.WritableStream;
  };
}

const awslambda: AwsLambdaGlobal | undefined = (
  globalThis as unknown as { awslambda?: AwsLambdaGlobal }
).awslambda;

function parseBody(event: APIGatewayProxyEventV2): RequestEnvelope {
  if (!event.body) throw new Error('Missing request body');
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body;
  const parsed = JSON.parse(raw) as Partial<RequestEnvelope>;
  if (!parsed.convoId || !parsed.userId || !parsed.text) {
    throw new Error('Body must include convoId, userId, and text');
  }
  return {
    convoId: parsed.convoId,
    userId: parsed.userId,
    text: parsed.text,
  };
}

function frameSseEvent(ev: StellaSseEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}

export async function streamHandler(
  event: APIGatewayProxyEventV2,
  responseStream: NodeJS.WritableStream,
): Promise<void> {
  const config = loadConfig();
  const provider = getProvider(config);
  const store = new ConversationStore({
    tableName: config.tableName,
    region: config.region,
  });

  const sseStream = awslambda?.HttpResponseStream
    ? awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      })
    : responseStream;

  let body: RequestEnvelope;
  try {
    body = parseBody(event);
  } catch (err) {
    sseStream.write(
      frameSseEvent({
        event: 'error',
        code: 'bad_request',
        message: (err as Error).message,
      }),
    );
    sseStream.end();
    return;
  }

  try {
    for await (const ev of runStella({
      userId: body.userId,
      convoId: body.convoId,
      userText: body.text,
      provider,
      store,
      toolCtx: {
        userId: body.userId,
        convoId: body.convoId,
        tableName: config.tableName,
        region: config.region,
      },
    })) {
      sseStream.write(frameSseEvent(ev));
    }
  } catch (err) {
    sseStream.write(
      frameSseEvent({
        event: 'error',
        code: 'internal_error',
        message: (err as Error).message,
      }),
    );
  } finally {
    sseStream.end();
  }
}

// At runtime, AWS supplies the awslambda global. In other environments
// (smoke tests, unit tests) the raw `streamHandler` is the useful export.
export const handler = awslambda
  ? awslambda.streamifyResponse(streamHandler)
  : streamHandler;
