import type { AgentDecision, MarketSignal } from "./types";

export interface DecisionConfig {
  minDropBps: number;
  minConfidence: number;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return parsed;
}

export function getDecisionConfig(): DecisionConfig {
  return {
    minDropBps: envNumber("MIN_DROP_BPS", 150),
    minConfidence: envNumber("MIN_CONFIDENCE", 0.9),
  };
}

export function decide(
  signal: MarketSignal,
  config: DecisionConfig = getDecisionConfig(),
): AgentDecision {
  if (signal.feedStatus === "stale") {
    return {
      action: "hold",
      reason:
        "The market feed is stale, so the safety policy forbids an onchain action.",
    };
  }

  if (
    signal.type === "sharp_drop" &&
    Math.abs(signal.magnitudeBps) >= config.minDropBps &&
    signal.confidence >= config.minConfidence
  ) {
    return {
      action: "protect_reserve",
      reason:
        `A ${Math.abs(signal.magnitudeBps)} bps drop at ` +
        `${signal.confidence.toFixed(2)} confidence crossed the ` +
        `${config.minDropBps} bps / ${config.minConfidence.toFixed(2)} policy.`,
    };
  }

  return {
    action: "hold",
    reason:
      `No action: ${signal.magnitudeBps} bps at ` +
      `${signal.confidence.toFixed(2)} confidence is below policy thresholds.`,
  };
}
