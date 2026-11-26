const entry = document.getElementById('rust-simulator');
function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load ' + url));
        script.src = url;
        document.head.appendChild(script);
    });
}
document.body.inert = true;
try {
    const [{ createView }, { engine }] = await Promise.all([
        import('./wasm/dom.mjs'),
        import('./wasm/engine.mjs')
    ]);
    const view = createView(engine, document);
    entry.replaceWith(view);
    await loadScript(entry.dataset.localeScript);
    await loadScript(entry.dataset.guide);
    await import(new URL(entry.dataset.main, document.baseURI).href);
} catch (error) {
    console.error('3D simulation startup failed', error);
    entry.dispatchEvent(new Event('simulation:boot-failed'));
} finally {
    document.body.inert = false;
}
