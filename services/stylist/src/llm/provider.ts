// Abstract LLM provider interface.
//
// The Anthropic-specific event vocabulary is intentionally simplified: the
// provider yields a normalised `LLMEvent` stream so `runStella` (and the
// MockProvider in tests) doesn't need to depend on `@anthropic-ai/sdk` types.

export type AnthropicMessageRole = 'user' | 'assistant' | 'tool';

/**
 * One message in the rolling conversation context handed to the provider.
 * For tool turns we emit role `'tool'` carrying a tool_use_id and the JSON
 * result; the provider implementation maps this onto the Anthropic
 * `tool_result` content-block shape.
 */
export interface ProviderMessage {
  role: AnthropicMessageRole;
  // Plain assistant/user text. For tool turns this is the JSON result string.
  content: string;
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
