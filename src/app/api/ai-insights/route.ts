import { NextResponse } from "next/server";
import { generateMockRecords } from "@/lib/mock-data";
import { generateStructuredInsight } from "@/lib/ai-analyst";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientId = body.clientId || "client-aura-cosmetics";
    const metricId = body.metricId || "reach";

    const records = generateMockRecords(clientId);
    const insight = generateStructuredInsight(records, metricId);

    return NextResponse.json({
      success: true,
      clientId,
      metricId,
      insight,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate AI diagnostic insight.",
      },
      { status: 500 }
    );
  }
}
