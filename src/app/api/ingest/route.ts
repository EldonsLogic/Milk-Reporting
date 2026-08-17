import { NextResponse } from "next/server";
import { MOCK_CLIENTS } from "@/lib/mock-data";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientId = body.clientId;

    console.log(`[Scheduled Ingestion API] Triggering daily sync for client: ${clientId || "ALL"}`);

    const syncResults = MOCK_CLIENTS.map((client) => {
      return {
        clientId: client.id,
        clientName: client.name,
        syncedPlatforms: client.connectedPlatforms.map((p) => p.platform),
        recordsSynced: Math.floor(Math.random() * 50) + 10,
        status: "success",
        syncedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      message: "Daily data sync completed successfully.",
      syncedAt: new Date().toISOString(),
      details: syncResults,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to execute daily ingestion process.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    lastGlobalSync: "2026-08-17T06:00:00Z",
    syncFrequency: "daily",
    connectors: ["airbyte", "meta_graph_api_native", "google_ads_v16", "tiktok_marketing_v1.3"],
  });
}
