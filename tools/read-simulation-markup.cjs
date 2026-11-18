const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createView, domImports } = require('../2_3DSimulation/wasm/dom.mjs');

const root = path.resolve(__dirname, '../2_3DSimulation');
const voidTags = new Set(['br', 'hr', 'img', 'input']);
const escapeText = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function container() {
    const children = [];
    return {
        appendChild: child => children.push(child),
        html: () => children.map(child => child.html()).join('')
    };
}

function element(name) {
    const content = container();
    const attributes = [];
    return {
        appendChild: content.appendChild,
        setAttribute(key, value) {
            attributes.push(value ? ` ${key}="${escapeText(value).replaceAll('"', '&quot;')}"` : ` ${key}`);
        },
        html() {
            const open = `<${name}${attributes.join('')}>`;
            return voidTags.has(name) ? open : open + content.html() + `</${name}>`;
        }
    };
}

let page;
function readSimulationMarkup() {
    if (page) return page;
    const module = new WebAssembly.Module(readFileSync(path.join(root, 'wasm', 'simulation.wasm')));
    const imports = { dom: domImports };
    for (const { module: name, name: symbol } of WebAssembly.Module.imports(module)) {
        if (name !== 'dom') {
            (imports[name] ??= {})[symbol] = () => { throw new Error(`Unexpected view import ${name}.${symbol}`); };
        }
    }
    const { exports } = new WebAssembly.Instance(module, imports);
    const document = {
        createDocumentFragment: container,
        createElement: element,
        createElementNS: (_, name) => element(name),
        createTextNode: value => ({ html: () => escapeText(value) })
    };
    const rendered = createView(exports, document).html();
    const shell = readFileSync(path.join(root, 'index.html'), 'utf8');
    page = shell.replace(/<body\b[^>]*>/, open => open + rendered);
    return page;
}

module.exports = { readSimulationMarkup };
