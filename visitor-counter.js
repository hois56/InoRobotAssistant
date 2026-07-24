/*
 * Legacy cumulative visitor counter.
 *
 * This is intentionally separate from Cloudflare Web Analytics: the counter
 * keeps the site's historical total in the existing Worker KV namespace,
 * while Web Analytics provides page-level reporting in the dashboard.
 */
(() => {
    const visitCounterStart = 721;
    const visitCounterUrl = 'https://ino-robot-display-auth.hois56.workers.dev/visit';
    const visitCounter = document.getElementById('visit-count');

    if (!visitCounter) {
        return;
    }

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
            if (data && data.ok) {
                renderVisitCount(data.total);
            }
        })
        .catch(() => {
            renderVisitCount(visitCounterStart);
        });
})();
