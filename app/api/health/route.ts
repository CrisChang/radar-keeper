import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const chainId = Number(process.env.KEEPERHUB_CHAIN_ID ?? "11155111");
  return NextResponse.json({
    status: "ok",
    keeperHubConfigured:
      process.env.KEEPERHUB_API_KEY?.startsWith("kh_") === true &&
      /^0x[a-fA-F0-9]{40}$/.test(
        process.env.KEEPERHUB_RECIPIENT_ADDRESS ?? "",
      ),
    liveExecutionEnabled: process.env.LIVE_EXECUTION_ENABLED === "true",
    chainId,
  });
}
