# INTEGRATION AUDIT

**Project:** Milk-Reporting  
**Scope:** Meta (Paid Ads & Organic Social), Google Ads, TikTok Ads  
**Date:** August 17, 2026  

---

## 1. Executive Summary

This document audits the official API capabilities and Airbyte connector coverage across **Meta (Paid & Organic)**, **Google Ads**, and **TikTok Ads**. It details exact supported metrics, dimensions, breakdowns, limitations, and specifies where **Airbyte** handles ingestion versus where **Native API Connectors** are strictly required to guarantee metric completeness.

---

## 2. Meta Platform (Paid & Organic)

### 2.1 Meta Paid Ads (Meta Marketing API v20.0+)
* **Airbyte Connector Status:** **Supported** (`source-facebook-marketing`). High reliability for ad insight streams.
* **Supported Entities:** Ad Accounts, Campaigns, Ad Sets, Ads, Ad Creatives, Custom Conversions.
* **Supported Dimensions:** `account_id`, `campaign_id`, `adset_id`, `ad_id`, `date_start`, `date_stop`, `publisher_platform`, `platform_position`, `impression_device`, `age`, `gender`, `country`, `region`.

#### Metric Inventory
| Metric Category | Metric Name | Metric API Field / Formula | Ingestion Method |
| :--- | :--- | :--- | :--- |
| **Media Delivery** | Spend | `spend` | Airbyte |
| | Impressions | `impressions` | Airbyte |
| | Reach | `reach` | Airbyte |
| | Frequency | `frequency` (or `impressions / reach`) | Airbyte |
| | CPM | `cpm` (or `spend / impressions * 1000`) | Derived |
| **Traffic** | Clicks (All) | `clicks` | Airbyte |
| | Link Clicks | `inline_link_clicks` | Airbyte |
| | CTR (Link) | `inline_link_click_ctr` | Airbyte |
| | CPC (Link) | `cost_per_inline_link_click` | Airbyte |
| | Landing Page Views | `actions:landing_page_view` | Airbyte |
| | Outbound Clicks | `outbound_clicks` | Airbyte |
| **Video** | Video Play Views | `video_play_actions` | Airbyte |
| | 3-Second Video Views | `video_3_sec_views` | Airbyte |
| | ThruPlays | `video_thruplay_watched_actions` | Airbyte |
| | 25% Video Views | `video_p25_watched_actions` | Airbyte |
| | 50% Video Views | `video_p50_watched_actions` | Airbyte |
| | 75% Video Views | `video_p75_watched_actions` | Airbyte |
| | 100% Video Views | `video_p100_watched_actions` | Airbyte |
| | Average Watch Time | `video_avg_time_watched_actions` | Airbyte |
| **Engagement** | Post Engagement | `post_engagement` | Airbyte |
| | Post Reactions | `actions:post_reaction` | Airbyte |
| | Post Comments | `actions:comment` | Airbyte |
| | Post Shares | `actions:post` | Airbyte |
| | Page Likes | `actions:like` | Airbyte |
| **Conversion & Value** | Purchases | `actions:purchase` | Airbyte |
| | Purchase Value (Revenue)| `action_values:purchase` | Airbyte |
| | Leads | `actions:lead` | Airbyte |
| | Cost per Lead (CPA) | `spend / actions:lead` | Derived |
| | ROAS | `action_values:purchase / spend` | Derived |

---

### 2.2 Meta Organic Social (Facebook Pages & Instagram Business)
* **Airbyte Connector Status:** **Partial / Insufficient.** Airbyte `source-instagram` and `source-facebook-pages` have limited support for organic Reels & Stories metrics.
* **Native API Connector Required:** **YES.** A dedicated native connector using Meta Graph API v20.0 (`/v20.0/{page-id}/insights`, `/v20.0/{ig-user-id}/insights`, `/v20.0/{ig-media-id}/insights`) is required.

