// Per-message cost tracker. SPEC §8.4: alert if mean cost per conversation
// exceeds $0.10. CloudWatch metric emission is stubbed to console.log for
// this branch — the real CloudWatch SDK call lands when infra wires up.

const MEAN_COST_ALERT_USD = 0.1;

// Sonnet 4.5 reference pricing (USD per 1M tokens). Update if the model in
// `llm/anthropic.ts` changes.
const PRICE_INPUT_PER_1M_USD = 3.0;
const PRICE_OUTPUT_PER_1M_USD = 15.0;

export interface UsageEvent {
  convoId: string;
  userId: string;
  inputTokens: number;
  outputTokens: number;
  /** If omitted, computed from token counts at Sonnet pricing. */
  costUsd?: number;
}

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_1M_USD +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_1M_USD
  );
}

export class CostTracker {
  private readonly perConvoTotals = new Map<string, number>();
  private readonly perConvoCount = new Map<string, number>();

  logUsage(event: UsageEvent): void {
    const cost =
      event.costUsd ?? estimateCostUsd(event.inputTokens, event.outputTokens);

    const prevTotal = this.perConvoTotals.get(event.convoId) ?? 0;
    const prevCount = this.perConvoCount.get(event.convoId) ?? 0;
    const newTotal = prevTotal + cost;
    const newCount = prevCount + 1;
    this.perConvoTotals.set(event.convoId, newTotal);
    this.perConvoCount.set(event.convoId, newCount);

    // Stubbed CloudWatch EMF-style metric.
    console.log(
      JSON.stringify({
        metric: 'StellaUsage',
        convoId: event.convoId,
        userId: event.userId,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        costUsd: Number(cost.toFixed(6)),
        convoTotalUsd: Number(newTotal.toFixed(6)),
        convoMeanUsd: Number((newTotal / newCount).toFixed(6)),
      }),
    );

    const meanForConvo = newTotal / newCount;
    if (meanForConvo > MEAN_COST_ALERT_USD) {
      console.warn(
        JSON.stringify({
          alert: 'StellaCostThresholdExceeded',
          convoId: event.convoId,
          meanUsd: Number(meanForConvo.toFixed(6)),
          thresholdUsd: MEAN_COST_ALERT_USD,
        }),
      );
    }
  }
}

export const costTracker = new CostTracker();
