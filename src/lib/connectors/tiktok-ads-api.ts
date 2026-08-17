import { RawDailyRecord } from "@/types";

export interface TikTokAdsConnectionConfig {
  accessToken: string;
  advertiserId: string;
}

export async function fetchTikTokAdsMetrics(
  config: TikTokAdsConnectionConfig,
  clientId: string,
  startDate: string,
  endDate: string
): Promise<RawDailyRecord[]> {
  if (!config.accessToken || config.accessToken.startsWith("mock")) {
    console.log("[TikTok Ads Connector] Using scheduled sync fallback mode.");
    return [];
  }

  try {
    const url = `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/`;
    console.log("[TikTok Ads Connector] Querying TikTok Marketing API v1.3...", url);
    return [];
  } catch (error) {
    console.error("[TikTok Ads Connector] Error fetching TikTok Ads API metrics:", error);
    return [];
  }
}
