// DynamoDB single-table client + thin helpers.
//
// SPEC.md §6.1: PK + SK + GSI1 + GSI2. All access goes through this module so
// table-name and marshalling concerns stay in one place.
//
// We keep the helpers deliberately thin: they take fully-formed items / keys
// and pass through to the DocumentClient. Higher-level access patterns belong
// in per-feature handler modules (later branches).

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
  type GetCommandInput,
  type PutCommandInput,
  type QueryCommandInput,
  type UpdateCommandInput,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { config } from './config';

let _doc: DynamoDBDocumentClient | undefined;

/** Memoised DocumentClient — one per warm Lambda container. */
export function getDdb(): DynamoDBDocumentClient {
  if (!_doc) {
    const base = new DynamoDBClient({ region: config.region });
    _doc = DynamoDBDocumentClient.from(base, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: false,
      },
    });
  }
  return _doc;
}

export interface PrimaryKey {
  PK: string;
  SK: string;
}

/** Strict get-by-PK/SK. Returns undefined when not found. */
export async function getItem<T = Record<string, unknown>>(
  key: PrimaryKey,
  opts: Omit<GetCommandInput, 'TableName' | 'Key'> = {},
): Promise<T | undefined> {
  const res = await getDdb().send(
    new GetCommand({ TableName: config.tableName, Key: key, ...opts }),
  );
  return res.Item as T | undefined;
}

/** Put a single item. Caller supplies PK/SK in `item`. */
export async function putItem(
  item: Record<string, unknown>,
  opts: Omit<PutCommandInput, 'TableName' | 'Item'> = {},
): Promise<void> {
  await getDdb().send(
    new PutCommand({ TableName: config.tableName, Item: item, ...opts }),
  );
}

/** Run a Query against the main table or a GSI. */
export async function queryItems<T = Record<string, unknown>>(
  input: Omit<QueryCommandInput, 'TableName'>,
): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, unknown> }> {
  const res = await getDdb().send(
    new QueryCommand({ TableName: config.tableName, ...input }),
  );
  return {
    items: (res.Items ?? []) as T[],
    lastEvaluatedKey: res.LastEvaluatedKey,
  };
}

/** Update by PK/SK. Caller supplies the UpdateExpression et al. */
export async function updateItem<T = Record<string, unknown>>(
  key: PrimaryKey,
  input: Omit<UpdateCommandInput, 'TableName' | 'Key'>,
): Promise<T | undefined> {
  const res = await getDdb().send(
    new UpdateCommand({ TableName: config.tableName, Key: key, ...input }),
  );
  return res.Attributes as T | undefined;
}

/** Atomic multi-item write. Each entry already includes its TableName. */
export async function transactWrite(
  input: TransactWriteCommandInput,
): Promise<void> {
  await getDdb().send(new TransactWriteCommand(input));
}

/** Test seam: reset the cached client (used in unit tests, never in handlers). */
export function __resetDdbForTests(): void {
  _doc = undefined;
}
