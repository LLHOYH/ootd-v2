// Abstract LLM provider interface.
//
// The Anthropic-specific event vocabulary is intentionally simplified: the
// provider yields a normalised `LLMEvent` stream so `runStella` (and the
// MockProvider in tests) doesn't need to depend on `@anthropic-ai/sdk` types.

export type AnthropicMessageRole = 'user' | 'assistant' | 'tool';

/**
 * Content block types that an assistant message can carry. When the model
 * emits both text and tool_use blocks in the same turn, we represent the
 * whole turn as a single ProviderMessage whose `content` is the array of
 * blocks in emission order. Anthropic requires that assistant turn shape
 * so the next user turn's tool_result blocks have a tool_use to reference.
 */
export type ProviderContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

/**
 * One message in the rolling conversation context handed to the provider.
 *
 *   role 'user'      → plain user text in `content` (string).
 *   role 'assistant' → either a text-only string OR an array of mixed
 *                      text + tool_use blocks for turns where the model
 *                      called tools.
 *   role 'tool'      → tool_result; `content` is the JSON result string,
 *                      `tool_use_id` references the assistant turn that
 *                      emitted the matching tool_use block.
 */
export interface ProviderMessage {
  role: AnthropicMessageRole;
  content: string | ProviderContentBlock[];
  tool_use_id?: string;
  tool_name?: string;
}

/** Anthropic-style tool definition. */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface StreamMessageInput {
  system: string;
  messages: ProviderMessage[];
  tools: readonly ToolDefinition[];
}

export type LLMEvent =
  | { type: 'message_start'; messageId: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_use'; toolUseId: string; name: string; input: unknown }
  | {
      type: 'message_stop';
      messageId: string;
      stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
      usage?: { inputTokens: number; outputTokens: number };
    }
  | { type: 'error'; code: string; message: string };

export interface LLMProvider {
  readonly name: string;
  streamMessage(input: StreamMessageInput): AsyncIterable<LLMEvent>;
}
