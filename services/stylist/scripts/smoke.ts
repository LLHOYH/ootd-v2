// Local smoke driver. Runs `runStella` against MockProvider with an
// in-memory conversation store, printing the SSE event stream.
//
// No DB, no API key. Exits 0 on success.
//
// The in-memory store implements `IConversationStore` directly. Tools that
// would normally hit Supabase short-circuit to empty results because we
// don't pass a `supabase` client through the tool context.

import type { StellaConversation } from '@mei/types';
import { MockProvider } from '../src/llm/mock';
import { runStella } from '../src/agent/runStella';
import type {
  IConversationStore,
  StoredStellaMessage,
} from '../src/store/conversationStore';
import type { ToolContext } from '../src/agent/toolHandlers';

class InMemoryStore implements IConversationStore {
  private readonly convos = new Map<string, StellaConversation>();
  private readonly rows: StoredStellaMessage[] = [];
  private counter = 0;

  async getConversation(
    _userId: string,
    convoId: string,
  ): Promise<StellaConversation | null> {
    return this.convos.get(convoId) ?? null;
  }

  async createConversation(
    convo: StellaConversation,
  ): Promise<StellaConversation> {
    this.convos.set(convo.convoId, convo);
    return convo;
  }

  async appendMessage(
    convoId: string,
    msg: Omit<StoredStellaMessage, 'messageId' | 'createdAt' | 'convoId'> &
      Partial<Pick<StoredStellaMessage, 'messageId' | 'createdAt'>>,
  ): Promise<StoredStellaMessage> {
    this.counter += 1;
    const stored: StoredStellaMessage = {
      messageId: msg.messageId ?? `mem_${String(this.counter).padStart(6, '0')}`,
      convoId,
      role: msg.role,
      text: msg.text,
      toolUseId: msg.toolUseId,
      toolName: msg.toolName,
      toolResult: msg.toolResult,
      createdAt: msg.createdAt ?? new Date().toISOString(),
    };
    this.rows.push(stored);
    return stored;
  }

  async listMessages(convoId: string): Promise<StoredStellaMessage[]> {
    return this.rows.filter((r) => r.convoId === convoId);
  }
}

async function main(): Promise<void> {
  const store = new InMemoryStore();
  const provider = new MockProvider();

  // No `supabase` — tool handlers see `ctx.supabase === undefined` and
  // return empty results. That's fine for the mock-provider smoke test:
  // the LLM still exercises every tool branch.
  const toolCtx: ToolContext = {
    userId: 'user_test',
    convoId: 'convo_test',
  };

  console.log('--- Stella smoke test (mock provider) ---');
  for await (const ev of runStella({
    userId: 'user_test',
    convoId: 'convo_test',
    userText: 'morning! what should I wear?',
    provider,
    store,
    toolCtx,
  })) {
    console.log(JSON.stringify(ev));
  }
  console.log('--- done ---');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
