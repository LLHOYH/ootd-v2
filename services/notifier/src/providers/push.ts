// Push provider — sends one or more pre-built push messages to Expo's
// service.
//
// Two implementations:
//   - MockPushProvider — append-only in-memory log of sent messages.
//     Smokes can grab the log via `getMockSentMessages()` to assert what
//     would have been pushed. Deterministic, offline.
//   - RealPushProvider — wraps Expo Push's HTTPS API
//     (https://exp.host/--/api/v2/push/send). Batches up to 100 messages
//     per request per Expo's docs. Returns the receipts so callers can
//     observe and (eventually) handle DeviceNotRegistered cleanup.
//
// Both honor the same `PushMessage` shape so the pipeline can swap mid-
// run without touching the dispatch logic.

import type { NotifierConfig } from '../config';

/** Minimal subset of the Expo Push message shape we use. */
export interface PushMessage {
  to: string; // Expo push token
  title: string;
  body: string;
  /** Arbitrary JSON the client receives via Notifications.addNotificationReceivedListener. */
  data?: Record<string, unknown>;
  /** iOS sound key. 'default' plays the platform chime. */
  sound?: 'default' | null;
  /** Android channel id (defaults to 'default'). */
  channelId?: string;
}

export interface PushReceipt {
  /** True when Expo accepted the message. False on per-token errors. */
  ok: boolean;
  /** Expo's response details. Receipt id when ok, error code when not. */
  detail: unknown;
  to: string;
}

export interface PushProvider {
  send(messages: ReadonlyArray<PushMessage>): Promise<PushReceipt[]>;
}

// ---------------------------------------------------------------------------
// MockPushProvider — append to an in-memory log; tests assert against it.
// ---------------------------------------------------------------------------

const _mockLog: PushMessage[] = [];

class MockPushProvider implements PushProvider {
  async send(messages: ReadonlyArray<PushMessage>): Promise<PushReceipt[]> {
    return messages.map((m) => {
      _mockLog.push(m);
      return { ok: true, detail: { mock: true }, to: m.to };
    });
  }
}

/** Test helper — exposes the mock provider's outbox. */
export function getMockSentMessages(): ReadonlyArray<PushMessage> {
  return _mockLog;
}

/** Test helper — clear the mock outbox between runs. */
export function clearMockSentMessages(): void {
  _mockLog.length = 0;
}

// ---------------------------------------------------------------------------
// RealPushProvider — Expo Push HTTPS API.
// ---------------------------------------------------------------------------

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

class RealPushProvider implements PushProvider {
  private readonly accessToken?: string;
  constructor(accessToken?: string) {
    this.accessToken = accessToken;
  }
  async send(messages: ReadonlyArray<PushMessage>): Promise<PushReceipt[]> {
    if (messages.length === 0) return [];
    const out: PushReceipt[] = [];
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      const headers: Record<string, string> = {
        accept: 'application/json',
        'content-type': 'application/json',
      };
      if (this.accessToken) {
        headers.authorization = `Bearer ${this.accessToken}`;
      }
      const r = await fetch(EXPO_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
      });
      if (!r.ok) {
        const text = await r.text();
        // Per-batch failure — mark every message in the batch as failed.
        for (const m of batch) {
          out.push({ ok: false, detail: { status: r.status, body: text }, to: m.to });
        }
        continue;
      }
      const body = (await r.json()) as { data?: Array<{ status: string; id?: string; message?: string; details?: unknown }> };
      const tickets = body.data ?? [];
      batch.forEach((m, idx) => {
        const t = tickets[idx];
        out.push({
          ok: t?.status === 'ok',
          detail: t ?? { reason: 'no ticket' },
          to: m.to,
        });
      });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Factory.
// ---------------------------------------------------------------------------

export function getPushProvider(cfg: NotifierConfig): PushProvider {
  if (cfg.mode === 'real') {
    return new RealPushProvider(cfg.expoAccessToken);
  }
  return new MockPushProvider();
}
