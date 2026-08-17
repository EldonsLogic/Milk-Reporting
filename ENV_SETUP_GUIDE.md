# STEP-BY-STEP GUIDE FOR OBTAINING ALL 14 VERCEL ENVIRONMENT VARIABLES

This guide provides exact step-by-step instructions to obtain each of the **14 Environment Variables** required for your production deployment on Vercel.

---

## GROUP 1: SUPABASE DATABASE & AUTHENTICATION (3 VARIABLES)

### 1. `NEXT_PUBLIC_SUPABASE_URL`
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project (or create a new project).
3. In the left navigation sidebar, click on **Project Settings** (gear icon at the bottom).
4. Click on the **API** tab.
5. Under the **Project URL** section, copy the `URL` (e.g. `https://xyzcompany.supabase.co`).

### 2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
1. On the same **Project Settings -> API** page in Supabase.
2. Under the **Project API keys** section, find the key labeled `anon` `public`.
3. Click **Copy** to get the long JWT token string.

### 3. `SUPABASE_SERVICE_ROLE_KEY`
1. On the same **Project Settings -> API** page in Supabase.
2. Under the **Project API keys** section, find the key labeled `service_role` `secret`.
3. Click **Reveal** and copy the secret key.
   *(Note: Keep this key strictly confidential; it bypasses Row Level Security for backend migration scripts).*

---

## GROUP 2: META PLATFORM - PAID ADS & ORGANIC SOCIAL (3 VARIABLES)

### 4. `META_APP_ID`
1. Log into the [Meta for Developers Portal](https://developers.facebook.com/).
2. Click **My Apps** in the top right corner and select your app (or click **Create App** -> Select **Business** type).
3. In the app dashboard, navigate to **Settings -> Basic** in the left menu.
4. Copy the **App ID** displayed at the top of the page.

### 5. `META_APP_SECRET`
1. On the same **Settings -> Basic** page in the Meta Developers Portal.
2. Find the **App Secret** field.
3. Click **Show** (you may be asked to re-enter your Facebook password) and copy the secret string.

### 6. `META_SYSTEM_USER_TOKEN`
1. Open your [Meta Business Manager Settings](https://business.facebook.com/settings).
2. In the left sidebar, under **Users**, click **System Users**.
3. Click **Add** to create a System User (e.g., `Milk Reporting Server`). Set role to **Admin**.
4. Assign Assets: Click **Add Assets**, select your **Ad Accounts**, **Facebook Pages**, and **Instagram Accounts**, and grant full management access.
5. Click **Generate New Token**.
6. Select your App from the dropdown and select the following permissions:
   - `ads_read`, `ads_management`, `read_insights`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`.
7. Click **Generate Token** and copy the long-lived token.

---

## GROUP 3: GOOGLE ADS API (4 VARIABLES)

### 7. `GOOGLE_ADS_DEVELOPER_TOKEN`
1. Log into your [Google Ads Manager Account (MCC)](https://ads.google.com/).
2. Click **Tools and Settings** (wrench icon) in the top bar.
3. Under **Setup**, click **API Center**.
4. Fill out the application form for API access if you haven't already.
5. Copy your **Developer Token** displayed on the page.

### 8. `GOOGLE_ADS_CLIENT_ID`
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your Google Cloud project linked to your Google Ads API.
3. Navigate to **APIs & Services -> Credentials**.
4. Click **+ Create Credentials** -> **OAuth client ID**.
5. Select **Web Application** or **Desktop App** as the application type.
6. Copy the generated **Client ID**.

### 9. `GOOGLE_ADS_CLIENT_SECRET`
1. On the same **APIs & Services -> Credentials** page in Google Cloud Console.
2. Click on the OAuth 2.0 Client ID you created.
3. Copy the **Client Secret** string.

### 10. `GOOGLE_ADS_REFRESH_TOKEN`
1. Download or clone Google's OAuth playground or token generator tool:
   - Or use [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Click the gear icon in the top right of Playground and check **Use your own OAuth credentials**.
3. Enter your `GOOGLE_ADS_CLIENT_ID` and `GOOGLE_ADS_CLIENT_SECRET`.
4. In the left permissions scope list, enter: `https://www.googleapis.com/auth/adwords`.
5. Click **Authorize APIs** and log into your Google Ads Manager Account.
6. Click **Exchange authorization code for tokens** and copy the generated `refresh_token`.

---

## GROUP 4: TIKTOK ADS PLATFORM (3 VARIABLES)

### 11. `TIKTOK_APP_ID`
1. Log into the [TikTok Business Developers Portal](https://business-api.tiktok.com/portal/).
2. Go to **My Apps** and select your developer application (or click **Create App**).
3. Under **Basic Info**, copy your **App ID**.

### 12. `TIKTOK_SECRET`
1. On the same **Basic Info** page in the TikTok Developers Portal.
2. Find the **Secret** field.
3. Click **View** and copy the secret string.

### 13. `TIKTOK_ACCESS_TOKEN`
1. In the TikTok Developer App Portal, navigate to **OAuth & Authentication**.
2. Generate an authorization URL with scopes: `reporting`, `ad_account_management`, `creative_management`.
3. Authorize your TikTok Advertiser Account using the URL.
4. Copy the permanent **Access Token** generated for your advertiser account.

---

## GROUP 5: AI ANALYST & DIAGNOSTICS (1 VARIABLE)

### 14. `GEMINI_API_KEY`
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Log in with your Google Account.
3. Click **Get API Key** in the left sidebar.
4. Click **Create API key** (select or create a Google Cloud Project).
5. Copy the generated API Key.

---

## QUICK SUMMARY MATRIX FOR VERCEL

| Variable Name | Service | Access Scope / Type |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Public URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Public Anon JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Private Service Role Secret |
| `META_APP_ID` | Meta Developers | Public App Identifier |
| `META_APP_SECRET` | Meta Developers | App Client Secret |
| `META_SYSTEM_USER_TOKEN` | Meta Business | Permanent System User Token |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads Manager | API Center Token |
| `GOOGLE_ADS_CLIENT_ID` | Google Cloud Console | OAuth 2.0 Client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | Google Cloud Console | OAuth 2.0 Client Secret |
| `GOOGLE_ADS_REFRESH_TOKEN` | Google OAuth | OAuth 2.0 Refresh Token |
| `TIKTOK_APP_ID` | TikTok Developers | App Identifier |
| `TIKTOK_SECRET` | TikTok Developers | App Secret |
| `TIKTOK_ACCESS_TOKEN` | TikTok Business | Advertiser Access Token |
| `GEMINI_API_KEY` | Google AI Studio | AI Model API Key |
