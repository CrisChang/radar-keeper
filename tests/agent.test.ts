import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runAgent } from "../lib/agent";

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
