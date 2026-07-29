import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "../lib/decision";
import { buildDemoSignal } from "../lib/signals";

test("high-confidence sharp drop triggers reserve protection", () => {
  const result = decide(buildDemoSignal(new Date("2026-07-29T12:00:00Z")), {
    minDropBps: 150,
    minConfidence: 0.9,
  });
  assert.equal(result.action, "protect_reserve");
});

test("stale signals always hold", () => {
  const signal = {
    ...buildDemoSignal(new Date("2026-07-29T12:00:00Z")),
    feedStatus: "stale" as const,
  };
  assert.equal(decide(signal).action, "hold");
});