#### Metric Inventory
| Entity | Metric Name | Graph API Endpoint / Metric Name | Ingestion Method |
| :--- | :--- | :--- | :--- |
| **Facebook Page** | Page Impressions | `page_impressions_unique` | Native Connector |
| | Page Engaged Users | `page_engaged_users` | Native Connector |
| | Page Fans (Followers) | `page_fans` | Native Connector |
| | New Fan Growth | `page_fan_adds` / `page_fan_removes` | Native Connector |
| **FB Posts** | Post Reach | `post_impressions_unique` | Native Connector |
| | Post Engagements | `post_activity_by_type_unique` | Native Connector |
| | Post Reactions/Comments | `reactions.summary(true)`, `comments.summary(true)` | Native Connector |
| **Instagram Account**| Total Followers | `followers_count` | Native Connector |
| | Profile Views | `profile_views` | Native Connector |
| | Accounts Reached | `reach` | Native Connector |
| | Accounts Engaged | `accounts_engaged` | Native Connector |
| **Instagram Posts** | Impressions / Reach | `impressions`, `reach` | Native Connector |
| | Likes / Comments | `like_count`, `comments_count` | Native Connector |
| | Saves / Shares | `saved`, `shares` | Native Connector |
| **Instagram Reels** | Plays (Reel Views) | `plays` | Native Connector |
| | Watch Time | `total_interactions` / `ig_reels_video_view_total_time` | Native Connector |
| | Average Watch Time | `ig_reels_avg_watch_time` | Native Connector |
| | Saves / Shares | `saved`, `shares` | Native Connector |
| **Instagram Stories**| Story Impressions | `impressions` | Native Connector |
| | Story Reach | `reach` | Native Connector |
| | Story Taps Forward/Back| `taps_forward`, `taps_back` | Native Connector |
| | Story Exits / Replies | `exits`, `replies` | Native Connector |

* **Caveat on Instagram Stories:** Meta Graph API only retains Story metrics for 24 hours after publishing (or 30 days if fetched via Business Insights). Scheduled daily ingestion via native connector is critical to capture Story data before expiration.

---

## 3. Google Ads Platform

### 3.1 Google Ads API (v16+)
* **Airbyte Connector Status:** **Supported** (`source-google-ads`).
* **Supported Hierarchy:** Customer Account, Campaign, Ad Group, Ad (Expanded Text, Responsive Search, Video), Keyword, Search Term, Performance Max.
* **Supported Dimensions:** `segments.date`, `segments.device`, `segments.ad_network_type`, `segments.keyword.info.text`, `segments.search_term_match_type`, `segments.geo_target_city`, `segments.geo_target_country`.

#### Metric Inventory
| Category | Metric Name | Google Ads API Field | Ingestion Method |
| :--- | :--- | :--- | :--- |
| **Media Delivery** | Cost (Spend) | `metrics.cost_micros` (/ 1,000,000) | Airbyte |
| | Impressions | `metrics.impressions` | Airbyte |
| | CPM | `(cost_micros / 1000000) / impressions * 1000` | Derived |
| **Traffic** | Clicks | `metrics.clicks` | Airbyte |
| | CTR | `metrics.ctr` | Airbyte |
| | Average CPC | `metrics.average_cpc` (/ 1,000,000) | Airbyte |
| **Video & YouTube** | Video Views | `metrics.video_views` | Airbyte |
| | Video View Rate | `metrics.video_view_rate` | Airbyte |
| | Video Played 25% | `metrics.video_quartile_p25_rate` | Airbyte |
| | Video Played 50% | `metrics.video_quartile_p50_rate` | Airbyte |
| | Video Played 75% | `metrics.video_quartile_p75_rate` | Airbyte |
| | Video Played 100% | `metrics.video_quartile_p100_rate` | Airbyte |
| **Conversion & Value** | Conversions | `metrics.conversions` | Airbyte |
| | Conversion Value (Revenue)| `metrics.conversions_value` | Airbyte |
| | Cost per Conversion (CPA) | `metrics.cost_per_conversion` | Airbyte |
| | Conversion Rate (CVR) | `metrics.conversions_from_interactions_rate` | Airbyte |
| | ROAS | `conversions_value / (cost_micros / 1000000)` | Derived |
| **Search Performance**| Impression Share | `metrics.search_impression_share` | Airbyte |
| | Top Impression Share | `metrics.search_top_impression_share` | Airbyte |

