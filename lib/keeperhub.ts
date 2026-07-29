import { randomUUID } from "node:crypto";
import type { TransferRequest } from "./types";

interface KeeperHubErrorBody {
  error?: string;
  detail?: string;
  hint?: string;
  request_id?: string;
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
  [key: string]: unknown;
}

type FetchLike = typeof fetch;

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
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://app.keeperhub.com/api",
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    if (!apiKey.startsWith("kh_")) {
      throw new Error(
        "KEEPERHUB_API_KEY must be an organization key beginning with kh_",
      );
    }
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
      signal: init.signal ?? AbortSignal.timeout(15_000),
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
      throw new Error(
        `KeeperHub HTTP ${response.status}: ${pieces.join(" — ") || "request failed"}`,
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
    return (await this.request("/execute/transfer", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify(request),
    })) as KeeperHubExecution;
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
