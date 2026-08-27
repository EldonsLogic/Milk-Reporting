import { RawDailyRecord, MetricCategory } from "@/types";
import { queryWidgetData } from "@/lib/query-engine";

export interface AIInsightOutput {
  fact: string;
  interpretation: string;
  possibleExplanation: string;
  recommendation: string;
}

export function generateStructuredInsight(
  records: RawDailyRecord[],
  metricId: string = "reach"
): AIInsightOutput {
  const queryResult = queryWidgetData(
    records,
    { platform: "all", metricIds: [metricId] },
    { globalDateRange: "last_30_days" }
  )[0];

  if (!queryResult) {
    return {
      fact: "No historical metric data available for evaluation.",
      interpretation: "Insufficient dataset in current date window.",
      possibleExplanation: "Check platform data connection sync state.",
      recommendation: "Ensure daily data sync has completed for this client.",
    };
  }

  const change = queryResult.changePercentage || 0;
  const isPositive = change >= 0;
  const formattedVal = queryResult.formattedValue;
  const metricName = queryResult.displayName;

  if (metricId === "reach" || metricId === "impressions") {
    return {
      fact: `${metricName} total reached ${formattedVal}, reflecting a ${change.toFixed(
        1
      )}% ${isPositive ? "increase" : "decrease"} compared with the previous period.`,
      interpretation: isPositive
        ? "Audience delivery expanded significantly, driven primarily by video and top-of-funnel creative assets."
        : "Audience reach contracted across primary ad sets, indicating potential creative fatigue or CPM shifts.",
      possibleExplanation: isPositive
        ? "Video completion rates and organic shares boosted distribution velocity."
        : "Bidding competition increased in the current period, elevating average CPM.",
      recommendation: isPositive
        ? "Analyze high-performing creative hooks and allocate budget to sustain reach velocity."
        : "Refresh ad creatives and review demographic placement exclusions.",
    };
  }

  if (metricId === "roas" || metricId === "conversion_value") {
    return {
      fact: `${metricName} stands at ${formattedVal} (${change >= 0 ? "+" : ""}${change.toFixed(
        1
      )}% vs previous period).`,
      interpretation: "E-commerce revenue trends correlate with high-intent retargeting and seasonal demand.",
      possibleExplanation: "AOV stability combined with steady checkout conversion rates sustained efficiency.",
      recommendation: "Scale top-performing advantage+ catalog ad sets while monitoring frequency caps.",
    };
  }

  return {
    fact: `${metricName} recorded a current value of ${formattedVal} (${change >= 0 ? "+" : ""}${change.toFixed(
      1
    )}% change).`,
    interpretation: "Performance is consistent with baseline historical trends.",
    possibleExplanation: "Steady engagement patterns across active client channels.",
    recommendation: "Continue scheduled monitoring and maintain client optimization standards.",
  };
}
