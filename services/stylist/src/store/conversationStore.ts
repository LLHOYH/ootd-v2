// DDB-backed conversation persistence for Stella.
//
// Key patterns (SPEC §6.1):
//   StellaConversation : PK = USER#{userId},     SK = STELLA#{convoId}
//   StellaMessage      : PK = STELLA#{convoId},  SK = MSG#{messageId}
//
// Messages use ULIDs so SK lexicographic order == createdAt order.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
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

export interface ConversationStoreDeps {
  tableName: string;
  region: string;
  client?: DynamoDBDocumentClient;
}

export class ConversationStore {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(deps: ConversationStoreDeps) {
    this.tableName = deps.tableName;
    this.doc =
      deps.client ??
      DynamoDBDocumentClient.from(new DynamoDBClient({ region: deps.region }));
  }

  async getConversation(
    userId: string,
    convoId: string,
  ): Promise<StellaConversation | null> {
    const res = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: `STELLA#${convoId}`,
        },
      }),
    );
    if (!res.Item) return null;
    const i = res.Item as Record<string, unknown>;
    return {
      convoId: String(i.convoId ?? convoId),
      userId: String(i.userId ?? userId),
      title: String(i.title ?? ''),
      createdAt: String(i.createdAt ?? ''),
      lastMessageAt: String(i.lastMessageAt ?? ''),
    };
  }

  async createConversation(
    convo: StellaConversation,
  ): Promise<StellaConversation> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${convo.userId}`,
          SK: `STELLA#${convo.convoId}`,
          _type: 'StellaConversation',
          ...convo,
        },
      }),
    );
    return convo;
  }

  async appendMessage(
    convoId: string,
    msg: Omit<StoredStellaMessage, 'messageId' | 'createdAt' | 'convoId'> &
      Partial<Pick<StoredStellaMessage, 'messageId' | 'createdAt'>>,
  ): Promise<StoredStellaMessage> {
    const messageId = msg.messageId ?? ulid();
    const createdAt = msg.createdAt ?? new Date().toISOString();
    const stored: StoredStellaMessage = {
      messageId,
      convoId,
      role: msg.role,
      text: msg.text,
      toolUseId: msg.toolUseId,
      toolName: msg.toolName,
      toolResult: msg.toolResult,
      createdAt,
    };
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `STELLA#${convoId}`,
          SK: `MSG#${messageId}`,
          _type: 'StellaMessage',
          ...stored,
        },
      }),
    );
    return stored;
  }

  async listMessages(convoId: string): Promise<StoredStellaMessage[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `STELLA#${convoId}`,
          ':sk': 'MSG#',
        },
      }),
    );
    return (res.Items ?? []).map((raw) => {
      const i = raw as Record<string, unknown>;
      return {
        messageId: String(i.messageId),
        convoId: String(i.convoId ?? convoId),
        role: i.role as ZStellaMessageRole,
        text: String(i.text ?? ''),
        toolUseId: i.toolUseId as string | undefined,
        toolName: i.toolName as string | undefined,
        toolResult: i.toolResult as string | undefined,
        createdAt: String(i.createdAt ?? ''),
      };
    });
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
