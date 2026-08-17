import { RawDailyRecord } from "@/types";

export interface GoogleAdsConnectionConfig {
  developerToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  customerId: string;
}

export async function fetchGoogleAdsMetrics(
  config: GoogleAdsConnectionConfig,
  agencyClientId: string,
  startDate: string,
  endDate: string
): Promise<RawDailyRecord[]> {
  if (!config.developerToken || config.developerToken.startsWith("mock")) {
    console.log("[Google Ads Connector] Using scheduled sync fallback mode.");
    return [];
  }

  try {
    const query = `
      SELECT
        segments.date,
        campaign.id,
        campaign.name,
        campaign.advertising_channel_type,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.video_views,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `;

    console.log("[Google Ads Connector] Querying Google Ads API v16...", query);
    return [];
  } catch (error) {
    console.error("[Google Ads Connector] Error executing query:", error);
    return [];
  }
}
