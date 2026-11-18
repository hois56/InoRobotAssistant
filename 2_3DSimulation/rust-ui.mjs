import { createView } from './wasm/dom.mjs';

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
    const { engine } = await import('./wasm/engine.mjs');
    const view = createView(engine, document);
    entry.replaceWith(view);
    await loadScript(entry.dataset.localeScript);
    await loadScript(entry.dataset.guide);
    await import(new URL(entry.dataset.main, document.baseURI).href);
} catch (error) {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = '3D Simulation · ' + (error?.message || String(error));
    document.body.prepend(message);
    throw error;
} finally {
    document.body.inert = false;
}
