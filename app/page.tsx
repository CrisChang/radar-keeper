"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type {
  AgentMode,
  AgentRunResult,
  SignalMode,
} from "@/lib/types";

interface Health {
  status: string;
  keeperHubConfigured: boolean;
  liveExecutionEnabled: boolean;
  chainId: number;
}

interface AuditEntry {
  timestamp?: string;
  event?: string;
  [key: string]: unknown;
}

function short(value: string | undefined): string {
  if (!value) return "—";
  return value.length > 28
    ? `${value.slice(0, 14)}…${value.slice(-10)}`
    : value;
}

export default function Home() {
  const [health, setHealth] = useState<Health>();
  const [result, setResult] = useState<AgentRunResult>();
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [signalMode, setSignalMode] = useState<SignalMode>("demo");
  const [running, setRunning] = useState<AgentMode>();
  const [error, setError] = useState<string>();

  async function refreshAudit() {
    const response = await fetch("/api/audit", { cache: "no-store" });
    if (response.ok) {
      const body = (await response.json()) as { entries: AuditEntry[] };
      setAudit(body.entries);
    }
  }

  useEffect(() => {
    void fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: Health) => setHealth(body));
    void refreshAudit();
  }, []);

  async function run(mode: AgentMode) {
    if (
      mode === "live" &&
      !window.confirm(
        "Broadcast one allowlisted testnet transfer through KeeperHub?",
      )
    ) {
      return;
    }

    setRunning(mode);
    setError(undefined);
    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, signalMode }),
      });
      const body = (await response.json()) as
        | AgentRunResult
        | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error(
          "error" in body ? body.error : `HTTP ${response.status}`,
        );
      }
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(undefined);
      await refreshAudit();
    }
  }

  const pipeline = [
    {
      index: "01",
      label: "Observe",
      detail: result
        ? `${result.signal.symbol} · ${result.signal.magnitudeBps} bps`
        : "Live or deterministic market signal",
      active: Boolean(result),
    },
    {
      index: "02",
      label: "Decide",
      detail: result
        ? result.decision.action.replaceAll("_", " ")
        : "Confidence-gated risk decision",
      active: Boolean(result),
    },
    {
      index: "03",
      label: "Guard",
      detail: result
        ? `${result.policy.transferAmount} / ${result.policy.dailyCap} ETH cap`
        : "Cap, allowlist, circuit breaker",
      active: Boolean(result?.policy.allowed),
    },
    {
      index: "04",
      label: "Execute",
      detail: result?.keeperHub.executed
        ? "KeeperHub transaction verified"
        : result?.keeperHub.simulated
          ? "Simulation passed"
          : "Awaiting safe action",
      active: Boolean(result?.keeperHub.simulated),
    },
  ];

  return (
    <main>
      <header className="nav">
        <a className="brand" href="#top" aria-label="Radar Keeper home">
          <Image
            src="/radar-keeper-logo.png"
            alt=""
            width={44}
            height={44}
            priority
          />
          <span>RADAR KEEPER</span>
        </a>
        <div className="navStatus">
          <span
            className={`statusDot ${
              health?.keeperHubConfigured ? "online" : ""
            }`}
          />
          {health?.keeperHubConfigured
            ? `KeeperHub ready · chain ${health.chainId}`
            : "Local demo ready"}
        </div>
      </header>

      <section id="top" className="hero">
        <div className="eyebrow">AUTONOMOUS RISK RESPONSE</div>
        <h1>
          From market signal
          <br />
          to <span>safe onchain action.</span>
        </h1>
        <p className="lede">
          Radar Keeper detects high-confidence market risk, enforces hard
          execution policies, and delegates verified testnet transactions to
          KeeperHub.
        </p>

        <div className="modeRow">
          <span>Signal</span>
          <button
            className={signalMode === "demo" ? "selected" : ""}
            onClick={() => setSignalMode("demo")}
          >
            Demo drop
          </button>
          <button
            className={signalMode === "live" ? "selected" : ""}
            onClick={() => setSignalMode("live")}
          >
            Live market
          </button>
        </div>

        <div className="actions">
          <button
            className="primary"
            disabled={Boolean(running)}
            onClick={() => void run("dry")}
          >
            {running === "dry" ? "Running…" : "Run safe demo"}
          </button>
          <button
            disabled={Boolean(running) || !health?.keeperHubConfigured}
            onClick={() => void run("simulate")}
          >
            {running === "simulate"
              ? "Simulating…"
              : "Simulate with KeeperHub"}
          </button>
          <button
            className="live"
            disabled={
              Boolean(running) ||
              !health?.keeperHubConfigured ||
              !health.liveExecutionEnabled
            }
            onClick={() => void run("live")}
          >
            {running === "live" ? "Executing…" : "Execute testnet action"}
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </section>

      <section className="pipeline" aria-label="Agent execution pipeline">
        {pipeline.map((step, index) => (
          <div className={`step ${step.active ? "active" : ""}`} key={step.index}>
            <div className="stepTop">
              <span>{step.index}</span>
              {step.active ? <strong>✓</strong> : null}
            </div>
            <h2>{step.label}</h2>
            <p>{step.detail}</p>
            {index < pipeline.length - 1 ? (
              <div className="connector" aria-hidden="true" />
            ) : null}
          </div>
        ))}
      </section>

      <section className="grid">
        <article className="panel decisionPanel">
          <div className="panelHead">
            <div>
              <span className="kicker">LATEST AGENT DECISION</span>
              <h2>
                {result
                  ? result.decision.action.replaceAll("_", " ")
                  : "Waiting for a cycle"}
              </h2>
            </div>
            <div
              className={`decisionBadge ${
                result?.decision.action === "protect_reserve" ? "protect" : ""
              }`}
            >
              {result ? Math.round(result.signal.confidence * 100) : 0}%
              <small>confidence</small>
            </div>
          </div>

          <p className="reason">
            {result?.decision.reason ??
              "Run the local demo to exercise the entire policy path without sending a transaction."}
          </p>

          <div className="metrics">
            <div>
              <span>Signal</span>
              <strong>{result?.signal.type.replaceAll("_", " ") ?? "—"}</strong>
            </div>
            <div>
              <span>Movement</span>
              <strong>{result ? `${result.signal.magnitudeBps} bps` : "—"}</strong>
            </div>
            <div>
              <span>Execution</span>
              <strong>
                {result?.keeperHub.executed
                  ? "verified"
                  : result?.keeperHub.simulated
                    ? "simulated"
                    : "none"}
              </strong>
            </div>
          </div>

          {result?.keeperHub.transactionLink ? (
            <a
              className="txLink"
              href={result.keeperHub.transactionLink}
              target="_blank"
              rel="noreferrer"
            >
              View onchain proof ↗
            </a>
          ) : null}
        </article>

        <article className="panel policyPanel">
          <span className="kicker">DISCIPLINE LAYER</span>
          <h2>Execution policy</h2>
          <ul>
            <li>
              <span>Testnet only</span>
              <strong>ENFORCED</strong>
            </li>
            <li>
              <span>Recipient allowlist</span>
              <strong>ENFORCED</strong>
            </li>
            <li>
              <span>Simulation first</span>
              <strong>ENFORCED</strong>
            </li>
            <li>
              <span>Idempotent broadcast</span>
              <strong>24H SAFE</strong>
            </li>
            <li>
              <span>Daily value cap</span>
              <strong>{result?.policy.dailyCap ?? "0.00005"} ETH</strong>
            </li>
          </ul>
          <div className="key">
            <span>Idempotency key</span>
            <code>{short(result?.policy.idempotencyKey)}</code>
          </div>
        </article>
      </section>

      <section className="auditPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">APPEND-ONLY EVIDENCE</span>
            <h2>Audit trail</h2>
          </div>
          <span className="eventCount">{audit.length} recent events</span>
        </div>
        <div className="auditList">
          {audit.length === 0 ? (
            <p className="empty">No cycles recorded yet.</p>
          ) : (
            audit
              .slice()
              .reverse()
              .map((entry, index) => (
                <div className="auditRow" key={`${entry.timestamp}-${index}`}>
                  <time>
                    {entry.timestamp
                      ? new Date(entry.timestamp).toLocaleTimeString()
                      : "—"}
                  </time>
                  <strong>{entry.event?.replaceAll("_", " ")}</strong>
                  <code>
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.entries(entry).filter(
                          ([key]) => !["timestamp", "event"].includes(key),
                        ),
                      ),
                    )}
                  </code>
                </div>
              ))
          )}
        </div>
      </section>

      <footer>
        <span>RADAR KEEPER</span>
        <p>Built for KeeperHub Agents Onchain · testnet-first by design</p>
      </footer>
    </main>
  );
}
