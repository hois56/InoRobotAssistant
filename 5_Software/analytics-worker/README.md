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

3. D1 stores the daily metrics, and the deployed Worker exposes a protected,
   Excel-compatible CSV download at `/analytics.csv`. Create a strong bearer
   token as a Worker secret:

   ```powershell
   npx.cmd wrangler secret put ANALYTICS_CSV_TOKEN
   ```

   Send it only in the `Authorization` header. The optional `limit` must be an
   integer from 1 through 5,000; it defaults to the latest 366 days, returned
   in chronological order.

   ```powershell
   Invoke-WebRequest -Uri 'https://WORKER_URL/analytics.csv?limit=366' `
     -Headers @{ Authorization = 'Bearer YOUR_TOKEN' } -OutFile analytics_daily.csv
   ```

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
   Worker writes the complete D1 result to `Daily` before clearing only stale
   trailing rows, so a failed write does not first empty the existing sheet and
   reprocessing the previous three KST days does not create duplicate rows. It
   extends the `Daily` grid before writing when the stored history outgrows the
   current row count, so there is no 5,000-row ceiling. The
   sheet uses bilingual Korean/English headers and only publishes valid data
   dated `2026-07-22` or later. Count and sampling columns are displayed as
   whole numbers, while source-window and collection timestamps are converted
   from stored UTC values to Korea Standard Time before being written. The
   `방문 분석` tab reads the `Daily` tab with formulas, so its KPIs, period
   comparison, and charts update automatically. The Worker also creates and
   maintains a `주간·월간 추이` tab with Monday-based weekly totals, monthly
   totals, previous-period change rates, and separate weekly/monthly line
   charts. Its formulas read the complete `Daily` columns and its formatted and
   charted row range expands with the stored daily rows, rather than stopping
   after 95 weeks. Trend formulas are also accepted before old charts and
   formatting are replaced, so a formula failure does not first blank that tab.
   The first and current week or month can be partial periods.

5. Create a scoped Cloudflare API token with analytics read access and store it
   as a Worker secret. Never put this token in the repository or in a webpage:

   ```powershell
   npx wrangler@latest secret put CLOUDFLARE_API_TOKEN
   ```

6. Deploy the Worker:

   ```powershell
   npx wrangler@latest deploy
   ```

The scheduled handler runs at 01:00 UTC (10:00 KST). Every `date` is a Korea
Standard Time calendar date, with its Cloudflare source window running from
00:00 through the next 00:00 KST (15:00 through the next 15:00 UTC). During the
initial backfill it refreshes the previous three completed KST days first, then
processes history in 5-day batches back to `2026-07-22` (capped at six months)
and synchronizes each batch to Google
Sheets. After the backfill it keeps refreshing the previous three KST days.
The KST migration uses a versioned backfill state key, so previously stored UTC
day rows are reprocessed instead of remaining mixed with KST days. Collection
progress is saved immediately after the D1 batch succeeds, before Sheets sync;
therefore a temporary Sheets failure does not recollect the same GraphQL batch,
and the next successful invocation still rewrites Sheets from all D1 rows. The
D1 upsert and full-sheet synchronization prevent duplicate rows.

## Stored metrics

- `page_views`: Cloudflare RUM page-load group count.
- `referrer_visits`: Cloudflare's `sum.visits` metric.
- `sample_interval`: Cloudflare Adaptive Bit Rate sample interval, when present.

The `analytics_raw_archive` table points to a daily raw JSON archive. When R2
is enabled the archive is mirrored to an R2 object; otherwise the JSON is
stored in ordered chunks in `analytics_raw_parts`. Each archive retains the
page-load GraphQL response, including:

- page-load counts, visits, page paths, referrers, countries, devices,
  browsers, operating systems, bot flags, and time buckets.

The collector deliberately keeps the account-level GraphQL selection below
Cloudflare Analytics' 30-field limit. Daily D1/Sheets totals come from a
separate ungrouped query, so they cannot be reduced by the 10,000 detailed-group
limit. If a detailed archive query reaches that limit, the Worker discards that
response and sequentially retries smaller time windows on five-minute boundaries
that match the finest stored time dimension. A scheduled invocation has a
shared 40-query budget and each KST date has a 24-query budget. The smaller
five-day backfill batch keeps the normal eight-date collection at 16 GraphQL
requests and reserves the remaining Worker subrequests for dense-day splits,
Google OAuth, and Google Sheets. Rate-limit responses are retried at most twice,
honoring `Retry-After` up to five seconds. A date is also capped at 50,000
archived groups. If a detail budget is exhausted, the archive cap is exceeded,
or even a five-minute window reaches the group limit, the Worker still stores
the separate complete daily summary for D1 and Sheets. It never stores the
partial detail rows: schema version 5 records an empty `pageloads` array,
`archiveComplete: false`, and an explicit `archiveError`, then a later refresh
can replace it. Performance and Core Web Vitals remain
available in the Cloudflare dashboard but are not copied into this archive.

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
