/*
 * Cumulative visit counter.
 *
 * The Worker keeps the total in Cloudflare KV and suppresses repeat visits
 * from the same browser fingerprint for a short window. The displayed
 * baseline protects the site from falling below its known historical total.
 */
(() => {
    const visitCounterStart = 1800;
    const visitCounterUrl = 'https://inorobot-visitor-counter.hois56.workers.dev/visit';
    const visitCounter = document.getElementById('visit-count');

    if (!visitCounter) return;

    function renderVisitCount(total) {
        const count = Math.max(visitCounterStart, Number(total) || visitCounterStart);
        visitCounter.textContent = `visits ${count.toLocaleString('en-US')}`;
    }

    renderVisitCount(visitCounterStart);

    fetch(visitCounterUrl, {
        method: 'POST',
        cache: 'no-store',
        keepalive: true
    })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
            if (data?.ok) renderVisitCount(data.total);
        })
        .catch(() => {
            renderVisitCount(visitCounterStart);
        });
})();
