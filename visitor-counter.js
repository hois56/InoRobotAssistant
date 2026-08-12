/*
 * Cumulative visit counter.
 *
 * The Worker keeps the total in a transaction-safe Durable Object and
 * suppresses repeat visits from the same browser fingerprint for a short
 * window. The displayed snapshot protects the site from falling below the
 * last verified total while the API is unavailable.
 */
(() => {
    const visitCounterStart = 2031;
    const visitCounterUrl = 'https://inorobot-visitor-counter.hois56.workers.dev/visit';
    const visitCounter = document.getElementById('visit-count');

    if (!visitCounter) return;

    const initialCount = Number.parseInt(visitCounter.textContent.replace(/[^0-9]/g, ''), 10);
    const fallbackCount = Math.max(
        visitCounterStart,
        Number.isFinite(initialCount) ? initialCount : visitCounterStart
    );

    function renderVisitCount(total) {
        const count = Math.max(fallbackCount, Number(total) || fallbackCount);
        const formattedCount = count.toLocaleString('en-US');
        const currentText = visitCounter.textContent;
        visitCounter.textContent = /[0-9][0-9,]*/.test(currentText)
            ? currentText.replace(/[0-9][0-9,]*/, formattedCount)
            : `visits ${formattedCount}`;
    }

    renderVisitCount(fallbackCount);

    fetch(visitCounterUrl, {
        method: 'POST',
        cache: 'no-store',
        keepalive: true
    })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
            if (data?.ok) renderVisitCount(data.total);
        })
        .catch(() => {});
})();
