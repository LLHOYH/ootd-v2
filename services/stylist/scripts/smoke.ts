// Local smoke driver. Runs `runStella` against MockProvider with an
// in-memory conversation store stand-in, printing the SSE event stream.
//
// No DDB, no API key. Exits 0 on success.

import { MockProvider } from '../src/llm/mock';
import { runStella } from '../src/agent/runStella';
import type { StoredStellaMessage } from '../src/store/conversationStore';
import type { ToolContext } from '../src/agent/toolHandlers';

class InMemoryStore {
  private readonly rows: StoredStellaMessage[] = [];
  private counter = 0;

  async appendMessage(
    convoId: string,
    msg: Omit<StoredStellaMessage, 'messageId' | 'createdAt'> &
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

// In-memory tool ctx: the dispatcher will reach for DDB, so we monkey-patch
// `executeTool` via a fake doc that short-circuits the queries. To keep the
// smoke test self-contained we override the tool context with a doc client
// stub that returns canned responses.
const fakeDoc = {
  send: async (cmd: { input: Record<string, unknown> }) => {
    const { TableName: _tn, KeyConditionExpression: kce } =
      cmd.input as { TableName: string; KeyConditionExpression?: string };
    if (kce && kce.includes('begins_with(SK, :sk)')) {
      return { Items: [] };
    }
    return { Item: null };
  },
} as unknown as ToolContext['doc'];

async function main(): Promise<void> {
  const store = new InMemoryStore() as unknown as {
    appendMessage: InMemoryStore['appendMessage'];
    listMessages: InMemoryStore['listMessages'];
  };

  const provider = new MockProvider();

  const toolCtx: ToolContext = {
    userId: 'user_test',
    convoId: 'convo_test',
    tableName: 'mei-main',
    region: 'us-east-1',
    doc: fakeDoc,
  };

  console.log('--- Stella smoke test (mock provider) ---');
  for await (const ev of runStella({
    userId: 'user_test',
    convoId: 'convo_test',
    userText: 'morning! what should I wear?',
    provider,
    // The store interface used by runStella is structurally compatible.
    store: store as never,
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
