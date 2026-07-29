import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const raw = await readFile(
      resolve(process.cwd(), ".data/audit.jsonl"),
      "utf8",
    );
    const entries = raw
      .split("\n")
      .filter(Boolean)
      .slice(-30)
      .map((line) => JSON.parse(line) as unknown);
    return NextResponse.json({ entries });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ entries: [] });
    }
    return NextResponse.json(
      { error: "failed to read audit trail" },
      { status: 500 },
    );
  }
}
