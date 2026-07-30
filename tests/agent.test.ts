import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runAgent } from "../lib/agent";

const LIVE_ENV = [
  "RADAR_KEEPER_DATA_DIR",
  "KEEPERHUB_API_KEY",
  "KEEPERHUB_BASE_URL",
  "KEEPERHUB_CHAIN_ID",
  "KEEPERHUB_RECIPIENT_ADDRESS",
  "KEEPERHUB_TRANSFER_AMOUNT",
  "KEEPERHUB_DAILY_CAP",
  "LIVE_EXECUTION_ENABLED",
] as const;

function saveEnvironment(): Map<string, string | undefined> {
  return new Map(LIVE_ENV.map((name) => [name, process.env[name]]));
}

function restoreEnvironment(
  previous: Map<string, string | undefined>,
): void {
  for (const [name, value] of previous) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("dry demo exercises the decision and policy path without credentials", async () => {
  const previous = process.env.RADAR_KEEPER_DATA_DIR;
  process.env.RADAR_KEEPER_DATA_DIR = mkdtempSync(
    join(tmpdir(), "radar-keeper-agent-"),
  );
  try {
    const result = await runAgent({ mode: "dry", signalMode: "demo" });
    assert.equal(result.decision.action, "protect_reserve");
    assert.equal(result.keeperHub.attempted, false);
    assert.equal(result.keeperHub.simulated, true);
    assert.equal(result.keeperHub.executed, false);
    assert.deepEqual(result.auditEvents, [
      "cycle_started",
      "signal_observed",
      "decision_made",
      "local_action_simulated",
    ]);
  } finally {
    if (previous === undefined) {
      delete process.env.RADAR_KEEPER_DATA_DIR;
    } else {
      process.env.RADAR_KEEPER_DATA_DIR = previous;
    }
  }
});

test("live agent recovers a timed-out broadcast and records one verified action", async () => {
  const previousEnvironment = saveEnvironment();
  const previousFetch = globalThis.fetch;
  const dataRoot = mkdtempSync(join(tmpdir(), "radar-keeper-live-"));
  const recipient = "0x1111111111111111111111111111111111111111";
  const transactionHash =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const liveBodies: string[] = [];
  const liveKeys: Array<string | null> = [];
  let liveAttempt = 0;

  process.env.RADAR_KEEPER_DATA_DIR = dataRoot;
  process.env.KEEPERHUB_API_KEY = "kh_test_only";
  process.env.KEEPERHUB_BASE_URL = "https://example.test/api";
  process.env.KEEPERHUB_CHAIN_ID = "11155111";
  process.env.KEEPERHUB_RECIPIENT_ADDRESS = recipient;
  process.env.KEEPERHUB_TRANSFER_AMOUNT = "0.00001";
  process.env.KEEPERHUB_DAILY_CAP = "0.00005";
  process.env.LIVE_EXECUTION_ENABLED = "true";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/chains")) {
      return new Response(
        JSON.stringify([
          {
            chainId: 11155111,
            name: "Ethereum Sepolia",
            isEnabled: true,
            isTestnet: true,
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith("/execute/transfer")) {
      const body = String(init?.body);
      const parsed = JSON.parse(body) as { simulate?: boolean };
      if (parsed.simulate === true) {
        return new Response(
          JSON.stringify({
            success: true,
            status: "simulated",
            wouldRevert: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      liveAttempt += 1;
      liveBodies.push(body);
      liveKeys.push(new Headers(init?.headers).get("idempotency-key"));
      if (liveAttempt === 1) {
        throw new DOMException("operation timed out", "TimeoutError");
      }
      return new Response(
        JSON.stringify({
          executionId: "direct_recovered",
          status: "completed",
        }),
        { status: 202, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith("/execute/direct_recovered/status")) {
      return new Response(
        JSON.stringify({
          executionId: "direct_recovered",
          status: "completed",
          transactionHash,
          transactionLink: `https://sepolia.etherscan.io/tx/${transactionHash}`,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`unexpected test request: ${url}`);
  };

  try {
    const result = await runAgent({ mode: "live", signalMode: "demo" });
    assert.equal(result.keeperHub.executed, true);
    assert.equal(result.keeperHub.executionId, "direct_recovered");
    assert.equal(result.keeperHub.transactionHash, transactionHash);
    assert.equal(liveAttempt, 2);
    assert.equal(liveBodies[0], liveBodies[1]);
    assert.equal(liveKeys[0], liveKeys[1]);
    assert.deepEqual(result.auditEvents, [
      "cycle_started",
      "signal_observed",
      "decision_made",
      "testnet_verified",
      "keeperhub_simulation_passed",
      "action_reserved",
      "keeperhub_execution_recovered",
      "keeperhub_action_executed",
    ]);

    const state = JSON.parse(
      readFileSync(join(dataRoot, "policy.json"), "utf8"),
    ) as {
      spentWei: string;
      actions: Record<string, { status: string; transaction?: string }>;
    };
    const actions = Object.values(state.actions);
    assert.equal(state.spentWei, "10000000000000");
    assert.equal(actions.length, 1);
    assert.equal(actions[0].status, "succeeded");
    assert.match(String(actions[0].transaction), /sepolia\.etherscan\.io/);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnvironment(previousEnvironment);
  }
});
