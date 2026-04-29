// Tool dispatcher for the seven Stella tools.
//
// For this branch the integrations are intentionally thin:
//   - Postgres-backed tools query Supabase directly with the service-role
//     client and return whatever rows they find (or [] / null).
//   - get_weather returns a placeholder for Singapore conditions; the real
//     weather provider lands in a follow-up branch.
//   - get_calendar_events returns [].
//   - suggest_outfit echoes the structured payload.
//
// The aim is for `runStella` to drive the full tool loop end-to-end with
// MockProvider — the LLM exercises every code path even though the data is
// thin or empty.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolName } from './tools';

export interface ToolContext {
  userId: string;
  convoId: string;
  /**
   * Service-role Supabase client. Optional so that mock-mode smoke tests
   * can run with no DB at all — the tools that need it will short-circuit
   * to empty results when it's missing.
   */
  supabase?: SupabaseClient;
}

// ---------- Individual handlers ----------

async function getClosetItems(
  input: { category?: string; weatherTag?: string },
  ctx: ToolContext,
): Promise<unknown> {
  if (!ctx.supabase) return { items: [] };
  let query = ctx.supabase
    .from('closet_items')
    .select('*')
    .eq('user_id', ctx.userId);
  if (input.category) {
    query = query.eq('category', input.category);
  }
  const { data, error } = await query;
  if (error) throw error;
  let items = (data ?? []) as Array<Record<string, unknown>>;
  if (input.weatherTag) {
    items = items.filter((i) => {
      const tags = i.weather_tags as string[] | undefined;
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
  if (!ctx.supabase) return { profile: null };
  const { data, error } = await ctx.supabase
    .from('users')
    .select('*')
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (error) throw error;
  return { profile: data ?? null };
}

async function getCombinations(
  _input: Record<string, never>,
  ctx: ToolContext,
): Promise<unknown> {
  if (!ctx.supabase) return { combinations: [] };
  const { data, error } = await ctx.supabase
    .from('combinations')
    .select('*')
    .eq('user_id', ctx.userId);
  if (error) throw error;
  return { combinations: data ?? [] };
}

async function getHangoutState(
  input: { hangoutId: string },
  ctx: ToolContext,
): Promise<unknown> {
  if (!input.hangoutId) {
    return { error: 'hangoutId is required' };
  }
  if (!ctx.supabase) return { items: [] };
  const { data, error } = await ctx.supabase
    .from('hangouts')
    .select('*')
    .eq('hangout_id', input.hangoutId);
  if (error) throw error;
  return { items: data ?? [] };
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
