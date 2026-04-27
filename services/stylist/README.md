# @mei/stylist

Stella the AI stylist. Isolated Lambda — 30s timeout, concurrency reservation,
SSE streaming. Anthropic Claude (Sonnet tier). See `SPEC.md §8`.

## Architecture

```
src/
  index.ts                    Lambda handler (APIGW v2 response streaming)
  config.ts                   Env loader (TABLE_NAME, REGION, …)
  agent/
    runStella.ts              Top-level orchestrator: tool loop + persistence
    systemPrompt.ts           STELLA_SYSTEM_PROMPT — verbatim from SPEC §8.2
    tools.ts                  Seven tool definitions — verbatim from SPEC §8.3
    toolHandlers.ts           DDB-backed handlers + dispatcher
  llm/
    provider.ts               LLMProvider interface + LLMEvent union
    anthropic.ts              Real Anthropic streaming impl
    mock.ts                   Deterministic stub for tests / local dev
    factory.ts                getProvider() — mock-by-default
  store/
    conversationStore.ts      DDB CRUD + summarizeAndTruncate (SPEC §8.1)
  cost/
    tracker.ts                Per-message cost log + $0.10 mean alert (§8.4)
```

## Environment variables

| Var | Required | Description |
| --- | --- | --- |
| `TABLE_NAME` | yes | DynamoDB single-table name (`mei-main`). |
| `REGION` | yes | AWS region for the DDB client. |
| `ANTHROPIC_API_KEY` | no | If set, the real provider is used. |
| `STELLA_LLM_MODE` | no | `'real'` or `'mock'`. Forces the provider regardless of key presence. |

If `STELLA_LLM_MODE` is unset and there is no API key, the factory falls back
to `MockProvider` — the agent runs end-to-end with no external dependency.

## Running locally

```
pnpm install
pnpm --filter @mei/stylist local
```

The smoke driver (`scripts/smoke.ts`) wires `MockProvider` with an in-memory
conversation store and prints the SSE event stream. Useful for verifying the
tool loop without DDB or an API key.

## Swapping in real Anthropic

```
export ANTHROPIC_API_KEY=sk-ant-…
export TABLE_NAME=mei-main
export REGION=ap-southeast-1
# STELLA_LLM_MODE unset → real provider auto-selected
```

The Anthropic model is pinned in `src/llm/anthropic.ts` (Sonnet 4.5 at
time of writing — re-evaluate every milestone per SPEC §8.1).

## What this branch does NOT do

- Real weather / calendar integrations (placeholder values).
- Today's pick one-shot (SPEC §8.5).
- Real conversation summarization — `summarizeAndTruncate` keeps last 20.
- Bedrock fallback.
- API Gateway wiring — that lands in a future branch.
