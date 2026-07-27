# InoRobot Analytics Worker

This Worker archives Cloudflare Web Analytics RUM data in Cloudflare D1 and,
when enabled, R2.
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

3. Optional: create the R2 bucket used for the large-object raw JSON mirror:

   ```powershell
   npx wrangler@latest r2 bucket create inorobot-analytics-raw
   ```

   R2 must first be enabled in the Cloudflare Dashboard. If R2 is not
   enabled, the Worker stores the same raw JSON in D1 as chunked rows, so raw
   retention still works without R2.

4. Create a scoped Cloudflare API token with analytics read access and store it
   as a Worker secret. Never put this token in the repository or in a webpage:

   ```powershell
   npx wrangler@latest secret put CLOUDFLARE_API_TOKEN
   ```

5. Deploy the Worker:

   ```powershell
   npx wrangler@latest deploy
   ```

The scheduled handler runs at 00:20 UTC and refreshes the previous three UTC
days. Re-running a day replaces that day's D1 rows and raw archive, so late-
arriving analytics can be corrected without duplicates.

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

When R2 is enabled, object keys use this format:

```text
web-analytics/date=YYYY-MM-DD/host=inovancerobot.com.json
```

## Health check

After deployment, open the Worker URL with `/health`. It returns a small JSON
response without exposing the API secret.
