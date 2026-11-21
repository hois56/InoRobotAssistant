// Browser adapter for the Rust computations. Input views must not be retained
// across a call that could grow WebAssembly memory.
globalThis.InoSite = (() => {
    'use strict';
    let instance;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    function wasm() {
        if (!instance) {
            const encoded = '__SITE_WASM__';
            const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(encoded)
                : Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
            instance = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
        }
        return instance;
    }
    function reserve(type, length) {
        const e = wasm();
        const ptr = e[type](length);
        const View = { words: Uint32Array, numbers: Float64Array, bytes: Uint8Array }[type];
        return new View(e.memory.buffer, ptr, length);
    }
    function put(type, data) {
        reserve(type, data.length).set(data);
    }
    function result(length) {
        return new Uint32Array(wasm().memory.buffer, wasm().output_ptr(), length);
    }
    function catalog(optionGroups, groupCount, rows) {
        const data = [...optionGroups];
        for (const row of rows) data.push(row.length, ...row);
        put('words', data);
        const handle = wasm().catalog_init(optionGroups.length, groupCount);
        return {
            setSearchFields(fields) {
                const lengths = [], strings = [];
                for (const row of fields) {
                    lengths.push(row.length);
                    for (const field of row) {
                        const s = encoder.encode(field);
                        lengths.push(s.length);
                        strings.push(s);
                    }
                }
                put('words', lengths);
                const buffer = reserve('bytes', strings.reduce((n,s) => n+s.length, 0));
                let offset = 0;
                for (const s of strings) { buffer.set(s, offset); offset += s.length; }
                wasm().catalog_text(handle);
            },
            select(selection, search = '') {
                put('words', selection);
                put('bytes', search ? encoder.encode(search) : []);
                const values = result(wasm().catalog_query(handle)).slice();
                return { available: values.subarray(0, optionGroups.length), rows: values.subarray(optionGroups.length) };
            }
        };
    }
    function groupFilter(elements, getGroup, weight = () => 1) {
        const groups = [...new Set(elements.map(getGroup))];
        const rows = elements.flatMap(el => [groups.indexOf(getGroup(el)), weight(el)]);
        const choices = new Map();
        let previous;
        return group => {
            const index = groups.indexOf(group);
            const id = group === 'all' ? -1 : index < 0 ? -2 : index;
            let visible = choices.get(id);
            if (!visible) {
                put('words', rows);
                visible = result(wasm().group_filter(id)).slice();
                choices.set(id, visible);
            }
            if (id !== previous) {
                elements.forEach((el, i) => {
                    const hidden = !visible[i + 1];
                    if (el.hidden !== hidden) el.hidden = hidden;
                });
                previous = id;
            }
            return visible[0];
        };
    }
    function writeStrings(values) {
        const strings = values.map(value => encoder.encode(value));
        const lengths = strings.map(s => s.length);
        put('words', lengths);
        const bytes = reserve('bytes', lengths.reduce((total, n) => total+n, 0));
        let offset = 0;
        for (const s of strings) { bytes.set(s, offset); offset += s.length; }
    }
    function workbook(files, mimeType) {
        writeStrings(Object.entries(files).flat());
        const bytes = reserve('bytes', wasm().workbook_zip());
        return new Blob([bytes], { type: mimeType });
    }
    const profiles = new Map();
    function modelProfile(name) {
        if (!profiles.has(name)) {
            put('bytes', encoder.encode(String(name || '').toUpperCase()));
            const [fixed,breaker,highPayload,gs60] = result(wasm().model_specs());
            profiles.set(name, { fixed: Boolean(fixed), breaker, highPayload: Boolean(highPayload), gs60: Boolean(gs60) });
        }
        return profiles.get(name);
    }
    function compatibleAccessories(name, accessories) {
        writeStrings([name.toUpperCase(), ...accessories.map(a => String(a.target_models || '').toUpperCase())]);
        return Array.from(result(wasm().accessory_indices()), i => accessories[i]);
    }
    function matchCable(cables, length, flex) {
        writeStrings([length,...cables.map(c => String(c.cable || ''))]);
        return cables[wasm().cable_index(flex)];
    }
    function leadTime(product, code, certified) {
        const subtype = product.specs['Sub Type'];
        const weeks = wasm().lead_time(product.specs.Type === 'SCARA', product.id.endsWith('C-INT'), certified,
            product.id.includes('S60') || subtype === '클린형' || subtype === '경제형', Boolean(code && code !== '-'));
        return weeks ? weeks + '주' : '6개월';
    }
    function history(markdown, heading = '', stopAtRule = false) {
        const title = encoder.encode(heading), body = encoder.encode(markdown);
        const buffer = reserve('bytes', title.length + body.length);
        buffer.set(title);
        buffer.set(body, title.length);
        const fields = result(wasm().history_entries(title.length, stopAtRule));
        // The output allocation may have grown memory. Offsets refer to the
        // original byte contents, which are also available here on the JS side.
        const read = (start,end) => decoder.decode(body.subarray(start-title.length,end-title.length));
        const entries = [];
        for (let i=0; i<fields.length; i+=5) {
            const [kind, a, b, start, end] = fields.subarray(i,i+5);
            entries.push({ title: kind === 1, tag: b ? read(a,b) : '안내', text: read(start,end) });
        }
        return entries;
    }
    function renderHistory(body, entries, emptyMessage) {
        const fragment = document.createDocumentFragment();
        let section;
        for (const item of entries) {
            if (item.title) {
                section = document.createElement('section');
                section.className = 'history-version-block';
                const heading = document.createElement('h3');
                heading.className = 'history-version-title';
                heading.textContent = item.text;
                section.append(heading);
                fragment.append(section);
                continue;
            }
            const entry = document.createElement('div');
            entry.className = 'history-entry';
            const tag = document.createElement('span');
            tag.className = 'history-tag';
            tag.dataset.tag = tag.textContent = item.tag;
            const text = document.createElement('div');
            for (const part of item.text.split(/(`[^`]+`)/g)) {
                if (part.startsWith('`') && part.endsWith('`')) {
                    const code = document.createElement('code');
                    code.textContent = part.slice(1,-1);
                    text.append(code);
                } else if (part) text.append(part);
            }
            entry.append(tag,text);
            section.append(entry);
        }
        if (!section) {
            const message = document.createElement('p');
            message.className = 'history-message';
            message.textContent = emptyMessage;
            fragment.append(message);
        }
        body.replaceChildren(fragment);
        body.scrollTop = 0;
    }
    function lineEdits(a, b) {
        const ids = new Map();
        const packed = reserve('words', a.length+b.length);
        let at = 0;
        for (const side of [a,b]) for (const line of side) {
            let id = ids.get(line);
            if (id === undefined) { id = ids.size; ids.set(line,id); }
            packed[at++] = id;
        }
        const ranges = result(wasm().line_edits(a.length));
        const edits = [];
        for (let i=0; i<ranges.length; i+=4) {
            edits.push({ start: ranges[i], end: ranges[i+1], lines: b.slice(ranges[i+2], ranges[i+3]) });
        }
        return edits;
    }
    function meshProperties(positions, indices) {
        put('numbers', positions);
        put('words', indices);
        const error = wasm().mesh_integrate();
        if (error) throw new Error(['','STEP mesh has invalid vertex data.', 'STEP mesh has invalid triangle data.',
            'STEP mesh contains a non-finite coordinate.', 'STEP solid has zero or invalid volume.'][error]);
        const values = reserve('numbers',13);
        const read = i => Array.from(values.subarray(i,i+3));
        return { volumeMm3: values[0], centroidMm: read(1), inertiaCentroidMm5: [read(4),read(7),read(10)] };
    }
    function axes(x, y) {
        put('numbers', [...x, ...y]);
        if (!wasm().frame_axes()) throw new Error('Coordinate axis has zero length.');
        const values = reserve('numbers', 9);
        return [0,3,6].map(i => Array.from(values.subarray(i,i+3)));
    }
    function framePoint(point, frame) {
        put('numbers', [...frame.originMm, ...frame.x, ...frame.y, ...frame.z, ...point]);
        wasm().frame_point();
        return Array.from(reserve('numbers', 3));
    }
    function combineParts(parts, frame) {
        const active = parts.filter(p => p.enabled !== false);
        const data = reserve('numbers', 12 + 14*active.length);
        data.set([...frame.originMm, ...frame.x, ...frame.y, ...frame.z]);
        let at = 12;
        for (const part of active) {
            const g = part.geometry;
            data[at++] = Number(part.densityKgPerMm3);
            data[at++] = Number(g?.volumeMm3);
            const center = g?.centroidMm;
            const inertia = g?.inertiaCentroidMm5;
            // Defer validity decisions to Rust in the controller's original order.
            const validCenter = Array.isArray(center) && center.length === 3;
            const validInertia = Array.isArray(inertia) && inertia.length === 3
                && inertia.every(row => Array.isArray(row) && row.length === 3);
            for (let i=0; i<3; i++) data[at++] = validCenter ? Number(center[i]) : NaN;
            for (let i=0; i<9; i++) data[at++] = validInertia ? Number(inertia[Math.floor(i/3)][i%3]) : NaN;
        }
        const error = wasm().combine_parts();
        if (error) throw new Error(['','No active STEP solids.','Each active STEP solid must have a positive finite density.',
            'Each active STEP solid must have a positive finite volume.', 'STEP solid has an invalid centroid.',
            'STEP solid has invalid inertia values.', 'Calculated mass is zero or invalid.'][error]);
        const values = reserve('numbers',25);
        const vector = i => Array.from(values.subarray(i,i+3));
        const matrix = i => [vector(i),vector(i+3),vector(i+6)];
        return { massKg:values[0], centerOfMassCadMm:vector(1), centerOfMassToolMm:vector(4),
            inertiaCenterKgM2:matrix(7), inertiaOriginKgM2:matrix(16) };
    }
    function blockAssembly(blocks, materials) {
        put('numbers', blocks.flatMap(b => [materials[b.mat].rho,b.x,b.y,b.z,b.cx,b.cy,b.cz]));
        wasm().block_assembly();
        const [M,Cx,Cy,Cz,Ixx,Iyy,Izz] = reserve('numbers',7);
        return { M,Cx,Cy,Cz,Ixx,Iyy,Izz };
    }
    function shapeInertias(blocks) {
        put('numbers', blocks.flatMap(b => [b.m,b.x,b.y,b.z]));
        wasm().shape_inertias();
        return reserve('numbers',4*(blocks.length+1)).slice();
    }
    function loadVerdicts(rows) {
        const count = rows.length * 2;
        const input = reserve('numbers', count);
        rows.forEach(([, value, limit], i) => {
            input[i * 2] = value;
            input[i * 2 + 1] = limit;
        });
        const worst = wasm().load_verdicts();
        return { worst, marginsAndVerdicts: reserve('numbers', count).slice() };
    }
    function wristLoad(mass,x,y,z,j5,iyy,izz) {
        wasm().wrist_load(mass,x,y,z,j5,iyy,izz);
        return reserve('numbers',6).slice();
    }
    // Welds STEP vertices and finds feature edges and B-rep face centres.
    // triangles: (raw vertex a, b, c, source triangle) per triangle; faces: (first, last) per B-rep face.
    function snapTopology(positions, tolerance, triangles, faces, sharpCosine) {
        put('numbers', positions);
        const words = reserve('words', triangles.length + faces.length + 2);
        words[0] = triangles.length / 4;
        words.set(triangles, 1);
        words[triangles.length + 1] = faces.length / 2;
        words.set(faces, triangles.length + 2);
        if (wasm().snap_topology(tolerance, sharpCosine)) return null;
        const [welded, triangleCount, edges, faceCount] = result(4);
        const values = result(4 + welded + edges * 2 + faceCount).slice(4);
        return { firstRaw: values.subarray(0, welded), triangleCount,
            edges: values.subarray(welded, welded + edges * 2), faceIndices: values.subarray(welded + edges * 2),
            faceCenters: reserve('numbers', faceCount * 3).slice() };
    }
    return { catalog, groupFilter, workbook, modelProfile, compatibleAccessories, matchCable, leadTime, history, renderHistory, lineEdits, meshProperties, axes, framePoint, combineParts, blockAssembly,
        shapeInertias, wristLoad, loadVerdicts, snapTopology, calibrate: (factory,teaching) => wasm().zero_calibration(factory,teaching) };
})();
