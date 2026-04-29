// Postgres-backed conversation persistence for Stella.
//
// Maps to the Supabase tables defined in supabase/migrations/0001_init_schema.sql:
//
//   public.stella_conversations (convo_id, user_id, title, created_at, last_message_at)
//   public.stella_messages      (message_id, convo_id, role, text, tool_use_id,
//                                tool_name, tool_result, created_at)
//
// Column names are snake_case in the DB and camelCase in code; we spell out
// the projection in the select to keep the mapping explicit. Inserts let the
// DB defaults populate `message_id` (uuid) and `created_at`.
//
// `summarizeAndTruncate` is unchanged — it operates on `StoredStellaMessage`
// values regardless of the underlying store.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StellaConversation,
  ZStellaMessageRole,
} from '@mei/types';
import type { ProviderMessage } from '../llm/provider';

export interface StoredStellaMessage {
  messageId: string;
  convoId: string;
  role: ZStellaMessageRole; // 'USER' | 'ASSISTANT'
  text: string;
  // Tool turns are persisted as ASSISTANT messages with these set so we can
  // reconstruct the provider message stream verbatim on the next turn.
  toolUseId?: string;
  toolName?: string;
  toolResult?: string;
  createdAt: string;
}

/**
 * Public store contract used by `runStella`. The Postgres implementation
 * below satisfies it; the smoke test (scripts/smoke.ts) provides an
 * in-memory implementation. Keeping this an interface lets the agent run
 * with no DB at all in mock mode.
 */
export interface IConversationStore {
  getConversation(
    userId: string,
    convoId: string,
  ): Promise<StellaConversation | null>;
  createConversation(convo: StellaConversation): Promise<StellaConversation>;
  appendMessage(
    convoId: string,
    msg: Omit<StoredStellaMessage, 'messageId' | 'createdAt' | 'convoId'> &
      Partial<Pick<StoredStellaMessage, 'messageId' | 'createdAt'>>,
  ): Promise<StoredStellaMessage>;
  listMessages(convoId: string): Promise<StoredStellaMessage[]>;
}

// ---------- Row <-> domain mapping ----------

interface StellaConversationRow {
  convo_id: string;
  user_id: string;
  title: string;
  created_at: string;
  last_message_at: string;
}

interface StellaMessageRow {
  message_id: string;
  convo_id: string;
  role: ZStellaMessageRole;
  text: string | null;
  tool_use_id: string | null;
  tool_name: string | null;
  tool_result: string | null;
  created_at: string;
}

const CONVO_COLUMNS = 'convo_id,user_id,title,created_at,last_message_at';
const MESSAGE_COLUMNS =
  'message_id,convo_id,role,text,tool_use_id,tool_name,tool_result,created_at';

function rowToConvo(row: StellaConversationRow): StellaConversation {
  return {
    convoId: row.convo_id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  };
}

function rowToMessage(row: StellaMessageRow): StoredStellaMessage {
  return {
    messageId: row.message_id,
    convoId: row.convo_id,
    role: row.role,
    text: row.text ?? '',
    toolUseId: row.tool_use_id ?? undefined,
    toolName: row.tool_name ?? undefined,
    toolResult: row.tool_result ?? undefined,
    createdAt: row.created_at,
  };
}

// ---------- Postgres-backed implementation ----------

export class ConversationStore implements IConversationStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async getConversation(
    userId: string,
    convoId: string,
  ): Promise<StellaConversation | null> {
    const { data, error } = await this.supabase
      .from('stella_conversations')
      .select(CONVO_COLUMNS)
      .eq('user_id', userId)
      .eq('convo_id', convoId)
      .maybeSingle<StellaConversationRow>();
    if (error) throw error;
    return data ? rowToConvo(data) : null;
  }

  async createConversation(
    convo: StellaConversation,
  ): Promise<StellaConversation> {
    const { data, error } = await this.supabase
      .from('stella_conversations')
      .insert({
        convo_id: convo.convoId,
        user_id: convo.userId,
        title: convo.title,
        created_at: convo.createdAt,
        last_message_at: convo.lastMessageAt,
      })
      .select(CONVO_COLUMNS)
      .single<StellaConversationRow>();
    if (error) throw error;
    return rowToConvo(data);
  }

  async appendMessage(
    convoId: string,
    msg: Omit<StoredStellaMessage, 'messageId' | 'createdAt' | 'convoId'> &
      Partial<Pick<StoredStellaMessage, 'messageId' | 'createdAt'>>,
  ): Promise<StoredStellaMessage> {
    // Let the DB populate message_id (uuid default) and created_at (now())
    // unless the caller explicitly supplied them.
    const insert: Record<string, unknown> = {
      convo_id: convoId,
      role: msg.role,
      text: msg.text,
      tool_use_id: msg.toolUseId ?? null,
      tool_name: msg.toolName ?? null,
      tool_result: msg.toolResult ?? null,
    };
    if (msg.messageId) insert.message_id = msg.messageId;
    if (msg.createdAt) insert.created_at = msg.createdAt;

    const { data, error } = await this.supabase
      .from('stella_messages')
      .insert(insert)
      .select(MESSAGE_COLUMNS)
      .single<StellaMessageRow>();
    if (error) throw error;
    return rowToMessage(data);
  }

  async listMessages(convoId: string): Promise<StoredStellaMessage[]> {
    const { data, error } = await this.supabase
      .from('stella_messages')
      .select(MESSAGE_COLUMNS)
      .eq('convo_id', convoId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => rowToMessage(row as StellaMessageRow));
  }
}

/**
 * Compact stored messages into the rolling provider context per SPEC §8.1:
 *   "system prompt + last 20 messages + a rolling summary".
 * Real summarization is a follow-up; for now we just take the last 20 turns.
 *
 * Tool turns become role='tool' on the provider side; everything else is
 * passed through as text.
 */
export function summarizeAndTruncate(
  messages: StoredStellaMessage[],
  maxTurns = 20,
): ProviderMessage[] {
  const recent = messages.slice(-maxTurns);
  const out: ProviderMessage[] = [];
  for (const m of recent) {
    if (m.toolUseId && m.toolResult !== undefined) {
      out.push({
        role: 'tool',
        content: m.toolResult,
        tool_use_id: m.toolUseId,
        tool_name: m.toolName,
      });
      continue;
    }
    out.push({
      role: m.role === 'ASSISTANT' ? 'assistant' : 'user',
      content: m.text,
    });
  }
  return out;
}
