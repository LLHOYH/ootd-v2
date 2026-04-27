// MockProvider — deterministic, no API key required.
//
// Drives the `runStella` tool loop end-to-end so smoke tests and the
// mock-server can exercise the full pipeline.
//
// Sequence:
//   Turn 1: 3 text deltas, then a `tool_use` for `get_closet_items`.
//   Turn 2: more text deltas + a `suggest_outfit` tool_use, then `end_turn`.

import type {
  LLMEvent,
  LLMProvider,
  StreamMessageInput,
} from './provider';

const TURN_1_DELTAS = ['morning', ' sophia', ' ☼ how can I help?'];
const TURN_2_DELTAS = [
  'Linen midi',
  ' + woven mules.',
  ' Straw bag for the heat.',
];

function countToolResults(messages: StreamMessageInput['messages']): number {
  return messages.filter((m) => m.role === 'tool').length;
}

export class MockProvider implements LLMProvider {
  readonly name = 'mock';

  async *streamMessage(input: StreamMessageInput): AsyncIterable<LLMEvent> {
    const turnIndex = countToolResults(input.messages);
    const messageId = `mock_msg_${turnIndex + 1}`;

    yield { type: 'message_start', messageId };

    if (turnIndex === 0) {
      for (const delta of TURN_1_DELTAS) {
        yield { type: 'text_delta', delta };
      }
      yield {
        type: 'tool_use',
        toolUseId: 'mock_tool_1',
        name: 'get_closet_items',
        input: {},
      };
      yield {
        type: 'message_stop',
        messageId,
        stopReason: 'tool_use',
        usage: { inputTokens: 120, outputTokens: 32 },
      };
      return;
    }

    if (turnIndex === 1) {
      for (const delta of TURN_2_DELTAS) {
        yield { type: 'text_delta', delta };
      }
      yield {
        type: 'tool_use',
        toolUseId: 'mock_tool_2',
        name: 'suggest_outfit',
        input: {
          itemIds: ['item_1', 'item_2', 'item_3'],
          occasion: 'BRUNCH',
          reason: 'Light, breathable, and weather-appropriate.',
        },
      };
      yield {
        type: 'message_stop',
        messageId,
        stopReason: 'tool_use',
        usage: { inputTokens: 180, outputTokens: 64 },
      };
      return;
    }

    // Final turn: confirm and end.
    yield { type: 'text_delta', delta: ' enjoy ♡' };
    yield {
      type: 'message_stop',
      messageId,
      stopReason: 'end_turn',
      usage: { inputTokens: 200, outputTokens: 8 },
    };
  }
}
