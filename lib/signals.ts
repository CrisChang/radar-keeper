import { createHash } from "node:crypto";
import type { MarketSignal, SignalType } from "./types";

// Coinbase Exchange candle: [time, low, high, open, close, volume].
type CoinbaseCandle = [number, number, number, number, number, number];

const COINBASE_API = "https://api.exchange.coinbase.com";
const ALLOWED_SYMBOLS = new Set(["ETH-USD", "BTC-USD"]);
let lastLiveSignal: MarketSignal | undefined;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeSignalId(symbol: string, timestampSeconds: number): string {
  const digest = createHash("sha256")
    .update(`${symbol}:${timestampSeconds}`)
    .digest("hex")
    .slice(0, 12);
  return `risk-${digest}`;
}

export function buildSignalFromCandles(
  symbol: string,
  rawCandles: CoinbaseCandle[],
): MarketSignal {
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    throw new Error(`unsupported symbol: ${symbol}`);
  }
  if (rawCandles.length < 3) {
    throw new Error("at least three one-minute candles are required");
  }

  const candles = [...rawCandles]
    .sort((left, right) => left[0] - right[0])
    .slice(-3);
  const first = candles[0];
  const latest = candles[candles.length - 1];
  const referencePrice = Number(first[3]);
  const price = Number(latest[4]);

  if (
    !Number.isFinite(referencePrice) ||
    !Number.isFinite(price) ||
    referencePrice <= 0 ||
    price <= 0
  ) {
    throw new Error("market feed returned invalid prices");
  }

  const magnitudeBps = Math.round(
    ((price - referencePrice) / referencePrice) * 10_000,
  );
  const totalVolume = candles.reduce(
    (sum, candle) => sum + Math.max(0, Number(candle[5])),
    0,
  );
  const confidence = clamp(
    0.82 +
      Math.min(Math.abs(magnitudeBps) / 2_000, 0.13) +
      (totalVolume > 0 ? 0.03 : 0),
    0,
    0.98,
  );

  let type: SignalType = "stable";
  if (magnitudeBps <= -150) type = "sharp_drop";
  else if (magnitudeBps < 0) type = "drawdown";
  else if (magnitudeBps >= 100) type = "threshold_cross";

  return {
    signalId: makeSignalId(symbol, latest[0]),
    timestamp: new Date(latest[0] * 1_000).toISOString(),
    type,
    symbol,
    magnitudeBps,
    windowSeconds: Math.max(60, latest[0] - first[0] + 60),
    confidence: Number(confidence.toFixed(3)),
    price: Number(price.toFixed(2)),
    referencePrice: Number(referencePrice.toFixed(2)),
    source: "coinbase-exchange-candles",
    feedStatus: "live",
  };
}

export function buildDemoSignal(now = new Date()): MarketSignal {
  const timestampSeconds = Math.floor(now.getTime() / 60_000) * 60;
  return {
    signalId: makeSignalId("ETH-USD:demo", timestampSeconds),
    timestamp: now.toISOString(),
    type: "sharp_drop",
    symbol: "ETH-USD",
    magnitudeBps: -184,
    windowSeconds: 120,
    confidence: 0.95,
    price: 2_944.8,
    referencePrice: 3_000,
    source: "radar-keeper-demo-fixture",
    feedStatus: "demo",
  };
}

function safeFallback(symbol: string, now = new Date()): MarketSignal {
  if (lastLiveSignal?.symbol === symbol) {
    return {
      ...lastLiveSignal,
      timestamp: now.toISOString(),
      feedStatus: "stale",
      confidence: Math.min(lastLiveSignal.confidence, 0.75),
    };
  }

  return {
    signalId: makeSignalId(`${symbol}:unavailable`, Math.floor(now.getTime() / 1_000)),
    timestamp: now.toISOString(),
    type: "stable",
    symbol,
    magnitudeBps: 0,
    windowSeconds: 120,
    confidence: 0,
    price: 0,
    referencePrice: 0,
    source: "coinbase-unavailable-safe-fallback",
    feedStatus: "stale",
  };
}

export async function getLatestSignal(
  symbol = "ETH-USD",
): Promise<MarketSignal> {
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    throw new Error(`unsupported symbol: ${symbol}`);
  }

  const end = new Date();
  const start = new Date(end.getTime() - 4 * 60 * 1_000);
  const url = new URL(`/products/${symbol}/candles`, COINBASE_API);
  url.searchParams.set("granularity", "60");
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("end", end.toISOString());

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "cache-control": "no-cache",
        "user-agent": "radar-keeper/0.1",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`Coinbase feed returned HTTP ${response.status}`);
    }
    const signal = buildSignalFromCandles(
      symbol,
      (await response.json()) as CoinbaseCandle[],
    );
    lastLiveSignal = signal;
    return signal;
  } catch {
    return safeFallback(symbol);
  }
}
