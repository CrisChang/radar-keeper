import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import type { AgentMode, SignalMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: AgentMode;
      signalMode?: SignalMode;
    };
    const mode = body.mode ?? "dry";
    const signalMode = body.signalMode ?? "demo";

    if (!["dry", "simulate", "live"].includes(mode)) {
      return NextResponse.json({ error: "invalid mode" }, { status: 400 });
    }
    if (!["demo", "live"].includes(signalMode)) {
      return NextResponse.json(
        { error: "invalid signal mode" },
        { status: 400 },
      );
    }

    return NextResponse.json(await runAgent({ mode, signalMode }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
