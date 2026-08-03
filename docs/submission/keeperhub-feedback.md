# KeeperHub onboarding feedback: ambiguous success after client timeout

## Summary

The Direct Execution API successfully landed a Sepolia transfer, but the
client's 15-second HTTP timeout fired just before the synchronous response
returned. A new builder can easily interpret this as failure and retry with a
new request identifier, creating duplicate execution risk.

## Reproduction

1. Fund an organization KeeperHub wallet on Ethereum Sepolia.
2. Simulate a small native transfer through `POST /api/execute/transfer` with
   `simulate: true`.
3. Send the identical body without `simulate`, with a unique
   `Idempotency-Key`.
4. Use an HTTP client timeout of 15 seconds.
5. Observe that the client may throw `TimeoutError` while the transaction lands
   successfully moments later.

Observed transaction:
<https://sepolia.etherscan.io/tx/0x610782610a42209ff816965eb618e8ec6c5d254f9f763f04f11b19da0cc46b3b>

## Impact on a new builder

- The most obvious retry—starting the agent again—may generate a new key.
- The UI may show a failed action while the chain shows success.
- Local spend accounting and circuit-breaker state can diverge from reality.
- The builder must discover the idempotent replay behavior before proceeding
  safely.

## Suggested onboarding improvements

1. Put an **Interrupted request recovery** box directly beside the first
   transfer example, not only in the idempotency reference.
2. Provide copy-paste retry code that preserves both the serialized request
   body and the `Idempotency-Key`.
3. Document the expected response for an identical replay and for
   `idempotency_in_progress`.
4. Recommend a client timeout longer than the normal synchronous execution
   window, while still treating network interruption as ambiguous.
5. Return or expose a lookup endpoint by idempotency key so a restarted process
   can recover the `executionId` without resending a write request.
6. Add a dashboard search/filter for idempotency key and request ID.
7. Include a small state-machine example: `reserved → submitted → confirmed`
   or `reserved → uncertain → reconciled`.

## Mitigation implemented in Radar Keeper

- Retries only recoverable timeout/network/5xx/429/in-progress responses.
- Reuses the exact serialized request and exact idempotency key.
- Honors `Retry-After` and applies bounded backoff.
- Limits attempts.
- Records a dedicated recovery audit event.
- Blocks every differently keyed transfer while any action is pending or
  uncertain.
- Records spend only after verifiable execution proof exists.

Automated tests cover timeout recovery, in-progress recovery, identical request
bodies, identical keys, single spend accounting and unresolved-action blocking.
