import "server-only";
import crypto from "crypto";

/**
 * Google Analytics 4 client.
 *
 * Auth deliberately mirrors the Meta System User token model rather than
 * per-client OAuth: one Google Cloud *service account* belonging to the
 * agency, added as a Viewer on each client's GA4 property. That means no
 * consent screen, no app verification, no refresh-token rotation, and no
 * re-authorising every 90 days - the same reason the Meta side uses a
 * System User token. The trade-off is that a client has to grant the
 * agency's service account access to their property, which is one
 * "add this email as a Viewer" step per property, done once.
 *
 * Two Google APIs are used:
 *   - Admin API  (analyticsadmin.googleapis.com)  - list properties
 *   - Data API   (analyticsdata.googleapis.com)   - runReport
 * Both are covered by the single analytics.readonly scope.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";

// runReport caps a single response; anything larger has to be paged with
// offset. Channel x device x day is small, but a year-long backfill on a
// busy site still crosses the default 10,000-row response limit.
const REPORT_PAGE_SIZE = 100_000;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function serviceAccountCredentials(): { email: string; privateKey: string } {
  const email = process.env.GA_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GA_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "Google Analytics is not configured. Set GA_SERVICE_ACCOUNT_EMAIL and GA_PRIVATE_KEY from the service account's JSON key."
    );
  }
  // Env vars cannot hold real newlines on most hosts (Vercel included), so
  // the PEM is stored with literal \n and unescaped here.
  return { email, privateKey: rawKey.replace(/\\n/g, "\n") };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Signs a JWT with the service account key and exchanges it for an access
 * token. Tokens last an hour; this caches until 60s before expiry so a
 * multi-connection sync run does one exchange rather than one per call.
 */
async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const { email, privateKey } = serviceAccountCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const signingInput = `${header}.${claims}`;

  let signature: string;
  try {
    signature = base64url(crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKey));
  } catch {
    throw new Error(
      "GA_PRIVATE_KEY is not a valid private key. Copy the whole private_key value from the service account JSON, including the BEGIN/END lines."
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${signature}`,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google rejected the service account: ${json.error_description || json.error || res.statusText}`
    );
  }

  tokenCache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return tokenCache.token;
}

/**
 * Google's errors are structured but the useful part is buried; surfacing
 * the real message matters because the two failures an agency will actually
 * hit ("API not enabled", "caller does not have permission") are both
 * self-service fixes and both invisible if the error is swallowed.
 */
async function googleFetch(url: string, init?: RequestInit): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || res.statusText;
    if (res.status === 403 && /has not been used|is disabled/i.test(message)) {
      throw new Error(
        `${message} (Enable the Google Analytics Data API and Admin API in the Google Cloud project that owns this service account.)`
      );
    }
    if (res.status === 403) {
      throw new Error(
        `${message} (Add ${process.env.GA_SERVICE_ACCOUNT_EMAIL} as a Viewer under GA4 Admin > Property access management.)`
      );
    }
    throw new Error(message);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Discovery - powers the "Add Source" property picker
// ---------------------------------------------------------------------------

export interface Ga4Property {
  /** numeric id, no "properties/" prefix - what gets stored as external_account_id */
  id: string;
  name: string;
  accountName: string;
}

/**
 * Every GA4 property the service account has been granted access to, across
 * every Google Analytics account. Nothing shows up here until someone adds
 * the service account's email to the property, so an empty list is the
 * expected first-run state, not an error.
 */
export async function discoverGa4Properties(): Promise<Ga4Property[]> {
  const properties: Ga4Property[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: "200" });
    if (pageToken) params.set("pageToken", pageToken);
    const json = await googleFetch(`${ADMIN_BASE}/accountSummaries?${params}`);

    for (const account of json.accountSummaries || []) {
      for (const summary of account.propertySummaries || []) {
        properties.push({
          id: String(summary.property || "").replace("properties/", ""),
          name: summary.displayName || summary.property,
          accountName: account.displayName || "",
        });
      }
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return properties.sort((a, b) => a.name.localeCompare(b.name));
}

/** The property's reporting currency, so revenue isn't formatted as dollars by default. */
export async function fetchGa4PropertyCurrency(propertyId: string): Promise<string | null> {
  try {
    const json = await googleFetch(`${ADMIN_BASE}/properties/${propertyId}`);
    return json.currencyCode || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface Ga4DailyRow {
  date: string; // yyyy-mm-dd
  channelGroup: string;
  deviceCategory: string;
  sessions: number;
  engagedSessions: number;
  totalUsers: number;
  newUsers: number;
  screenPageViews: number;
  userEngagementDuration: number;
  keyEvents: number;
  transactions: number;
  totalRevenue: number;
}

const DIMENSIONS = ["date", "sessionDefaultChannelGroup", "deviceCategory"];

// GA4 renamed "conversions" to "keyEvents" in 2024. Both names are live
// depending on how the property was migrated, so the primary name is tried
// first and the legacy one is used as a fallback - rather than guessing,
// which would silently zero out conversions on half of all properties.
const METRICS_PRIMARY = [
  "sessions",
  "engagedSessions",
  "totalUsers",
  "newUsers",
  "screenPageViews",
  "userEngagementDuration",
  "keyEvents",
  "transactions",
  "totalRevenue",
];
const METRICS_LEGACY = METRICS_PRIMARY.map((m) => (m === "keyEvents" ? "conversions" : m));

/** GA4 returns the date dimension as YYYYMMDD. */
function toIsoDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

async function runReport(propertyId: string, since: string, until: string, metrics: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += REPORT_PAGE_SIZE) {
    const json = await googleFetch(`${DATA_BASE}/properties/${propertyId}:runReport`, {
      method: "POST",
      body: JSON.stringify({
        dateRanges: [{ startDate: since, endDate: until }],
        dimensions: DIMENSIONS.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        limit: REPORT_PAGE_SIZE,
        offset,
        // Without this, GA4 applies its default sampling/thresholding
        // behaviour silently; keeping rows with zero sessions out keeps the
        // stored table to real traffic only.
        keepEmptyRows: false,
      }),
    });
    const page = json.rows || [];
    rows.push(...page);
    if (page.length < REPORT_PAGE_SIZE) return rows;
  }
}

/**
 * One row per day x channel x device for the window. Dates are inclusive on
 * both ends, matching how every other connector in this app is called.
 */
export async function fetchGa4Daily(propertyId: string, since: string, until: string): Promise<Ga4DailyRow[]> {
  let raw: any[];
  try {
    raw = await runReport(propertyId, since, until, METRICS_PRIMARY);
  } catch (err: any) {
    if (/keyEvents/i.test(err?.message || "")) {
      raw = await runReport(propertyId, since, until, METRICS_LEGACY);
    } else {
      throw err;
    }
  }

  return raw.map((row) => {
    const d = (row.dimensionValues || []).map((v: any) => v.value ?? "");
    const m = (row.metricValues || []).map((v: any) => Number(v.value) || 0);
    return {
      date: toIsoDate(d[0] || ""),
      channelGroup: d[1] || "(not set)",
      deviceCategory: d[2] || "(not set)",
      sessions: m[0] || 0,
      engagedSessions: m[1] || 0,
      totalUsers: m[2] || 0,
      newUsers: m[3] || 0,
      screenPageViews: m[4] || 0,
      userEngagementDuration: Math.round(m[5] || 0),
      keyEvents: m[6] || 0,
      transactions: m[7] || 0,
      totalRevenue: m[8] || 0,
    };
  });
}
