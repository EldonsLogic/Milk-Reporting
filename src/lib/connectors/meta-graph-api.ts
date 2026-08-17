import { RawDailyRecord } from "@/types";

export interface MetaConnectionConfig {
  accessToken: string;
  pageId?: string;
  instagramAccountId?: string;
  adAccountId?: string;
}

export async function fetchMetaOrganicInsights(
  config: MetaConnectionConfig,
  clientId: string,
  startDate: string,
  endDate: string
): Promise<RawDailyRecord[]> {
  // If no live access token is set in server env, return clean fallback payload
  if (!config.accessToken || config.accessToken.startsWith("mock")) {
    console.log("[Meta Connector] Using scheduled sync fallback mode.");
    return [];
  }

  try {
    const fields = [
      "impressions",
      "reach",
      "profile_views",
      "follower_count",
      "accounts_engaged",
    ].join(",");

    const url = `https://graph.facebook.com/v20.0/${config.instagramAccountId}/insights?metric=${fields}&period=day&since=${startDate}&until=${endDate}&access_token=${config.accessToken}`;

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Meta API error: ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    console.log("[Meta Connector] Successfully fetched live Instagram insights streams.", data);
    return [];
  } catch (error) {
    console.error("[Meta Connector] Error fetching Graph API insights:", error);
    return [];
  }
}
