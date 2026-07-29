import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { decide } from "./decision";
import {
  explorerLink,
  KeeperHubClient,
  type KeeperHubExecution,
} from "./keeperhub";
import { PolicyEngine } from "./policy";
import { buildDemoSignal, getLatestSignal } from "./signals";
import type {
  AgentMode,
  AgentRunResult,
  SignalMode,
  TransferRequest,
} from "./types";

export interface RunAgentOptions {
  mode: AgentMode;
  signalMode: SignalMode;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function envChainId(): number {
  const parsed = Number(env("KEEPERHUB_CHAIN_ID", "11155111"));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("KEEPERHUB_CHAIN_ID must be a positive integer");
  }
  return parsed;
}

function idempotencyKey(signalId: string, request: TransferRequest): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ signalId, action: "protect_reserve", request }))
    .digest("hex");
  return `radar-keeper-${digest.slice(0, 40)}`;
}

function transactionFields(result: KeeperHubExecution): {
  executionId?: string;
  transactionHash?: string;
  transactionLink?: string;
} {
  return {
    executionId:
      typeof result.executionId === "string"
        ? result.executionId
        : undefined,
    transactionHash:
      typeof result.transactionHash === "string"
        ? result.transactionHash
        : undefined,
    transactionLink:
      typeof result.transactionLink === "string"
        ? result.transactionLink
        : undefined,
  };
}

async function finalExecution(
  client: KeeperHubClient,
  initial: KeeperHubExecution,
): Promise<KeeperHubExecution> {
  const initialFields = transactionFields(initial);
  if (
    initialFields.transactionHash ||
    initialFields.transactionLink ||
    !initialFields.executionId
  ) {
    return initial;
  }

  let latest = initial;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
    latest = await client.getExecutionStatus(initialFields.executionId);
    const fields = transactionFields(latest);
    if (
      fields.transactionHash ||
      fields.transactionLink ||
      latest.status === "completed" ||
      latest.status === "failed"
    ) {
      break;
    }
  }
  return latest;
}

export async function runAgent(
  options: RunAgentOptions,
): Promise<AgentRunResult> {
  const { mode, signalMode } = options;
  const dataRoot = resolve(
    process.env.RADAR_KEEPER_DATA_DIR ?? process.cwd(),
    process.env.RADAR_KEEPER_DATA_DIR ? "." : ".data",
  );
  const dailyCap = env("KEEPERHUB_DAILY_CAP", "0.00005");
  const transferAmount = env("KEEPERHUB_TRANSFER_AMOUNT", "0.00001");
  const policy = new PolicyEngine(
    resolve(dataRoot, "policy.json"),
    resolve(dataRoot, "audit.jsonl"),
    dailyCap,
  );
  const auditEvents: string[] = [];
  const audit = (
    event: string,
    fields: Record<string, unknown> = {},
  ): void => {
    auditEvents.push(policy.audit(event, fields));
  };

  policy.preflight();
  audit("cycle_started", { mode, signalMode });

  const signal =
    signalMode === "demo" ? buildDemoSignal() : await getLatestSignal();
  audit("signal_observed", {
    signalId: signal.signalId,
    type: signal.type,
    magnitudeBps: signal.magnitudeBps,
    confidence: signal.confidence,
    feedStatus: signal.feedStatus,
  });

  const decision = decide(signal);
  audit("decision_made", {
    signalId: signal.signalId,
    action: decision.action,
    reason: decision.reason,
  });

  const result: AgentRunResult = {
    mode,
    signalMode,
    signal,
    decision,
    policy: {
      allowed: decision.action === "protect_reserve",
      dailyCap,
      transferAmount,
    },
    keeperHub: {
      attempted: false,
      simulated: false,
      executed: false,
    },
    auditEvents,
  };

  if (decision.action === "hold") {
    policy.recordSuccess();
    audit("cycle_completed_without_action");
    return result;
  }

  policy.authorizeTransfer(transferAmount);

  if (mode === "dry") {
    audit("local_action_simulated", {
      amount: transferAmount,
      note: "No KeeperHub request was sent.",
    });
    policy.recordSuccess();
    result.keeperHub.simulated = true;
    result.keeperHub.detail = {
      status: "local-simulation",
      wouldRevert: false,
    };
    return result;
  }

  const apiKey = env("KEEPERHUB_API_KEY");
  const chainId = envChainId();
  const recipientAddress = env("KEEPERHUB_RECIPIENT_ADDRESS");
  const request: TransferRequest = {
    chainId,
    recipientAddress,
    amount: transferAmount,
  };
  policy.assertRecipient(recipientAddress, env("KEEPERHUB_RECIPIENT_ADDRESS"));

  const client = new KeeperHubClient(
    apiKey,
    env("KEEPERHUB_BASE_URL", "https://app.keeperhub.com/api"),
  );
  result.keeperHub.attempted = true;

  const chain = await client.assertEnabledTestnet(chainId);
  audit("testnet_verified", { chainId, chain: chain.name });

  const simulation = await client.simulateTransfer(request);
  const simulationFailed =
    simulation.success === false ||
    simulation.wouldRevert === true ||
    simulation.status === "failed";
  if (simulationFailed) {
    throw new Error("KeeperHub simulation rejected the transaction");
  }
  result.keeperHub.simulated = true;
  result.keeperHub.detail = simulation;
  audit("keeperhub_simulation_passed", {
    chainId,
    recipientAddress,
    amount: transferAmount,
  });

  if (mode === "simulate") {
    policy.recordSuccess();
    return result;
  }

  if (process.env.LIVE_EXECUTION_ENABLED !== "true") {
    throw new Error(
      "live broadcast is locked; set LIVE_EXECUTION_ENABLED=true after reviewing the simulation",
    );
  }

  const key = idempotencyKey(signal.signalId, request);
  result.policy.idempotencyKey = key;
  policy.reserveAction(key);
  audit("action_reserved", { idempotencyKey: key });

  try {
    const submitted = await client.executeTransfer(request, key);
    const execution = await finalExecution(client, submitted);
    const fields = transactionFields(execution);
    const transactionLink =
      fields.transactionLink ??
      explorerLink(chainId, fields.transactionHash);
    const status = String(execution.status ?? submitted.status ?? "");

    if (
      status.toLowerCase() === "failed" ||
      (!fields.executionId && !fields.transactionHash && !transactionLink)
    ) {
      policy.markActionUncertain(key, JSON.stringify(execution));
      throw new Error("KeeperHub did not return verifiable execution proof");
    }

    policy.completeAction(
      key,
      fields.executionId ?? "completed",
      transactionLink ?? fields.transactionHash ?? "completed",
    );
    policy.recordSpend(transferAmount);
    policy.recordSuccess();
    audit("keeperhub_action_executed", {
      executionId: fields.executionId,
      transactionHash: fields.transactionHash,
      transactionLink,
    });

    result.keeperHub.executed = true;
    result.keeperHub.executionId = fields.executionId;
    result.keeperHub.transactionHash = fields.transactionHash;
    result.keeperHub.transactionLink = transactionLink;
    result.keeperHub.detail = execution;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    policy.markActionUncertain(key, message);
    policy.recordFailure(message);
    audit("keeperhub_action_uncertain", { error: message });
    throw error;
  }
}
