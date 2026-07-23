/*
 * Loads the Cloudflare Web Analytics beacon on every HTML entry page.
 * Keeping this in one file avoids duplicating the provider snippet and makes
 * it possible to disable analytics by clearing the token in analytics-config.js.
 */
(function loadInoRobotAnalytics() {
    const config = window.INOROBOT_ANALYTICS_CONFIG;
    const token = typeof config?.token === 'string' ? config.token.trim() : '';

    if (config?.provider !== 'cloudflare-web-analytics' || !token) {
        return;
    }

    if (document.querySelector('[data-inorobot-cloudflare-analytics]')) {
        return;
    }

    const beacon = document.createElement('script');
    beacon.defer = true;
    beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    beacon.dataset.cfBeacon = JSON.stringify({ token });
    beacon.dataset.inorobotCloudflareAnalytics = 'true';
    document.head.appendChild(beacon);
})();
