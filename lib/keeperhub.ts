import { randomUUID } from "node:crypto";
import type { TransferRequest } from "./types";

interface KeeperHubErrorBody {
  error?: string;
  code?: string;
  detail?: string;
  hint?: string;
  originalExecutionId?: string;
  request_id?: string;
}

export class KeeperHubHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly originalExecutionId?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "KeeperHubHttpError";
  }
}

export interface KeeperHubChain {
  chainId: number;
  name: string;
  isEnabled: boolean;
  isTestnet: boolean;
}

export interface KeeperHubExecution {
  executionId?: string;
  status?: string;
  transactionHash?: string;
  transactionLink?: string;
  recoveryAttempts?: number;
  recoveredFrom?: string;
  [key: string]: unknown;
}

type FetchLike = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;

export interface KeeperHubClientOptions {
  requestTimeoutMs?: number;
  executionAttempts?: number;
  recoveryDelayMs?: number;
  sleep?: Sleep;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorName(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
    ? error.name
    : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecoverableExecutionError(error: unknown): boolean {
  if (error instanceof KeeperHubHttpError) {
    return (
      (error.status === 409 && error.code === "idempotency_in_progress") ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500
    );
  }

  const name = errorName(error);
  return (
    name === "AbortError" ||
    name === "TimeoutError" ||
    error instanceof TypeError
  );
}

function unwrapData(value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    "data" in value
  ) {
    return (value as { data: unknown }).data;
  }
  return value;
}

function numberFrom(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function normalizeChains(payload: unknown): KeeperHubChain[] {
  const unwrapped = unwrapData(payload);
  const rawChains = Array.isArray(unwrapped)
    ? unwrapped
    : typeof unwrapped === "object" &&
        unwrapped !== null &&
        "chains" in unwrapped &&
        Array.isArray((unwrapped as { chains: unknown }).chains)
      ? (unwrapped as { chains: unknown[] }).chains
      : [];

  return rawChains.flatMap((value) => {
    if (typeof value !== "object" || value === null) return [];
    const record = value as Record<string, unknown>;
    const chainId = numberFrom(record.chainId ?? record.id);
    if (chainId === undefined) return [];
    return [
      {
        chainId,
        name: String(record.name ?? record.label ?? `Chain ${chainId}`),
        isEnabled: record.isEnabled !== false,
        isTestnet:
          record.isTestnet === true ||
          String(record.networkType ?? "").toLowerCase() === "testnet",
      },
    ];
  });
}

export class KeeperHubClient {
  private readonly requestTimeoutMs: number;
  private readonly executionAttempts: number;
  private readonly recoveryDelayMs: number;
  private readonly sleep: Sleep;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://app.keeperhub.com/api",
    private readonly fetchImpl: FetchLike = fetch,
    options: KeeperHubClientOptions = {},
  ) {
    if (!apiKey.startsWith("kh_")) {
      throw new Error(
        "KEEPERHUB_API_KEY must be an organization key beginning with kh_",
      );
    }
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 15_000);
    this.executionAttempts = Math.max(1, options.executionAttempts ?? 3);
    this.recoveryDelayMs = Math.max(0, options.recoveryDelayMs ?? 750);
    this.sleep = options.sleep ?? wait;
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "x-request-id": randomUUID(),
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(this.requestTimeoutMs),
    });

    const body = (await response.json().catch(() => ({}))) as
      | KeeperHubErrorBody
      | unknown;
    if (!response.ok) {
      const errorBody = body as KeeperHubErrorBody;
      const pieces = [
        errorBody.error,
        errorBody.detail,
        errorBody.hint,
      ].filter(Boolean);
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds =
        retryAfterHeader === null ? undefined : Number(retryAfterHeader);
      throw new KeeperHubHttpError(
        `KeeperHub HTTP ${response.status}: ${pieces.join(" — ") || "request failed"}`,
        response.status,
        errorBody.code,
        errorBody.originalExecutionId,
        retryAfterSeconds !== undefined &&
        Number.isFinite(retryAfterSeconds) &&
        retryAfterSeconds >= 0
          ? retryAfterSeconds * 1_000
          : undefined,
      );
    }
    return unwrapData(body);
  }

  async assertEnabledTestnet(chainId: number): Promise<KeeperHubChain> {
    const payload = await this.request("/chains");
    const chains = normalizeChains(payload);
    const chain = chains.find((candidate) => candidate.chainId === chainId);
    if (!chain) {
      throw new Error(`KeeperHub did not report chain ${chainId}`);
    }
    if (!chain.isEnabled || !chain.isTestnet) {
      throw new Error(
        `chain ${chainId} must be enabled and marked as a testnet`,
      );
    }
    return chain;
  }

  async simulateTransfer(
    request: TransferRequest,
  ): Promise<KeeperHubExecution> {
    return (await this.request("/execute/transfer", {
      method: "POST",
      body: JSON.stringify({ ...request, simulate: true }),
    })) as KeeperHubExecution;
  }

  async executeTransfer(
    request: TransferRequest,
    idempotencyKey: string,
  ): Promise<KeeperHubExecution> {
    const body = JSON.stringify(request);
    let lastError: unknown;

    for (let attempt = 0; attempt < this.executionAttempts; attempt += 1) {
      try {
        const execution = (await this.request("/execute/transfer", {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey },
          body,
        })) as KeeperHubExecution;
        return attempt === 0
          ? execution
          : {
              ...execution,
              recoveryAttempts: attempt,
              recoveredFrom: errorMessage(lastError),
            };
      } catch (error) {
        lastError = error;
        const hasAnotherAttempt = attempt + 1 < this.executionAttempts;
        if (!hasAnotherAttempt || !isRecoverableExecutionError(error)) {
          throw error;
        }

        const retryAfterMs =
          error instanceof KeeperHubHttpError ? error.retryAfterMs : undefined;
        const delay =
          retryAfterMs ?? this.recoveryDelayMs * 2 ** attempt;
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  async getExecutionStatus(
    executionId: string,
  ): Promise<KeeperHubExecution> {
    return (await this.request(
      `/execute/${encodeURIComponent(executionId)}/status`,
    )) as KeeperHubExecution;
  }
}

export function explorerLink(
  chainId: number,
  transactionHash: string | undefined,
): string | undefined {
  if (!transactionHash) return undefined;
  const explorers: Record<number, string> = {
    11155111: "https://sepolia.etherscan.io/tx/",
    84532: "https://sepolia.basescan.org/tx/",
    421614: "https://sepolia.arbiscan.io/tx/",
  };
  const prefix = explorers[chainId];
  return prefix ? `${prefix}${transactionHash}` : undefined;
}
