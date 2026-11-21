// Project import and conservative three-way merging. No controller or network access.
'use strict';
const ProjectEditor = (() => {
    const META = '.inorobot-generator.json';
    const copy = value => JSON.parse(JSON.stringify(value));
    const normalize = text => String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const comparable = text => normalize(text).replace(/(\bTime\s*=\s*")[^"]*(")/g, '$1<TIME>$2');
    const equal = (a, b) => a === b || (typeof a === 'string' && typeof b === 'string' && comparable(a) === comparable(b));
    const safePath = path => {
        const value = String(path).replaceAll('\\', '/');
        if (!value || /^[A-Za-z]:|^\//.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid project path: ' + value);
        return value;
    };
    const stepName = step => step._customName || `sP${String(step.No).padStart(2, '0')}_${step.WorkType}_${step.WorkMethod}`;
    const config = (steps, options, name) => ({ name, steps: steps.map(s => ({ ...copy(s), ProcessName: stepName(s) })), options: copy(options) });

    function generate(settings, G) {
        const { options: o, name } = settings;
        const steps = settings.steps.map(s => ({ ...s, ProcessName: stepName(s) }));
        const files = {
            'main.pro': G.MainProgram(steps, o), 'PLC_internal.pro': G.PLCInternalProgram(o),
            's01_initial.pro': G.InitialProgram(steps, o), 's02_offset.pro': G.OffsetProgram(steps, o),
            'Remote_IO_mapping.dat': G.RemoteIOInfo(o),
            [`${name}.prj`]: G.DataPrj(steps, o, name),
            'Data/Labels.jsn': G.LabelsJson(steps, o), 'Data/UserDefineWarning.jsn': G.DataWarning(steps, o),
            'Data/P.pts': G.DataPoints(steps, o),
            'Data/JP.pts': G.Header(o.RobotName), 'Data/BreakPoints.jsn': '{"ProgramsCount":0,"ProgramsBreaks":[]}',
            'Data/MonitorVars.jsn': '[]', 'Data/MonitorGlobalVars.jsn': '[]'
        };
        if (o.EnableTeachingMode) files['s03_teach_mode.pro'] = G.TeachModeProgram(steps, o);
        if (o.EnableToolControl) files['s04_Tool_Control.pro'] = G.ToolControlProgram(o, steps);
        if (o.EnableTcpSpeed) files['PLC_TCP_Speed.pro'] = G.TcpSpeedProgram(o.RobotName);
        if (o.EnableMultiRecipe) for (let i = 1; i < o.RecipeCount; i++) {
            const name = `P${String(i).padStart(2, '0')}.pts`;
            files[`Data/${name}`] = G.DataPoints(steps, o, name);
        }
        const monitors = ['xReIO_run_all_static', 'xwProcess_wait_pos', 'xwProcess_work_pos', 'ywProcess_wait_comp', 'ywProcess_work_comp', 'ywProcess_wait_busy', 'ywProcess_work_busy', 'xwSet_speed', 'ywReIO_cur_control', 'yRemote_mode_sts', 'B_Tool', 'B_Wobj', 'B_PR', 'B_path', 'B_Cur_process', 'yRobot_homing', 'R_Cur_pos', 'xwP_file_switch'];
        if (o.EnableTcpSpeed) monitors.push('D_TCP_speed');
        if (o.EnableTorque) for (let i = 1; i <= 6; i++) monitors.push(`D_J${i}_cur_torque`, `D_J${i}_max_torque`);
        files['Data/MonitorGlobalVars.jsn'] = JSON.stringify(monitors);
        let stage = 0;
        for (const s of steps) {
            if (s.WorkType === 'Stage') stage++;
            files[`${stepName(s)}.pro`] = G.ProcessProgram(s, o, s.StageSlot || stage);
        }
        if (o.LabelBindings || o.LabelAliases) {
            const labels = JSON.parse(files['Data/Labels.jsn']);
            for (const section of Object.values(labels)) for (const label of section.LabelsArray || []) {
                if (o.LabelBindings?.[label.sLabel]) Object.assign(label, o.LabelBindings[label.sLabel]);
                label.sLabel = o.LabelAliases?.[label.sLabel] || label.sLabel;
            }
            files['Data/Labels.jsn'] = JSON.stringify(labels, null, 2);
            for (const path of Object.keys(files)) if (/\.pro$/i.test(path)) files[path] = files[path].replace(/\b[A-Za-z_]\w*\b/g, token => o.LabelAliases?.[token] || token);
        }
        return files;
    }

    async function readEntries(input, Zip) {
        const entries = [];
        if (input.length === 1 && /\.zip$/i.test(input[0].name)) {
            const zip = await Zip.loadAsync(await input[0].arrayBuffer());
            for (const entry of Object.values(zip.files)) if (!entry.dir) {
                // JSZip sanitizes traversal paths: reject the original name as well.
                safePath(entry.unsafeOriginalName || entry.name);
                entries.push([safePath(entry.name), await entry.async('uint8array')]);
            }
        } else for (const file of input) entries.push([safePath(file.webkitRelativePath || file.relativePath || file.name), new Uint8Array(await file.arrayBuffer())]);
        const result = new Map(), names = new Set();
        for (const [path, bytes] of entries) {
            if (names.has(path.toLowerCase())) throw new Error('Duplicate project path: ' + path);
            names.add(path.toLowerCase());
            let text = null;
            if (/\.(pro|prj|pts|jsn|dat|json|txt|cfg|csv)$/i.test(path)) {
                const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
                try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
                catch { throw new Error('Unsupported text encoding: ' + path); }
            }
            result.set(path, { bytes, text });
        }
        return result;
    }

    function open(entries, projectPath, defaults, G) {
        safePath(projectPath);
        const root = projectPath.slice(0, projectPath.lastIndexOf('/') + 1);
        const files = new Map([...entries].filter(([p]) => p.startsWith(root)).map(([p, f]) => [p.slice(root.length), f]));
        const name = projectPath.slice(root.length).replace(/\.prj$/i, '');
        const project = JSON.parse(files.get(`${name}.prj`)?.text || 'null');
        if (!project || !Array.isArray(project.ProgramFiles)) throw new Error('Invalid project configuration.');
        for (const path of project.ProgramFiles) if (!files.has(path)) throw new Error('Missing project program: ' + path);
        const text = path => files.get(path)?.text || '';
        let metadata = null;
        if (files.has(META)) {
            metadata = JSON.parse(text(META));
            if (metadata.format !== 'InoRobotGenerator' || metadata.version !== 1) throw new Error('Unsupported generator metadata.');
        }
        const issues = [], steps = [], o = { ...copy(defaults), ...copy(metadata?.config?.options || {}), VisionConfigs: {} };
        const main = text('main.pro'), offset = text('s02_offset.pro'), tool = text('s04_Tool_Control.pro');
        const all = [...files.values()].map(f => f.text || '').join('\n');
        Object.assign(o, {
            PreserveProcessNumbers: true,
            RobotName: all.match(/RobotName\s*=\s*"([^"]+)"/)?.[1] || o.RobotName,
            EnableTeachingMode: /Teaching_mode\s*\(/i.test(main + all.match(/Func P\d+_pos\(\)[\s\S]*?EndFunc;/)?.[0]),
            EnableWaitPos: /xwProcess_wait_pos/.test(main), EnableProcessBusy: /ywProcess_work_busy/.test(main),
            EnableToolControl: /s04_Tool_Control\./.test(all), ToolControlType: tool ? /_chk\b/.test(tool) ? 'DIO' : 'PLC_IO' : o.ToolControlType,
            EnableTcpSpeed: project.ProgramFiles.includes('PLC_TCP_Speed.pro'),
            EnableTorque: /D_J1_cur_torque|GetTorque\s*\(/i.test(text('PLC_internal.pro')),
            EnableMultiRecipe: (project.RobPointFiles?.length || 0) > 1, RecipeCount: (project.RobPointFiles?.length || 0) > 1 ? project.RobPointFiles.length : o.RecipeCount
        });
        let stage = 0;
        for (const path of project.ProgramFiles) {
            safePath(path);
            const code = text(path), module = path.replace(/\.pro$/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const declaration = code.match(/Func\s+P(\d+)_pos\s*\(/i);
            const match = declaration || main.match(new RegExp(`\\b${module}\\.P(\\d+)_pos\\s*\\(`, 'i'));
            if (!match) {
                if (/^sP\d+/i.test(path)) issues.push({ kind: 'unmapped', path });
                continue;
            }
            const No = Number(match[1]);
            if (No < 1 || No > 15 || steps.some(s => s.No === No)) throw new Error('Invalid or duplicate process number: ' + No);
            const old = metadata?.config?.steps?.find(s => s.No === No);
            const hint = code.match(new RegExp(`P${No} - (Tray|Stage|MCR|Vision|Trash|Peeling) (Get|Put|Check|Calibration|Peeling) pos End`, 'i'));
            const filenameHint = path.match(/^sP\d+_(Tray|Stage|MCR|Vision|Trash)_(Get|Put|Check|Calibration|Peeling)\.pro$/);
            const h = hint || filenameHint;
            const s = { No, id: old?.id || `import-P${No}`, WorkType: h?.[1] || old?.WorkType || 'Tray', WorkMethod: h?.[2] || old?.WorkMethod || 'Get',
                ToolType: /B_Tool\s*=\s*2/.test(code) ? 'Gripper' : 'Vacuum',
                VisionUse: /Connect_socket\(/.test(code) ? 'Use - Socket' : /xwVision_offset_[XYA]/.test(offset.match(new RegExp(`Case ${No}:[\\s\\S]*?Break;`))?.[0] || '') ? 'Use - IO' : 'No use',
                ExtraWaitCount: Math.max(0, ...[...code.matchAll(new RegExp(`P${No}_Wait(\\d+)`, 'g'))].map(m => Number(m[1]) - 1)),
                TrayXCount: 3, TrayYCount: 3, TrayPitchX: -58, TrayPitchY: -58, _customName: null };
            if (s.WorkType === 'Peeling') s.WorkType = 'Stage';
            if (!h && !old) issues.push({ kind: 'step', id: s.id, fields: ['WorkType', 'WorkMethod'] });
            if (!declaration || hint && filenameHint && (hint[1] !== filenameHint[1] || hint[2] !== filenameHint[2])) issues.push({ kind: 'step', id: s.id, fields: ['WorkType', 'WorkMethod', 'Process entry function'] });
            if (s.WorkMethod === 'Calibration' || (s.WorkType === 'Vision' && s.WorkMethod === 'Check')) s.ToolType = /Connect_socket\(/.test(code) ? 'Vision (Socket)' : 'PLC (IO)';
            if (s.WorkType === 'MCR' && s.WorkMethod === 'Check') {
                s.ToolType = old?.ToolType || s.ToolType;
                if (!old) issues.push({ kind: 'step', id: s.id, fields: ['ToolType'] });
            }
            if (s.WorkMethod === 'Calibration') s.VisionUse = 'No use';
            if (s.WorkType === 'Stage') {
                stage++;
                s.StageSlot = Number(code.match(/s04_Tool_Control\.Stage(\d*)_Vac_/)?.[1] || old?.StageSlot || stage);
            }
            const trayCase = offset.match(new RegExp(`Case ${No}:\\s*X_count[\\s\\S]*?Break;`))?.[0];
            const tray = trayCase || offset.slice(offset.indexOf('Func Set_tray_offset()'));
            for (const [key, token] of [['TrayXCount', 'X_count'], ['TrayYCount', 'Y_count'], ['TrayPitchX', 'pitch_X'], ['TrayPitchY', 'pitch_Y']]) {
                const v = tray.match(new RegExp(`\\b${token}\\s*=\\s*(-?[\\d.]+)`));
                if (v) s[key] = Number(v[1]);
                else if (old && old[key] !== undefined) s[key] = old[key];
                else if (s.WorkType === 'Tray') issues.push({ kind: 'step', id: s.id, fields: [key] });
            }
            if (G.UsesVisionSocket(s)) {
                const endpoint = code.match(/String\s+server_IP\s*=\s*"([^"]+)"/i);
                const port = code.match(/Int\s+server_port\s*=\s*(\d+)/i);
                o.VisionConfigs[s.id] = { IsClient: /Open\s+Socket\(/i.test(code), IpAddress: endpoint?.[1] || old && metadata.config.options.VisionConfigs?.[old.id]?.IpAddress || '192.168.1.10', Port: port?.[1] || old && metadata.config.options.VisionConfigs?.[old.id]?.Port || '5000' };
                if (!port && !old) issues.push({ kind: 'step', id: s.id, fields: ['Vision server port'] });
            }
            const basename = path.replace(/\.pro$/i, '');
            if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(basename)) throw new Error('Unsupported process name: ' + basename);
            if (basename !== stepName(s)) s._customName = basename;
            steps.push(s);
        }
        if (!steps.length && !issues.some(i => i.kind === 'unmapped')) throw new Error('No generator processes found.');
        steps.sort((a, b) => a.No - b.No);
        const settings = config(steps, o, name);
        try {
            const reference = JSON.parse(metadata?.baseline?.['Data/Labels.jsn'] || G.LabelsJson(steps, o));
            const actual = JSON.parse(text('Data/Labels.jsn'));
            o.LabelBindings = {}; o.LabelAliases = {};
            for (const [key, section] of Object.entries(reference)) for (const label of section.LabelsArray || []) {
                const current = actual[key]?.LabelsArray?.find(l => l.sLabel === label.sLabel) || actual[key]?.LabelsArray?.find(l => l.sOriginalName === label.sOriginalName);
                if (!current) continue;
                const semantic = Object.entries(metadata?.config?.options?.LabelAliases || {}).find(([, alias]) => alias === label.sLabel)?.[0] || label.sLabel;
                o.LabelBindings[semantic] = { nIndex: current.nIndex, sOriginalName: current.sOriginalName };
                if (semantic !== current.sLabel) o.LabelAliases[semantic] = current.sLabel;
            }
            settings.options = copy(o);
        } catch { issues.push({ kind: 'labels', path: 'Data/Labels.jsn' }); }
        // Metadata is a baseline, never an override of files edited in the robot IDE.
        const baseline = metadata?.baseline || generate(settings, G);
        return { files, original: settings, baseline, issues, metadata, root, name };
    }

    // LCS edit ranges against a common ancestor. Overlapping edits are never silently discarded.
    function edits(base, next) {
        return InoSite.lineEdits(base.split('\n'), next.split('\n'));
    }

    function diffLines(before, after) {
        const left = normalize(before), right = normalize(after);
        const a = left ? left.split('\n') : [], b = right ? right.split('\n') : [];
        const rows = [];
        let i = 0, j = 0;
        const append = (old, fresh, kind) => rows.push({
            before: old === undefined ? null : { number: ++i, text: old, kind: kind === 'same' ? 'same' : 'removed' },
            after: fresh === undefined ? null : { number: ++j, text: fresh, kind: kind === 'same' ? 'same' : 'added' }
        });
        if (!a.length || !b.length) {
            for (let k = 0; k < Math.max(a.length, b.length); k++) append(a[k], b[k], 'changed');
            return rows;
        }
        let prefix = 0, suffix = 0;
        while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
        while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
        const middleA = a.slice(prefix, a.length - suffix), middleB = b.slice(prefix, b.length - suffix);
        const ranges = !middleA.length || !middleB.length
            ? [{ start: 0, end: middleA.length, lines: middleB }]
            : edits(middleA.join('\n'), middleB.join('\n'));
        for (const range of ranges) {
            const edit = { ...range, start: range.start + prefix, end: range.end + prefix };
            while (i < edit.start) append(a[i], b[j], 'same');
            const oldLines = a.slice(edit.start, edit.end);
            for (let k = 0; k < Math.max(oldLines.length, edit.lines.length); k++) append(oldLines[k], edit.lines[k], 'changed');
        }
        while (i < a.length || j < b.length) append(a[i], b[j], 'same');
        return rows;
    }

    function mergeText(base, current, next) {
        if (equal(base, next)) return { text: current, conflict: false };
        if (equal(current, base) || equal(current, next)) return { text: next, conflict: false };
        if (base === undefined || current === undefined || next === undefined) return { text: current, conflict: true };
        const b = comparable(base), c = comparable(current), n = comparable(next);
        const left = edits(b, c), right = edits(b, n), combined = [...left];
        for (const r of right) {
            let duplicate = false;
            for (const l of left) {
                if (JSON.stringify(l) === JSON.stringify(r)) { duplicate = true; continue; }
                if (Math.max(l.start, r.start) < Math.min(l.end, r.end) || (l.start === l.end && l.start >= r.start && l.start <= r.end) || (r.start === r.end && r.start >= l.start && r.start <= l.end)) return { text: current, conflict: true };
            }
            if (!duplicate) combined.push(r);
        }
        const lines = b.split('\n');
        for (const edit of combined.sort((a, b) => b.start - a.start)) lines.splice(edit.start, edit.end - edit.start, ...edit.lines);
        // Restore actual headers instead of exporting the comparison timestamp token.
        const stamp = normalize(current).match(/\bTime\s*=\s*"[^"]*"/g) || normalize(next).match(/\bTime\s*=\s*"[^"]*"/g) || [];
        let index = 0;
        return { text: lines.join('\n').replace(/\bTime\s*=\s*"<TIME>"/g, () => stamp[index++] || 'Time = ""'), conflict: false };
    }

    const absent = Symbol('absent');
    const jsonEqual = (a, b) => {
        const encode = value => JSON.stringify(value, (key, item) => /^(nNumberOfLabels|nLabelId|ProgramFilesCount|RobPointFilesCount|MultiTaskCount)$/.test(key) ? undefined : item);
        return encode(a) === encode(b);
    };
    function mergeValue(b, c, n, path, conflicts) {
        if (jsonEqual(b, n)) return c;
        if (jsonEqual(c, b) || jsonEqual(c, n)) return n;
        if ([b, c, n].every(v => v !== absent && v && typeof v === 'object' && !Array.isArray(v))) {
            const out = {};
            for (const key of new Set([...Object.keys(b), ...Object.keys(c), ...Object.keys(n)])) {
                if (/^(nNumberOfLabels|nLabelId|ProgramFilesCount|RobPointFilesCount|MultiTaskCount)$/.test(key)) continue;
                const value = mergeValue(Object.hasOwn(b, key) ? b[key] : absent, Object.hasOwn(c, key) ? c[key] : absent, Object.hasOwn(n, key) ? n[key] : absent, `${path}.${key}`, conflicts);
                if (value !== absent) out[key] = value;
            }
            return out;
        }
        if ([b, c, n].every(Array.isArray)) {
            const keyOf = (v, i) => v && typeof v === 'object' ? v.sOriginalName || v.EnterProgramFile || `index:${i}` : /Warings|Warnings/.test(path) ? `index:${i}` : typeof v === 'string' ? v : `index:${i}`;
            const maps = [b, c, n].map(a => new Map(a.map((v, i) => [keyOf(v, i), v])));
            const out = [];
            for (const key of new Set([...maps[1].keys(), ...maps[2].keys()])) {
                const value = mergeValue(...maps.map(m => m.has(key) ? m.get(key) : absent), `${path}[${key}]`, conflicts);
                if (value !== absent) out.push(value);
            }
            return out;
        }
        conflicts.push(path); return c;
    }
    function mergeJson(base, current, next) {
        if ([base, current, next].some(v => v === undefined)) return mergeText(base, current, next);
        try {
            if (JSON.stringify(JSON.parse(normalize(base))) === JSON.stringify(JSON.parse(normalize(next)))) return { text: current, conflict: false };
            const conflicts = [], value = mergeValue(...[base, current, next].map(v => JSON.parse(normalize(v))), '', conflicts);
            const fix = obj => {
                if (!obj || typeof obj !== 'object') return;
                if (obj.LabelsArray) { obj.nNumberOfLabels = obj.LabelsArray.length; obj.LabelsArray.forEach((l, i) => l.nLabelId = i); }
                for (const [array, count] of [['ProgramFiles', 'ProgramFilesCount'], ['RobPointFiles', 'RobPointFilesCount'], ['MultiTaskInfos', 'MultiTaskCount']]) if (obj[array]) obj[count] = obj[array].length;
                Object.values(obj).forEach(fix);
            };
            fix(value);
            return { text: JSON.stringify(value, null, 2), conflict: conflicts.length > 0, details: conflicts };
        } catch { return { text: current, conflict: true }; }
    }

    function mergePoints(base, current, next, reset = []) {
        if ([base, current, next].some(v => v === undefined)) return mergeText(base, current, next);
        const parse = value => new Map([...normalize(value).matchAll(/^P\[(\d+)\].*$/gm)].map(m => [m[1], m[0]]));
        const [b, c, n] = [base, current, next].map(parse), conflicts = [], out = new Map(c);
        for (const id of new Set([...b.keys(), ...n.keys()])) {
            if (reset.includes(Math.floor(Number(id) / 100)) && n.has(id)) { out.set(id, n.get(id)); continue; }
            if (n.has(id) && c.has(id)) continue; // Keep taught coordinates, names, configuration and external axes.
            const merged = mergeText(b.get(id), c.get(id), n.get(id));
            if (merged.conflict) conflicts.push(id);
            else if (merged.text === undefined) out.delete(id); else out.set(id, merged.text);
        }
        const headerOf = value => normalize(value).replace(/^P\[\d+\].*\n?/gm, '');
        const header = mergeText(...[base, current, next].map(headerOf));
        if (header.conflict) conflicts.push('ProgramInfo');
        return { text: header.text + [...out.values()].join('\n') + '\n', conflict: conflicts.length > 0, details: conflicts };
    }

    function plan(session, settings, G, overrides = {}, reset = []) {
        const generated = generate(settings, G), files = new Map(session.files), changes = [];
        const base = { ...session.baseline }, next = { ...generated }, renames = new Map();
        for (const old of session.original.steps) {
            const s = settings.steps.find(s => s.id === old.id);
            if (s && stepName(old) !== stepName(s)) renames.set(`${stepName(old)}.pro`, `${stepName(s)}.pro`);
        }
        if (session.name !== settings.name) renames.set(`${session.name}.prj`, `${settings.name}.prj`);
        const rewrite = (text, path) => {
            if (typeof text !== 'string' || !renames.size) return text;
            if (/\.prj$/i.test(path)) {
                try {
                    const obj = JSON.parse(text);
                    const walk = value => {
                        if (typeof value === 'string') return renames.get(value) || value;
                        if (Array.isArray(value)) return value.map(walk);
                        if (value && typeof value === 'object') for (const key of Object.keys(value)) value[key] = walk(value[key]);
                        return value;
                    };
                    return JSON.stringify(walk(obj), null, 2);
                } catch { return text; }
            }
            if (!/\.pro$/i.test(path)) return text;
            const modules = new Map([...renames].filter(([from]) => from.endsWith('.pro')).map(([from, to]) => [from.slice(0, -4), to.slice(0, -4)]));
            text = text.replace(/^(\s*Include\s+)(["'])([^"']+)\2/gim, (all, prefix, quote, file) => prefix + quote + (renames.get(file) || file) + quote);
            text = text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|\b[A-Za-z_]\w*(?=\s*\.)/g, token => modules.get(token) || token);
            return text;
        };
        for (const [from, to] of renames) {
            if (files.has(to) && from !== to) throw new Error('File name already exists: ' + to);
            if (files.has(from)) { files.set(to, files.get(from)); files.delete(from); }
            if (base[from] !== undefined) { base[to] = base[from]; delete base[from]; }
            changes.push({ path: from, target: to, status: 'renamed', conflict: false });
        }
        for (const path of new Set([...Object.keys(base), ...Object.keys(next)])) {
            const old = base[path], originalFile = files.get(path), current = originalFile?.text;
            const renamedCurrent = rewrite(current, path), ancestor = rewrite(old, path);
            let result;
            if (equal(ancestor, next[path]) && renamedCurrent === current && !(reset.length && /(?:^|\/)P(?:\d+)?\.pts$/.test(path))) continue;
            if (/\.(jsn|prj)$/i.test(path)) result = mergeJson(ancestor, renamedCurrent, next[path]);
            else if (/\.pts$/i.test(path)) result = mergePoints(ancestor, renamedCurrent, next[path], reset);
            else result = mergeText(ancestor, renamedCurrent, next[path]);
            if (!result.conflict && result.text === current) continue;
            const status = result.text === undefined ? 'deleted' : originalFile ? 'changed' : 'added';
            changes.push({ path, status, before: current, generated: next[path], ...result });
            if (!result.conflict) {
                if (result.text === undefined) files.delete(path);
                else files.set(path, { text: result.text, bytes: null });
            }
        }
        // Rename references in user-added programs as well, without substring replacement.
        for (const [path, file] of files) if (/\.pro$/i.test(path) && file.text !== null && !Object.hasOwn(base, path)) {
            const text = rewrite(file.text, path);
            if (text !== file.text) { files.set(path, { text, bytes: null }); changes.push({ path, status: 'changed', before: file.text, text, conflict: false }); }
        }
        for (const [path, text] of Object.entries(overrides)) {
            const change = changes.find(c => c.path === path && c.status !== 'renamed');
            if (change) { change.conflict = false; change.text = text; }
            if (text === null) files.delete(path); else files.set(path, { text, bytes: null });
        }
        return { files, changes, generated, config: settings };
    }

    function validate(files) {
        const problems = [], paths = new Map([...files.keys()].map(p => [p.toLowerCase(), p]));
        const modules = new Map([...files].filter(([p]) => /\.pro$/i.test(p)).map(([p, f]) => [p.replace(/\.pro$/i, '').toLowerCase(), f.text || '']));
        if (paths.size !== files.size) problems.push('Duplicate file names.');
        for (const [path, file] of files) {
            if (/\.pro$/i.test(path)) for (const m of (file.text || '').matchAll(/^\s*Include\s+["']([^"']+)["']/gim)) {
                if (!paths.has(m[1].toLowerCase())) problems.push(`${path}: missing Include ${m[1]}`);
            }
            if (/\.pro$/i.test(path)) {
                const code = (file.text || '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*/g, '');
                for (const m of code.matchAll(/\b([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*\(/g)) {
                    const source = modules.get(m[1].toLowerCase());
                    if (source === undefined) problems.push(`${path}: missing module ${m[1]}`);
                    else if (!new RegExp(`\\bFunc\\s+(?:[A-Za-z_]\\w*\\s+)?${m[2]}\\s*\\(`, 'i').test(source)) problems.push(`${path}: missing function ${m[1]}.${m[2]}`);
                }
            }
            if (/\.pts$/i.test(path)) {
                const points = new Set();
                for (const m of (file.text || '').matchAll(/^P\[(\d+)\]/gm)) {
                    if (points.has(m[1])) problems.push(`${path}: duplicate point ${m[1]}`);
                    points.add(m[1]);
                }
            }
            if (/\.prj$/i.test(path)) {
                try { const p = JSON.parse(file.text); for (const n of p.ProgramFiles || []) if (!paths.has(n.toLowerCase())) problems.push(`${path}: missing program ${n}`);
                    for (const n of p.RobPointFiles || []) if (!paths.has(`data/${n}`.toLowerCase()) && !paths.has(n.toLowerCase())) problems.push(`${path}: missing points ${n}`);
                    const ids = new Set();
                    for (const task of p.MultiTaskInfos || []) {
                        if (ids.has(task.TaskId)) problems.push(`${path}: duplicate TaskId ${task.TaskId}`);
                        if (!paths.has(task.EnterProgramFile?.toLowerCase())) problems.push(`${path}: missing task program ${task.EnterProgramFile}`);
                        ids.add(task.TaskId);
                    }
                } catch { problems.push('Invalid JSON: ' + path); }
            }
            if (/\.jsn$/i.test(path)) {
                try { const obj = JSON.parse(file.text); if (/Labels\.jsn$/i.test(path)) {
                    const labels = new Set();
                    for (const section of Object.values(obj)) {
                        const addresses = new Set();
                        for (const label of section.LabelsArray || []) {
                            const key = label.sLabel?.toLowerCase();
                            if (key && labels.has(key)) problems.push(path + ': Duplicate label: ' + label.sLabel);
                            if (addresses.has(label.nIndex)) problems.push(path + ': Duplicate label address: ' + label.sOriginalName);
                            if (key) labels.add(key); addresses.add(label.nIndex);
                        }
                    }
                } } catch { problems.push('Invalid JSON: ' + path); }
            }
        }
        return problems;
    }
    function metadata(settings, baseline) { return JSON.stringify({ format: 'InoRobotGenerator', version: 1, config: settings, baseline }, null, 2); }
    return { META, config, generate, readEntries, open, plan, validate, metadata, diffLines, mergeText, mergeJson, mergePoints, stepName, equal, safePath };
})();
