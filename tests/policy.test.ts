import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DailyCapExceeded,
  DuplicateAction,
  parseNativeAmount,
  PolicyEngine,
  UnresolvedAction,
} from "../lib/policy";

function policy(cap = "0.00005"): PolicyEngine {
  const root = mkdtempSync(join(tmpdir(), "radar-keeper-policy-"));
  return new PolicyEngine(
    join(root, "policy.json"),
    join(root, "audit.jsonl"),
    cap,
  );
}

test("native amounts are converted without floating-point math", () => {
  assert.equal(parseNativeAmount("0.00001"), 10_000_000_000_000n);
  assert.equal(parseNativeAmount("1.25"), 1_250_000_000_000_000_000n);
});

test("daily cap blocks unsafe cumulative spend", () => {
  const engine = policy("0.00002");
  engine.recordSpend("0.00001");
  engine.recordSpend("0.00001");
  assert.throws(
    () => engine.authorizeTransfer("0.00001"),
    DailyCapExceeded,
  );
});

test("same action cannot be reserved twice", () => {
  const engine = policy();
  engine.reserveAction("signal-1:protect");
  assert.throws(
    () => engine.reserveAction("signal-1:protect"),
    DuplicateAction,
  );
});

test("an unresolved action blocks a differently keyed transfer", () => {
  const engine = policy();
  engine.reserveAction("signal-1:protect");
  engine.markActionUncertain("signal-1:protect", "client timed out");
  assert.throws(
    () => engine.reserveAction("signal-2:protect"),
    UnresolvedAction,
  );
});

test("recipient must be a valid allowlisted address", () => {
  const engine = policy();
  const allowed = "0x1111111111111111111111111111111111111111";
  assert.doesNotThrow(() => engine.assertRecipient(allowed, allowed));
  assert.throws(() =>
    engine.assertRecipient(
      "0x2222222222222222222222222222222222222222",
      allowed,
    ),
  );
});
