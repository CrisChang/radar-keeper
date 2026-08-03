# Two-minute demo script

Target length: 1:45–2:15. Record at 1440p or 1080p. Keep the browser zoom at
100% and avoid showing `.env.local`, terminals containing secrets or the
KeeperHub API key screen.

## 0:00–0:15 — Problem and promise

**Screen:** Dashboard hero.

**Narration:**

> Most AI agent demos stop after making a decision. Radar Keeper focuses on the
> dangerous last mile: turning a market-risk signal into one safe, observable
> onchain action through KeeperHub.

## 0:15–0:35 — Signal and decision

**Screen:** Click `Run safe demo`; show the Observe and Decide pipeline cards.

**Narration:**

> The agent can use live Coinbase candles or a deterministic demo signal. It
> rejects stale data and only chooses protect-reserve when both the market drop
> and confidence threshold are crossed.

## 0:35–0:58 — Discipline layer

**Screen:** Scroll to the policy panel.

**Narration:**

> Before execution, a hard policy layer requires an enabled testnet, an
> allowlisted recipient, simulation of the exact request, a daily spend cap and
> a closed circuit breaker. Live broadcast is separately locked, so a normal
> demo cannot move funds.

## 0:58–1:25 — Real KeeperHub proof

**Screen:** Show the dark Verified Onchain Execution panel, then open the
Etherscan link in a second tab.

**Narration:**

> This is not a mock. KeeperHub landed a real 0.00001 Sepolia ETH transaction
> in block 11,379,904. The receipt shows the KeeperHub wallet, the allowlisted
> recipient and the successful chain result.

## 1:25–1:48 — Timeout recovery

**Screen:** Return to Dashboard and point at Recovery Proof, then Audit Trail.

**Narration:**

> During the first real execution, the chain confirmed before the HTTP response
> returned. Radar Keeper now retries the identical request with the identical
> idempotency key, recovers the original execution and prevents a duplicate.
> If proof remains uncertain, every new transfer is blocked.

## 1:48–2:05 — Close

**Screen:** Show GitHub README or return to hero.

**Narration:**

> Radar Keeper combines agentic decisions with execution discipline: simulate
> first, spend within policy, recover safely and prove every action. The code,
> automated tests and verified transaction are public on GitHub.

## On-screen captions

1. `Signal → Decision → Guard → KeeperHub`
2. `Testnet · Allowlist · Simulation · Daily cap`
3. `REAL SEPOLIA TRANSACTION`
4. `Same request + same key = no duplicate`
5. `Public code · append-only proof`
