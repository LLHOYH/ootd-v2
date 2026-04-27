// Top-level Stella orchestrator.
//
// Drives the tool loop:
//   - load conversation + messages from DDB
//   - compact via summarizeAndTruncate (SPEC §8.1)
//   - stream provider events; relay text deltas to the caller as
//     StellaSseEvents
//   - on tool_use: invoke the corresponding handler, append the tool result
//     to the rolling context, and resume streaming until end_turn
//   - persist the final assistant text + every tool turn for replay

import { ulid } from 'ulid';
import type { StellaSseEvent } from '@mei/types';
import type { LLMProvider, ProviderMessage } from '../llm/provider';
import { STELLA_SYSTEM_PROMPT } from './systemPrompt';
import { TOOLS } from './tools';
import { executeTool, type ToolContext } from './toolHandlers';
import {
  summarizeAndTruncate,
  type ConversationStore,
} from '../store/conversationStore';
import { costTracker, estimateCostUsd } from '../cost/tracker';

export interface RunStellaInput {
  userId: string;
  convoId: string;
  userText: string;
  provider: LLMProvider;
  store: ConversationStore;
  toolCtx: ToolContext;
  /** Cap the number of tool-use rounds to defend against runaway loops. */
  maxToolRounds?: number;
}

const DEFAULT_MAX_TOOL_ROUNDS = 8;

export async function* runStella(
  input: RunStellaInput,
): AsyncGenerator<StellaSseEvent, void, void> {
  const {
    userId,
    convoId,
    userText,
    provider,
    store,
    toolCtx,
    maxToolRounds = DEFAULT_MAX_TOOL_ROUNDS,
  } = input;

  // --- Persist incoming user message and load history ---
  await store.appendMessage(convoId, {
    role: 'USER',
    text: userText,
  });

  const history = await store.listMessages(convoId);
  const messages: ProviderMessage[] = summarizeAndTruncate(history);

  let assistantText = '';
  // Stable id we report to the client across the whole run. Persisted DDB
  // rows for assistant text + tool turns get their own ULIDs internally.
  const assistantMessageId = ulid();
  let yieldedMessageStart = false;

  for (let round = 0; round < maxToolRounds; round++) {
    const stream = provider.streamMessage({
      system: STELLA_SYSTEM_PROMPT,
      messages,
      tools: TOOLS,
    });

    let calledTool = false;

    // Collected tool calls for this turn so we can append both the
    // assistant tool_use and the tool result to `messages` in order.
    const pendingToolCalls: Array<{
      toolUseId: string;
      name: string;
      input: unknown;
    }> = [];

    for await (const ev of stream) {
      switch (ev.type) {
        case 'message_start': {
          if (!yieldedMessageStart) {
            yieldedMessageStart = true;
            yield { event: 'message_start', messageId: assistantMessageId };
          }
          break;
        }
        case 'text_delta': {
          assistantText += ev.delta;
          yield { event: 'text_delta', delta: ev.delta };
          break;
        }
        case 'tool_use': {
          calledTool = true;
          pendingToolCalls.push({
            toolUseId: ev.toolUseId,
            name: ev.name,
            input: ev.input,
          });
          yield { event: 'tool_call', name: ev.name, input: ev.input };
          break;
        }
        case 'message_stop': {
          if (ev.usage) {
            costTracker.logUsage({
              convoId,
              userId,
              inputTokens: ev.usage.inputTokens,
              outputTokens: ev.usage.outputTokens,
              costUsd: estimateCostUsd(
                ev.usage.inputTokens,
                ev.usage.outputTokens,
              ),
            });
          }
          break;
        }
        case 'error': {
          yield { event: 'error', code: ev.code, message: ev.message };
          return;
        }
      }
    }

    // Persist the assistant turn so far. If the model emitted tool_use
    // blocks, we record them so a future replay rebuilds the same
    // provider-message shape.
    if (assistantText.length > 0 || pendingToolCalls.length > 0) {
      if (assistantText.length > 0) {
        // Each round writes its own row; real summarization will collapse
        // these later.
        await store.appendMessage(convoId, {
          role: 'ASSISTANT',
          text: assistantText,
        });
      }
      // Push assistant + tool turns into the rolling context for the next
      // round.
      if (assistantText.length > 0) {
        messages.push({ role: 'assistant', content: assistantText });
        assistantText = '';
      }
      for (const tc of pendingToolCalls) {
        const result = await executeTool(tc.name, tc.input, toolCtx);
        const resultJson = JSON.stringify(result);
        await store.appendMessage(convoId, {
          role: 'ASSISTANT',
          text: '',
          toolUseId: tc.toolUseId,
          toolName: tc.name,
          toolResult: resultJson,
        });
        messages.push({
          role: 'tool',
          content: resultJson,
          tool_use_id: tc.toolUseId,
          tool_name: tc.name,
        });
      }
    }

    if (!calledTool) {
      // Model finished without asking for another tool — done.
      break;
    }
  }

  yield { event: 'message_stop', messageId: assistantMessageId };
}
