/*
 * Cloudflare Web Analytics configuration.
 *
 * 1. In Cloudflare Dashboard > Web Analytics, add inovancerobot.com.
 * 2. Copy the site's beacon token from Manage site.
 * 3. Paste it into the token property below and deploy the site.
 *
 * The token is intentionally client-side: Cloudflare's Web Analytics beacon
 * is designed to be embedded in public pages. Until a token is supplied, the
 * loader remains inactive and the site continues to work normally.
 */
window.INOROBOT_ANALYTICS_CONFIG = Object.freeze({
    provider: 'cloudflare-web-analytics',
    token: 'b5dc2f96152147f09e2da8de07964afe'
});
