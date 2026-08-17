# METRIC CATALOG STRUCTURE

**Project:** Milk-Reporting  
**Date:** August 17, 2026  

---

## 1. Metric Catalog Overview

Milk-Reporting enforces **Metric Governance** via a first-class Metric Catalog.
Every metric available in the platform—whether raw or derived—is declared with explicit metadata, data types, categories, safe formulas, supported dimensions, and caveats.

---

## 2. Metric Catalog Metadata Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MetricCatalogEntry",
  "type": "object",
  "properties": {
    "id": { "type": "string", "example": "meta_paid_reach" },
    "displayName": { "type": "string", "example": "Reach" },
    "platform": { 
      "type": "string", 
      "enum": ["meta", "google_ads", "tiktok_ads", "facebook_page", "instagram", "cross_platform"] 
    },
    "category": { 
      "type": "string", 
      "enum": [
        "Media Delivery", 
        "Traffic", 
        "Video", 
        "Engagement", 
        "Social Audience", 
        "Content", 
        "Conversion", 
        "Value"
      ] 
    },
    "dataType": { 
      "type": "string", 
      "enum": ["integer", "currency", "percentage", "duration_seconds", "ratio"] 
    },
    "isDerived": { "type": "boolean" },
    "sourceField": { "type": ["string", "null"] },
    "formula": { "type": ["string", "null"] },
    "supportedDimensions": {
      "type": "array",
      "items": { "type": "string" }
    },
    "description": { "type": "string" },
    "caveats": { "type": "string" }
  },
  "required": ["id", "displayName", "platform", "category", "dataType", "isDerived"]
}
```

---

## 3. Safe Formula Evaluation Engine Rules

All derived metric calculations must strictly enforce zero-division guards and handle NULL values safely:

1. **Click-Through Rate (CTR %):**
   ```sql
   CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 ELSE 0 END
   ```
2. **Cost Per Click (CPC):**
   ```sql
   CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END
   ```
3. **Cost Per Thousand Impressions (CPM):**
   ```sql
   CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END
   ```
4. **Return on Ad Spend (ROAS):**
   ```sql
   CASE WHEN SUM(spend) > 0 THEN SUM(conversion_value) / SUM(spend) ELSE 0 END
   ```
5. **Cost Per Acquisition (CPA):**
   ```sql
   CASE WHEN SUM(conversions) > 0 THEN SUM(spend) / SUM(conversions) ELSE 0 END
   ```
6. **Video Completion Rate (%):**
   ```sql
   CASE WHEN SUM(video_views) > 0 THEN (SUM(video_completions)::numeric / SUM(video_views)) * 100 ELSE 0 END
   ```
7. **Engagement Rate (%):**
   ```sql
   CASE WHEN SUM(reach) > 0 THEN (SUM(post_engagements)::numeric / SUM(reach)) * 100 ELSE 0 END
   ```

---

## 4. Initial Catalog Metric Inventory (8 Categories)

### Category 1: Media Delivery
* `spend`: Spend (Currency) | Platform: All | Raw field: `spend` / `cost_micros`
* `impressions`: Impressions (Integer) | Platform: All | Raw field: `impressions`
* `reach`: Reach (Integer) | Platform: Meta, TikTok, Organic | Raw field: `reach`
* `frequency`: Frequency (Ratio) | Platform: Meta, TikTok | Derived: `impressions / NULLIF(reach, 0)`
* `cpm`: CPM (Currency) | Platform: All | Derived: `(spend / NULLIF(impressions, 0)) * 1000`

### Category 2: Traffic
* `clicks`: Clicks (Integer) | Platform: All | Raw field: `clicks`
* `link_clicks`: Link Clicks (Integer) | Platform: Meta, TikTok | Raw field: `inline_link_clicks`
* `ctr`: Click-Through Rate (%) | Platform: All | Derived: `(clicks / NULLIF(impressions, 0)) * 100`
* `cpc`: Cost Per Click (Currency) | Platform: All | Derived: `spend / NULLIF(clicks, 0)`
* `landing_page_views`: Landing Page Views (Integer) | Platform: Meta | Raw field: `landing_page_views`

### Category 3: Video
* `video_views`: Video Views (Integer) | Platform: All | Raw field: `video_views` / `video_play_actions`
* `video_3s_views`: 3-Second Video Views (Integer) | Platform: Meta, TikTok | Raw field: `video_3s_views`
* `thruplays`: ThruPlays (Integer) | Platform: Meta | Raw field: `thruplays`
* `video_completions`: Video Completions (100%) (Integer) | Platform: All | Raw field: `video_completions`
* `video_completion_rate`: Completion Rate (%) | Platform: All | Derived: `(video_completions / NULLIF(video_views, 0)) * 100`
* `video_avg_watch_time`: Average Watch Time (Duration) | Platform: All | Raw field: `video_avg_watch_time`

### Category 4: Engagement
* `likes`: Likes / Reactions (Integer) | Platform: All | Raw field: `likes`
* `comments`: Comments (Integer) | Platform: All | Raw field: `comments`
* `shares`: Shares (Integer) | Platform: Meta, TikTok, Organic | Raw field: `shares`
* `saves`: Saves (Integer) | Platform: Instagram, TikTok | Raw field: `saves`
* `post_engagements`: Total Engagements (Integer) | Platform: All | Derived: `likes + comments + shares + saves`
* `engagement_rate`: Engagement Rate (%) | Platform: All | Derived: `(post_engagements / NULLIF(reach, 0)) * 100`

### Category 5: Social Audience
* `total_followers`: Total Followers (Integer) | Platform: Organic FB / IG, TikTok | Raw field: `total_followers`
* `followers_gained`: Followers Gained (Integer) | Platform: Organic FB / IG | Raw field: `followers_gained`
* `followers_lost`: Followers Lost (Integer) | Platform: Organic FB / IG | Raw field: `followers_lost`
* `net_follower_growth`: Net Follower Growth (Integer) | Platform: Organic | Derived: `followers_gained - followers_lost`
* `profile_visits`: Profile Visits (Integer) | Platform: Instagram, TikTok | Raw field: `profile_visits`

### Category 6: Content Performance
* `post_reach`: Post Reach (Integer) | Platform: FB Pages, IG Posts | Raw field: `post_reach`
* `reel_views`: Reel Views (Integer) | Platform: Instagram Reels | Raw field: `reel_views`
* `story_views`: Story Views (Integer) | Platform: Instagram Stories | Raw field: `story_views`
* `story_taps_forward`: Story Taps Forward (Integer) | Platform: Instagram Stories | Raw field: `taps_forward`
* `story_exits`: Story Exits (Integer) | Platform: Instagram Stories | Raw field: `exits`

### Category 7: Conversion
* `conversions`: Total Conversions (Integer) | Platform: All | Raw field: `conversions`
* `leads`: Leads (Integer) | Platform: All | Raw field: `leads`
* `purchases`: Purchases (Integer) | Platform: All | Raw field: `purchases`
* `cpa`: Cost Per Acquisition (Currency) | Platform: All | Derived: `spend / NULLIF(conversions, 0)`
* `conversion_rate`: Conversion Rate (%) | Platform: All | Derived: `(conversions / NULLIF(clicks, 0)) * 100`

### Category 8: Value (Optional - Non-Mandatory)
* `conversion_value`: Purchase Value / Revenue (Currency) | Platform: All | Raw field: `conversion_value`
* `roas`: Return on Ad Spend (Ratio) | Platform: Paid Ads | Derived: `conversion_value / NULLIF(spend, 0)`
* `value_per_conversion`: Value Per Conversion (Currency) | Platform: Paid Ads | Derived: `conversion_value / NULLIF(conversions, 0)`
