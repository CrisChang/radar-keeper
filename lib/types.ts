export type AgentMode = "dry" | "simulate" | "live";
export type SignalMode = "demo" | "live";

export type SignalType =
  | "sharp_drop"
  | "drawdown"
  | "threshold_cross"
  | "stable";

export type FeedStatus = "live" | "stale" | "demo";

export interface MarketSignal {
  signalId: string;
  timestamp: string;
  type: SignalType;
  symbol: string;
  magnitudeBps: number;
  windowSeconds: number;
  confidence: number;
  price: number;
  referencePrice: number;
  source: string;
  feedStatus: FeedStatus;
}

export interface AgentDecision {
  action: "protect_reserve" | "hold";
  reason: string;
}

export interface TransferRequest {
  chainId: number;
  recipientAddress: string;
  amount: string;
}

export interface AgentRunResult {
  mode: AgentMode;
  signalMode: SignalMode;
  signal: MarketSignal;
  decision: AgentDecision;
  policy: {
    allowed: boolean;
    dailyCap: string;
    transferAmount: string;
    idempotencyKey?: string;
  };
  keeperHub: {
    attempted: boolean;
    simulated: boolean;
    executed: boolean;
    executionId?: string;
    transactionHash?: string;
    transactionLink?: string;
    detail?: unknown;
  };
  auditEvents: string[];
}
