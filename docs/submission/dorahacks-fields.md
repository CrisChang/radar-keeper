# DoraHacks fields — ready to paste

## Profile

### BUIDL (project) name

`Radar Keeper`

### BUIDL logo

Upload `public/radar-keeper-logo.png`.

- PNG
- 480 × 480 px
- below 2 MB

### Vision

Radar Keeper makes autonomous onchain agents safer by turning market-risk
signals into policy-constrained, simulated, idempotent and fully auditable
transactions through KeeperHub.

### Category

`Crypto / Web3`

### Is this BUIDL an AI Agent?

`Yes`

### GitHub / GitLab / Bitbucket

<https://github.com/CrisChang/radar-keeper>

### Project website (optional)

Leave blank until the dashboard has a public deployment URL. Do not use a
localhost address.

### Demo video

Paste the Unlisted YouTube URL after uploading the generated demo video.

### Social link

<https://x.com/ZzRFqZLZwaFITuW>

## Details

### Tagline

`Autonomous market-risk detection with reliable onchain execution.`

### Short description

Radar Keeper detects high-confidence market risk, applies hard execution
policies, simulates the exact action and delegates one verified testnet
transaction to KeeperHub—with duplicate protection and an append-only audit
trail.

### Full project description

Most agent demos stop when the model decides what to do. Radar Keeper focuses
on the dangerous last mile: turning an agent decision into an onchain action
that is constrained, observable and safe to recover when infrastructure is
slow.

The agent observes a deterministic demo signal or live Coinbase market data,
scores the movement and only chooses `protect_reserve` when both the drawdown
and confidence thresholds are met. Before touching KeeperHub, a local policy
engine enforces an allowlisted recipient, an enabled testnet, a daily spend
cap, a circuit breaker and one-action-at-a-time semantics.

Radar Keeper sends the exact proposed transaction to KeeperHub in simulation
mode first. It only broadcasts after simulation succeeds and live execution is
explicitly unlocked. Every broadcast carries a client-generated idempotency
key. If the HTTP client times out while KeeperHub is still processing, the
agent retries the identical body with the identical key and recovers the
original execution instead of creating another transaction. Any unresolved
action blocks differently keyed transfers until a human reconciles it.

The complete path has landed a real `0.00001 Sepolia ETH` transaction through
KeeperHub in block `11379904`. The public dashboard presents the signal,
decision, policy checks, simulation state, transaction receipt and append-only
audit evidence.

### Problem

AI agents can make useful decisions, but naive onchain execution introduces
duplicate transfers, unsafe destinations, unbounded spend, silent failures and
ambiguous timeout states. A polished agent interface is not enough when its
transaction layer cannot prove what happened.

### Solution

Radar Keeper wraps an agentic market-risk decision in a deterministic safety
layer and delegates execution to KeeperHub. Simulation, allowlists, daily caps,
idempotency, timeout recovery, circuit breakers and audit evidence are part of
the product rather than afterthoughts.

### How the agent works

1. Observe a live or deterministic ETH-USD market signal.
2. Reject stale data and gate action on drop magnitude and confidence.
3. Enforce testnet, recipient, value-cap and circuit-breaker policies.
4. Ask KeeperHub to simulate the exact transfer.
5. Broadcast once with an idempotency key.
6. Poll for authoritative execution proof.
7. Recover interrupted requests with the same body and key.
8. Record the decision, policy result and transaction proof in an append-only
   audit trail.

### KeeperHub integration

Radar Keeper uses the KeeperHub Direct Execution API with an organization
`kh_` key. It reads the live chain registry, requires `isEnabled` and
`isTestnet`, calls `/execute/transfer` with `simulate: true`, then removes the
simulation flag and broadcasts with `Idempotency-Key`. The returned execution
is polled until a transaction hash/link is available. Interrupted broadcasts
are recovered by replaying the identical request with the identical key, as
defined by KeeperHub's 24-hour idempotency window.

### Tech stack

- Next.js 16 and React 19
- TypeScript and Node.js 22
- KeeperHub Direct Execution API
- Ethereum Sepolia
- Coinbase Exchange public candle feed
- Local append-only JSONL audit trail
- Node test runner with mocked KeeperHub integration tests

### Safety and reliability features

- Testnet-only execution
- Strict allowlisted recipient
- Simulation before every broadcast
- Explicit live-execution lock
- Deterministic idempotency key per action
- Same-body/same-key timeout recovery
- Unresolved-action interlock
- Daily spend cap
- Consecutive-failure circuit breaker
- Append-only decision and execution evidence
- Server-only credentials excluded from Git

### What was built during the hackathon

The complete Radar Keeper application, market-signal pipeline, decision engine,
policy layer, KeeperHub client, timeout recovery logic, audit trail, dashboard,
automated tests and verified Sepolia execution were built for KeeperHub Agents
Onchain.

### Innovation

Radar Keeper treats ambiguous execution as a first-class agent state. The
observed real-world failure was not a reverted transaction—the transaction
landed while the client timed out. The agent now recovers the original
execution through KeeperHub idempotency and blocks new actions whenever proof
cannot be recovered. That makes reliability visible and demonstrable.

### Target users

- Autonomous treasury and reserve-management agents
- DeFi risk-response bots
- Protocol operations teams
- Agent builders that need safe execution primitives
- Developers evaluating KeeperHub's Direct Execution API

### Current status

Working MVP. Unit tests, integration-style recovery tests, type checking,
production build, KeeperHub simulation and a real Sepolia execution all pass.

### Roadmap

1. Deploy the dashboard with durable managed audit storage.
2. Add signed webhooks and execution-status streaming.
3. Support token transfers and configurable response workflows.
4. Add multi-signal consensus and human approval thresholds.
5. Extend policy storage to a transactional database for multi-worker use.

## Team

### Team size

`1`

### Team member

`Chang Chris — Project lead and full-stack builder`

## Contact

Use the email attached to the DoraHacks account. Do not put a private email in
the public repository merely to satisfy this document.

## Submission

### Primary submission

`KeeperHub Agents Onchain — main prize`

### Additional bounty

`Best improvement to the new-builder onboarding experience`

Attach or paste the reproducible feedback in `keeperhub-feedback.md`.

### Onchain proof

- Network: Ethereum Sepolia
- Chain ID: `11155111`
- Amount: `0.00001 ETH`
- Block: `11379904`
- Transaction:
  <https://sepolia.etherscan.io/tx/0x610782610a42209ff816965eb618e8ec6c5d254f9f763f04f11b19da0cc46b3b>

### Repository

<https://github.com/CrisChang/radar-keeper>

### How to test

```bash
npm install
npm test
npm run typecheck
npm run build
npm run agent:dry
npm run dev
```

Open <http://localhost:3000>. `Run safe demo` requires no credentials. To test
KeeperHub without broadcasting, copy `.env.example` to `.env.local`, provide an
organization API key and an allowlisted Sepolia address, keep
`LIVE_EXECUTION_ENABLED=false`, and run `npm run agent:simulate`.
