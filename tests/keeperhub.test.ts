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

test("timed-out live request recovers with the same body and idempotency key", async () => {
  const calls: Array<{ body: string; key: string | null }> = [];
  let attempt = 0;
  const fakeFetch: typeof fetch = async (_input, init) => {
    attempt += 1;
    calls.push({
      body: String(init?.body),
      key: new Headers(init?.headers).get("idempotency-key"),
    });
    if (attempt === 1) {
      throw new DOMException("request timed out", "TimeoutError");
    }
    return new Response(
      JSON.stringify({ executionId: "direct_recovered", status: "completed" }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  };
  const client = new KeeperHubClient(
    "kh_test_only",
    "https://example.test/api",
    fakeFetch,
    {
      executionAttempts: 2,
      recoveryDelayMs: 0,
      sleep: async () => {},
    },
  );
  const result = await client.executeTransfer(
    {
      chainId: 11155111,
      recipientAddress: "0x1111111111111111111111111111111111111111",
      amount: "0.00001",
    },
    "radar-keeper-timeout-key",
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].key, "radar-keeper-timeout-key");
  assert.equal(calls[1].key, "radar-keeper-timeout-key");
  assert.equal(result.executionId, "direct_recovered");
  assert.equal(result.recoveryAttempts, 1);
  assert.match(String(result.recoveredFrom), /timed out/);
});

test("idempotency-in-progress response is retried without changing the key", async () => {
  const keys: Array<string | null> = [];
  const delays: number[] = [];
  let attempt = 0;
  const fakeFetch: typeof fetch = async (_input, init) => {
    attempt += 1;
    keys.push(new Headers(init?.headers).get("idempotency-key"));
    if (attempt === 1) {
      return new Response(
        JSON.stringify({
          code: "idempotency_in_progress",
          error: "Original request is still running",
        }),
        {
          status: 409,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({ executionId: "direct_original", status: "completed" }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  };
  const client = new KeeperHubClient(
    "kh_test_only",
    "https://example.test/api",
    fakeFetch,
    {
      executionAttempts: 2,
      recoveryDelayMs: 25,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    },
  );
  const result = await client.executeTransfer(
    {
      chainId: 11155111,
      recipientAddress: "0x1111111111111111111111111111111111111111",
      amount: "0.00001",
    },
    "radar-keeper-progress-key",
  );

  assert.deepEqual(keys, [
    "radar-keeper-progress-key",
    "radar-keeper-progress-key",
  ]);
  assert.deepEqual(delays, [25]);
  assert.equal(result.executionId, "direct_original");
  assert.equal(result.recoveryAttempts, 1);
});
