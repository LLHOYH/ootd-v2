// Anthropic Claude implementation of LLMProvider.
//
// Uses the streaming API and translates Anthropic events into the normalised
// `LLMEvent` vocabulary that `runStella` consumes. Deliberately minimal — the
// goal of this branch is the agent skeleton, not feature-completeness with
// every Anthropic event type.

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMEvent,
  LLMProvider,
  ProviderMessage,
  StreamMessageInput,
} from './provider';

// Sonnet tier per SPEC §8.1. Pinned here; revisit at every milestone.
const DEFAULT_MODEL = 'claude-sonnet-4-5';
const DEFAULT_MAX_TOKENS = 1024;

interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

type AnthropicMessageParam = {
  role: 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | {
            type: 'tool_use';
            id: string;
            name: string;
            input: Record<string, unknown>;
          }
        | {
            type: 'tool_result';
            tool_use_id: string;
            content: string;
          }
      >;
};

/**
 * Map our flat ProviderMessage list onto the structured Anthropic
 * messages API shape.
 *
 * - role 'user'      → user text
 * - role 'assistant' → assistant text
 * - role 'tool'      → user message with a tool_result content block
 *
 * Adjacent tool results are coalesced into one user turn so we don't violate
 * Anthropic's strict role alternation requirement.
 */
function toAnthropicMessages(
  messages: ProviderMessage[],
): AnthropicMessageParam[] {
  const out: AnthropicMessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const last = out[out.length - 1];
      const block = {
        type: 'tool_result' as const,
        tool_use_id: m.tool_use_id ?? '',
        content: m.content,
      };
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
      continue;
    }
    out.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    });
  }
  return out;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicProviderOptions) {
    if (!opts.apiKey || opts.apiKey.length === 0) {
      throw new Error(
        'AnthropicProvider requires an API key. Set ANTHROPIC_API_KEY or use STELLA_LLM_MODE=mock.',
      );
    }
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async *streamMessage(input: StreamMessageInput): AsyncIterable<LLMEvent> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      system: input.system,
      tools: input.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })) as never,
      messages: toAnthropicMessages(input.messages),
    });

    let messageId = '';
    // Buffer tool_use blocks so we can emit the final input as parsed JSON.
    const toolBlocks = new Map<
      number,
      { id: string; name: string; jsonBuf: string }
    >();
    // Anthropic reports input_tokens on message_start and output_tokens on
    // message_delta — pair them up at message_stop emission.
    let inputTokens = 0;

    for await (const event of stream) {
      switch (event.type) {
        case 'message_start': {
          messageId = event.message.id;
          inputTokens = event.message.usage?.input_tokens ?? 0;
          yield { type: 'message_start', messageId };
          break;
        }
        case 'content_block_start': {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            toolBlocks.set(event.index, {
              id: block.id,
              name: block.name,
              jsonBuf: '',
            });
          }
          break;
        }
        case 'content_block_delta': {
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            yield { type: 'text_delta', delta: delta.text };
          } else if (delta.type === 'input_json_delta') {
            const tb = toolBlocks.get(event.index);
            if (tb) tb.jsonBuf += delta.partial_json;
          }
          break;
        }
        case 'content_block_stop': {
          const tb = toolBlocks.get(event.index);
          if (tb) {
            let parsedInput: unknown = {};
            try {
              parsedInput = tb.jsonBuf.length > 0 ? JSON.parse(tb.jsonBuf) : {};
            } catch (err) {
              yield {
                type: 'error',
                code: 'tool_input_parse_error',
                message: `Failed to parse tool input for ${tb.name}: ${(err as Error).message}`,
              };
              parsedInput = {};
            }
            yield {
              type: 'tool_use',
              toolUseId: tb.id,
              name: tb.name,
              input: parsedInput,
            };
            toolBlocks.delete(event.index);
          }
          break;
        }
        case 'message_delta': {
          // stop_reason arrives here when the model finishes.
          const stopReason = event.delta.stop_reason ?? 'end_turn';
          yield {
            type: 'message_stop',
            messageId,
            stopReason: stopReason as
              | 'end_turn'
              | 'tool_use'
              | 'max_tokens'
              | 'stop_sequence',
            usage: event.usage
              ? {
                  inputTokens,
                  outputTokens: event.usage.output_tokens ?? 0,
                }
              : undefined,
          };
          break;
        }
        case 'message_stop': {
          // Already emitted from message_delta; nothing to do here.
          break;
        }
        default:
          break;
      }
    }
  }
}
