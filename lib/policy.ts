import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export class PolicyError extends Error {}
export class DailyCapExceeded extends PolicyError {}
export class DuplicateAction extends PolicyError {}
export class CircuitOpen extends PolicyError {}

type ActionStatus = "pending" | "succeeded" | "uncertain";

interface ActionRecord {
  status: ActionStatus;
  updatedAt: string;
  executionId?: string;
  transaction?: string;
}

interface PolicyState {
  day: string;
  spentWei: string;
  actions: Record<string, ActionRecord>;
  breaker: {
    consecutiveFailures: number;
    halted: boolean;
    reason?: string;
  };
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseNativeAmount(amount: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(amount)) {
    throw new PolicyError(`invalid native-token amount: ${amount}`);
  }
  const [whole, fraction = ""] = amount.split(".");
  return (
    BigInt(whole) * 10n ** 18n +
    BigInt(fraction.padEnd(18, "0"))
  );
}

function newState(): PolicyState {
  return {
    day: utcDay(),
    spentWei: "0",
    actions: {},
    breaker: { consecutiveFailures: 0, halted: false },
  };
}

export class PolicyEngine {
  private state: PolicyState;
  private readonly dailyCapWei: bigint;

  constructor(
    private readonly statePath: string,
    private readonly auditPath: string,
    dailyCap: string,
    private readonly maxConsecutiveFailures = 3,
  ) {
    mkdirSync(dirname(statePath), { recursive: true });
    mkdirSync(dirname(auditPath), { recursive: true });
    this.dailyCapWei = parseNativeAmount(dailyCap);
    this.state = this.load();
    this.rotateDay();
  }

  private load(): PolicyState {
    try {
      return JSON.parse(readFileSync(this.statePath, "utf8")) as PolicyState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return newState();
      throw error;
    }
  }

  private rotateDay(): void {
    const today = utcDay();
    if (this.state.day !== today) {
      this.state.day = today;
      this.state.spentWei = "0";
      this.save();
    }
  }

  private save(): void {
    const temporaryPath = `${this.statePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(this.state, null, 2));
    renameSync(temporaryPath, this.statePath);
  }

  preflight(): void {
    this.rotateDay();
    if (this.state.breaker.halted) {
      throw new CircuitOpen(
        this.state.breaker.reason ?? "circuit breaker requires a human reset",
      );
    }
  }

  authorizeTransfer(amount: string): void {
    const amountWei = parseNativeAmount(amount);
    if (amountWei <= 0n) {
      throw new PolicyError("transfer amount must be greater than zero");
    }
    const spentWei = BigInt(this.state.spentWei);
    if (spentWei + amountWei > this.dailyCapWei) {
      throw new DailyCapExceeded(
        `transfer would exceed the configured daily cap`,
      );
    }
  }

  assertRecipient(recipient: string, allowlistedRecipient: string): void {
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      throw new PolicyError("recipient must be a valid EVM address");
    }
    if (/^0x0{40}$/i.test(recipient)) {
      throw new PolicyError("zero address is never a valid recipient");
    }
    if (recipient.toLowerCase() !== allowlistedRecipient.toLowerCase()) {
      throw new PolicyError("recipient does not match the configured allowlist");
    }
  }

  recordSpend(amount: string): void {
    this.authorizeTransfer(amount);
    this.state.spentWei = (
      BigInt(this.state.spentWei) + parseNativeAmount(amount)
    ).toString();
    this.save();
  }

  reserveAction(key: string): void {
    const existing = this.state.actions[key];
    if (existing) {
      throw new DuplicateAction(
        `action ${key} already has status ${existing.status}`,
      );
    }
    this.state.actions[key] = {
      status: "pending",
      updatedAt: new Date().toISOString(),
    };
    this.save();
  }

  completeAction(
    key: string,
    executionId: string,
    transaction: string,
  ): void {
    const action = this.state.actions[key];
    if (!action || action.status !== "pending") {
      throw new PolicyError(`action ${key} is not pending`);
    }
    action.status = "succeeded";
    action.updatedAt = new Date().toISOString();
    action.executionId = executionId;
    action.transaction = transaction;
    this.save();
  }

  markActionUncertain(key: string, detail: string): void {
    const action = this.state.actions[key];
    if (action) {
      action.status = "uncertain";
      action.updatedAt = new Date().toISOString();
      action.transaction = detail;
      this.save();
    }
  }

  recordSuccess(): void {
    this.state.breaker.consecutiveFailures = 0;
    this.save();
  }

  recordFailure(reason: string): void {
    this.state.breaker.consecutiveFailures += 1;
    if (
      this.state.breaker.consecutiveFailures >= this.maxConsecutiveFailures
    ) {
      this.state.breaker.halted = true;
      this.state.breaker.reason =
        `${this.state.breaker.consecutiveFailures} consecutive failures: ${reason}`;
    }
    this.save();
  }

  audit(event: string, fields: Record<string, unknown> = {}): string {
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      ...fields,
    };
    appendFileSync(this.auditPath, `${JSON.stringify(entry)}\n`);
    return event;
  }
}
