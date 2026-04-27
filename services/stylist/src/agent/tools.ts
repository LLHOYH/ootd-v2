// Stella tool definitions — VERBATIM with SPEC.md §8.3.
//
// Names, descriptions and input_schemas match the spec byte-for-byte. The
// actual handlers live in `./toolHandlers.ts`.

import type { ToolDefinition } from '../llm/provider';

export const TOOLS = [
  {
    name: 'get_closet_items',
    description:
      "Get the user's closet. Optionally filter by category or weather tag.",
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['DRESS', 'TOP', 'BOTTOM', 'OUTERWEAR', 'SHOE', 'BAG', 'ACCESSORY'],
        },
        weatherTag: {
          type: 'string',
          enum: ['HOT', 'WARM', 'MILD', 'COLD', 'RAIN'],
        },
      },
    },
  },
  {
    name: 'get_weather',
    description: 'Get current weather and 12h forecast for the user location.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_calendar_events',
    description:
      "Get today's calendar events (synced via OS calendar permission).",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_user_profile',
    description: 'Get style preferences, climate profile, gender.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_combinations',
    description: 'Get saved outfit combinations.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_hangout_state',
    description:
      "If the user is in an active hangout, get other members' shared outfits.",
    input_schema: {
      type: 'object',
      properties: { hangoutId: { type: 'string' } },
      required: ['hangoutId'],
    },
  },
  {
    name: 'suggest_outfit',
    description:
      'Return a structured outfit suggestion. The client renders it as a card.',
    input_schema: {
      type: 'object',
      properties: {
        itemIds: { type: 'array', items: { type: 'string' } },
        occasion: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['itemIds', 'reason'],
    },
  },
] as const satisfies readonly ToolDefinition[];

export type ToolName = (typeof TOOLS)[number]['name'];

export const TOOL_NAMES: readonly ToolName[] = TOOLS.map((t) => t.name);