---

## 4. TikTok Ads Platform

### 4.1 TikTok Marketing API (v1.3+)
* **Airbyte Connector Status:** **Supported** (`source-tiktok-marketing`).
* **Supported Hierarchy:** Advertiser Account, Campaign, Ad Group, Ad, Creative.
* **Supported Dimensions:** `stat_time_day`, `advertiser_id`, `campaign_id`, `adgroup_id`, `ad_id`, `country_code`, `placement`, `age`, `gender`.

#### Metric Inventory
| Category | Metric Name | TikTok API Metric Name | Ingestion Method |
| :--- | :--- | :--- | :--- |
| **Media Delivery** | Spend | `spend` | Airbyte |
| | Impressions | `impressions` | Airbyte |
| | Reach | `reach` | Airbyte |
| | Frequency | `frequency` | Airbyte |
| | CPM | `cpm` | Airbyte |
| **Traffic** | Clicks | `clicks` | Airbyte |
| | CTR | `ctr` | Airbyte |
| | CPC | `cpc` | Airbyte |
| **Video** | Video Views | `video_play_actions` | Airbyte |
| | 2-Second Video Views | `video_watched_2s` | Airbyte |
| | 6-Second Video Views | `video_watched_6s` | Airbyte |
| | Average Watch Duration | `average_video_play` | Airbyte |
| | Video Completions | `video_views_p100` | Airbyte |
| | Completion Rate | `video_views_p100 / video_play_actions` | Derived |
| **Engagement** | Profile Visits | `profile_visits` | Airbyte |
| | Likes | `likes` | Airbyte |
| | Comments | `comments` | Airbyte |
| | Shares | `shares` | Airbyte |
| | Follows | `follows` | Airbyte |
| **Conversion & Value** | Conversions | `conversion` | Airbyte |
| | Cost per Conversion | `cost_per_conversion` | Airbyte |
| | Real-Time App Installs | `real_time_app_install` | Airbyte |
| | Total Purchase Value | `total_purchase_value` | Airbyte |
| | ROAS | `total_purchase_value / spend` | Derived |

---

## 5. Ingestion Strategy Summary

```
                      +-----------------------------+
                      |   MARKETING PLATFORMS       |
                      |  Meta Paid | Google | TikTok |
                      +--------------+--------------+
                                     |
                                     v
                        [ AIRBYTE CONNECTOR LAYER ]
                        (Scheduled Daily Sync / ELT)
                                     |
                                     v
                 +---------------------------------------+
                 |       META ORGANIC GRAPH CONNECTOR    |
                 |  (Native TS Connector for FB Pages,   |
                 |   IG Posts, Reels & 24h Stories)      |
                 +-------------------+-------------------+
                                     |
                                     v
                   +-----------------------------------+
                   |     SUPABASE POSTGRESQL DATABASE  |
                   |   - raw_landings (JSONB)          |
                   |   - normalized_reporting_tables   |
                   +-----------------------------------+
```

---

## 6. Gap & Unsupported Feature Analysis

1. **Instagram Story Retention:** Organic Stories expire after 24 hours. The native connector must run daily scheduled batch jobs to snapshot story metrics into `organic_ig_stories`.
2. **Google Ads Keyword Privacy Thresholds:** Search terms with low search volume are masked by Google API for privacy. Null search terms are safely grouped under `[other_low_volume_queries]`.
3. **TikTok Reach Breakdown:** TikTok API limits `reach` breakdowns by demographic dimensions on short date windows. Derived reach handles missing values without breaking dashboard queries.
