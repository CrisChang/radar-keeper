import assert from "node:assert/strict";
import test from "node:test";
import { KeeperHubClient } from "../lib/keeperhub";

test("KeeperHub transfer is simulated before any broadcast helper is used", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        success: true,
        status: "simulated",
        wouldRevert: false,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new KeeperHubClient(
    "kh_test_only",
    "https://example.test/api",
    fakeFetch,
  );
  await client.simulateTransfer({
    chainId: 11155111,
    recipientAddress: "0x1111111111111111111111111111111111111111",
    amount: "0.00001",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.test/api/execute/transfer");
  assert.equal(
    JSON.parse(String(calls[0].init?.body)).simulate,
    true,
  );
  assert.match(
    String(new Headers(calls[0].init?.headers).get("authorization")),
    /^Bearer kh_/,
  );
});

test("live helper sends an idempotency key", async () => {
  let capturedHeaders = new Headers();
  const fakeFetch: typeof fetch = async (_input, init) => {
    capturedHeaders = new Headers(init?.headers);
    return new Response(
      JSON.stringify({ executionId: "direct_123", status: "completed" }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  };
  const client = new KeeperHubClient(
    "kh_test_only",
    "https://example.test/api",
    fakeFetch,
  );
  await client.executeTransfer(
    {
      chainId: 11155111,
      recipientAddress: "0x1111111111111111111111111111111111111111",
      amount: "0.00001",
    },
    "radar-keeper-test-key",
  );
  assert.equal(
    capturedHeaders.get("idempotency-key"),
    "radar-keeper-test-key",
  );
});
