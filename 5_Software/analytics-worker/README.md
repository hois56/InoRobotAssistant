# InoRobot Analytics Worker

This Worker archives Cloudflare Web Analytics RUM data in Cloudflare D1 and
optionally synchronizes the daily summary to Google Sheets.
The public site keeps using the Cloudflare Web Analytics beacon; this Worker
only runs as a scheduled server-side collector.

## Required Cloudflare setup

1. Create the D1 database and copy its ID into `wrangler.toml`:

   ```powershell
   npx wrangler@latest d1 create inorobot-analytics
   ```

2. Apply the schema remotely:

   ```powershell
   npx wrangler@latest d1 execute inorobot-analytics --remote --file=schema.sql
   ```

3. D1 stores the daily metrics, and the deployed Worker exposes an
   Excel-compatible CSV download at `/analytics.csv`.

4. To enable Google Sheets synchronization:

   - Enable the Google Sheets API in a Google Cloud project.
   - Create a service account and download its JSON key.
   - Share the target spreadsheet's `Daily` tab with the service account email
     as an Editor.
   - Put the following values into Worker secrets. The private key may be
     pasted with real line breaks or with `\\n` escapes:

   ```powershell
   npx.cmd wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
   npx.cmd wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
   npx.cmd wrangler secret put GOOGLE_SHEETS_ID
   ```

   The spreadsheet ID is the value between `/d/` and `/edit` in its URL. The
   Worker rewrites `Daily!A2:H5000` from D1 after each scheduled collection,
   so reprocessing the previous three days does not create duplicate rows.

5. Create a scoped Cloudflare API token with analytics read access and store it
   as a Worker secret. Never put this token in the repository or in a webpage:

   ```powershell
   npx wrangler@latest secret put CLOUDFLARE_API_TOKEN
   ```

6. Deploy the Worker:

   ```powershell
   npx wrangler@latest deploy
   ```

The scheduled handler runs at 01:00 UTC (10:00 KST). On the first run it backfills the
previous six months in 30-day batches, synchronizes each batch to Google
Sheets, and then switches to refreshing the previous three UTC days. The D1
upsert and full-sheet synchronization prevent duplicate rows.

## Stored metrics

- `page_views`: Cloudflare RUM page-load group count.
- `referrer_visits`: Cloudflare's `sum.visits` metric.
- `sample_interval`: Cloudflare Adaptive Bit Rate sample interval, when present.

The `analytics_raw_archive` table points to a daily raw JSON archive. When R2
is enabled the archive is mirrored to an R2 object; otherwise the JSON is
stored in ordered chunks in `analytics_raw_parts`. Each archive retains the
raw GraphQL response for the available RUM datasets:

- page-load counts, visits, page paths, referrers, countries, devices,
  browsers, operating systems, bot flags, and time buckets;
- performance timing averages and quantiles;
- Core Web Vitals averages and quantiles, including LCP, INP, CLS, FCP, and
  TTFB.

Cloudflare Web Analytics is privacy-preserving RUM data, not a raw access-log
stream. It does not provide IP addresses, cookies, or a lifetime visitor ID.
A lifetime unique-visitor number must not be calculated by summing daily
visitor estimates; returning visitors would be counted more than once.

If R2 is enabled later, raw JSON object keys use this format:

```text
web-analytics/date=YYYY-MM-DD/host=inovancerobot.com.json
```

## Health check

After deployment, open the Worker URL with `/health`. It returns a small JSON
response without exposing the API secret.
