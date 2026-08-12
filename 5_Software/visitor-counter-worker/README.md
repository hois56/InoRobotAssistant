# InoRobot Visitor Counter Worker

The public home page uses this Worker for its cumulative visit number. A
single SQLite-backed Durable Object performs the increment and five-minute
deduplication atomically. The former Workers KV total remains bound only so the
Durable Object can import and reconcile the live total without losing visits
during rollout. The historical floor remains `1800`, while the verified
migration floor and page fallback are fixed at `2031` (checked on 2026-08-12).

## Deploy without resetting the live total

1. Record the current legacy total before deployment:

   ```powershell
   npx.cmd wrangler kv key get "visitor:total" --binding VISITOR_KV --remote --text --config 5_Software/visitor-counter-worker/wrangler.toml
   ```

2. Create a strong random HMAC secret and store it as a Worker secret. Never
   commit the value:

   ```powershell
   npx.cmd wrangler secret put VISITOR_HASH_SECRET --config 5_Software/visitor-counter-worker/wrangler.toml
   ```

3. Deploy the Worker:

   ```powershell
   npx.cmd wrangler deploy --config 5_Software/visitor-counter-worker/wrangler.toml
   ```

4. Open the site once, wait at least five minutes for any cached old page to
   finish using the legacy Worker code, and compare `GET /visit` with the
   pre-deployment total. The Durable Object imports the latest KV value and
   applies only the positive difference, so old and new requests can overlap
   during deployment without resetting the number. During this bridge period,
   the Worker also reads and refreshes the former five-minute KV duplicate
   marker so the same browser is not counted once by each implementation.

5. After the new total has been stable for at least five minutes and the last
   remote KV value has been reconciled, remove the KV binding and legacy bridge
   in a separate deployment. Do not delete or reset the namespace before that
   verification is complete.

The original IP address, User-Agent, and language are not stored. The outer
Worker converts them to an HMAC-SHA-256 value using `VISITOR_HASH_SECRET`, and
the Durable Object stores the pseudonymous visitor and IP-derived values for a
five-minute logical window. Expired rows are removed while later requests are
processed. The Durable Object accepts at most 10 distinct fingerprints from
one IP-derived value within that window to reduce automated count inflation.

Keep the origin allow-list and, if abuse becomes visible, add a Cloudflare
rate-limiting rule or Turnstile verification for `/visit`. CORS and the local
10-request cap reduce abuse but are not authentication and cannot by themselves
prevent automation through rotating proxies.
