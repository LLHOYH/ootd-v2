// Tool dispatcher for the seven Stella tools.
//
// For this branch the integrations are intentionally thin:
//   - DDB-backed tools query the single table using the SPEC §6.1 patterns
//     and return whatever items they find (or [] / null).
//   - get_weather returns a TODO placeholder for Singapore conditions; the
//     real weather provider lands in a follow-up branch.
//   - get_calendar_events returns [].
//   - suggest_outfit echoes the structured payload.
//
// The aim is for `runStella` to drive the full tool loop end-to-end with
// MockProvider — the LLM exercises every code path even though the data is
// thin or empty.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { ToolName } from './tools';

export interface ToolContext {
  userId: string;
  convoId: string;
  tableName: string;
  region: string;
  doc?: DynamoDBDocumentClient;
}

function getDoc(ctx: ToolContext): DynamoDBDocumentClient {
  return (
    ctx.doc ??
    DynamoDBDocumentClient.from(new DynamoDBClient({ region: ctx.region }))
  );
}

// ---------- Individual handlers ----------

async function getClosetItems(
  input: { category?: string; weatherTag?: string },
  ctx: ToolContext,
): Promise<unknown> {
  const doc = getDoc(ctx);
  const res = await doc.send(
    new QueryCommand({
      TableName: ctx.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${ctx.userId}`,
        ':sk': 'ITEM#',
      },
    }),
  );
  let items = (res.Items ?? []) as Array<Record<string, unknown>>;
  if (input.category) {
    items = items.filter((i) => i.category === input.category);
  }
  if (input.weatherTag) {
    items = items.filter((i) => {
      const tags = i.weatherTags as string[] | undefined;
      return Array.isArray(tags) && tags.includes(input.weatherTag!);
    });
  }
  return { items };
}

async function getWeather(
  _input: Record<string, never>,
  _ctx: ToolContext,
): Promise<unknown> {
  // TODO(weather-provider): wire OpenWeather/Apple Weather. Placeholder
  // until that branch lands.
  return {
    tempC: 28,
    condition: 'SUNNY',
    city: 'Singapore',
    forecast12h: [
      { hourOffset: 3, tempC: 29, condition: 'SUNNY' },
      { hourOffset: 6, tempC: 30, condition: 'PARTLY_CLOUDY' },
      { hourOffset: 9, tempC: 28, condition: 'CLOUDY' },
      { hourOffset: 12, tempC: 27, condition: 'CLOUDY' },
    ],
  };
}

async function getCalendarEvents(
  _input: Record<string, never>,
  _ctx: ToolContext,
): Promise<unknown> {
  // TODO(calendar-sync): integrate OS calendar permission flow. Empty for now.
  return { events: [] };
}

async function getUserProfile(
  _input: Record<string, never>,
  ctx: ToolContext,
): Promise<unknown> {
  const doc = getDoc(ctx);
  const res = await doc.send(
    new GetCommand({
      TableName: ctx.tableName,
      Key: { PK: `USER#${ctx.userId}`, SK: 'PROFILE' },
    }),
  );
  return { profile: res.Item ?? null };
}

async function getCombinations(
  _input: Record<string, never>,
  ctx: ToolContext,
): Promise<unknown> {
  const doc = getDoc(ctx);
  const res = await doc.send(
    new QueryCommand({
      TableName: ctx.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${ctx.userId}`,
        ':sk': 'COMBO#',
      },
    }),
  );
  return { combinations: res.Items ?? [] };
}

async function getHangoutState(
  input: { hangoutId: string },
  ctx: ToolContext,
): Promise<unknown> {
  if (!input.hangoutId) {
    return { error: 'hangoutId is required' };
  }
  const doc = getDoc(ctx);
  const res = await doc.send(
    new QueryCommand({
      TableName: ctx.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `HANGOUT#${input.hangoutId}`,
      },
    }),
  );
  return { items: res.Items ?? [] };
}

async function suggestOutfit(
  input: { itemIds: string[]; occasion?: string; reason: string },
  _ctx: ToolContext,
): Promise<unknown> {
  // The client renders this; we just echo a normalised payload back to the
  // LLM so it can confirm receipt and continue the conversation.
  return {
    suggestion: {
      itemIds: Array.isArray(input.itemIds) ? input.itemIds : [],
      occasion: input.occasion,
      reason: input.reason ?? '',
    },
  };
}

// ---------- Dispatcher ----------

export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<unknown> {
  const safeInput = (input ?? {}) as Record<string, unknown>;
  switch (name as ToolName) {
    case 'get_closet_items':
      return getClosetItems(
        safeInput as { category?: string; weatherTag?: string },
        ctx,
      );
    case 'get_weather':
      return getWeather({} as Record<string, never>, ctx);
    case 'get_calendar_events':
      return getCalendarEvents({} as Record<string, never>, ctx);
    case 'get_user_profile':
      return getUserProfile({} as Record<string, never>, ctx);
    case 'get_combinations':
      return getCombinations({} as Record<string, never>, ctx);
    case 'get_hangout_state':
      return getHangoutState(
        safeInput as { hangoutId: string },
        ctx,
      );
    case 'suggest_outfit':
      return suggestOutfit(
        safeInput as { itemIds: string[]; occasion?: string; reason: string },
        ctx,
      );
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
