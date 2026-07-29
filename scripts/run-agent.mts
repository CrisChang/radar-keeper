import { runAgent } from "../lib/agent";
import type { AgentMode, SignalMode } from "../lib/types";

const mode = (process.argv[2] ?? "dry") as AgentMode;
const signalMode = (process.argv[3] ?? "demo") as SignalMode;

if (!["dry", "simulate", "live"].includes(mode)) {
  throw new Error("mode must be dry, simulate, or live");
}
if (!["demo", "live"].includes(signalMode)) {
  throw new Error("signal mode must be demo or live");
}

console.dir(await runAgent({ mode, signalMode }), {
  depth: null,
  colors: true,
});
