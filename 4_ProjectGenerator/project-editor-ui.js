'use strict';
// Keep import/review state separate from the existing code editor's edit-mode flag.
window.ProjectEditUI = (() => {
    const $ = id => document.getElementById(id);
    const t = text => uiText(text);
    const defaults = cloneOptions(state.options);
    let session = null, importedEntries = null, pendingPlan = null;
    let workbook = null;
    let diffGeneration = 0;
    let manuals = {}, resolutions = {}, reset = [], cacheKey = '', cached = null;
    const settings = () => ProjectEditor.config(state.steps, state.options, $('prjName').value || state.projectName);
    const conflictSignature = (change, current) => JSON.stringify([change.before, change.generated, change.text, current].map(value =>
        typeof value === 'string' ? value.replace(/\bTime\s*=\s*"[^"]*"/g, 'Time="<TIME>"') : value));
    const button = (text, action, parent) => {
        const el = document.createElement('button'); el.type = 'button'; el.textContent = t(text); el.onclick = action;
        if (parent) parent.appendChild(el); return el;
    };
    function notice(message, error = false) {
        $('projectEditStatus').hidden = false;
        $('projectEditMessage').textContent = message;
        $('projectEditMessage').classList.toggle('edit-error', error);
    }
    function slots() {
        const used = new Set(state.steps.filter(s => s.WorkType === 'Stage' && s.StageSlot).map(s => s.StageSlot));
        for (const s of state.steps) if (s.WorkType === 'Stage' && !s.StageSlot) {
            let slot = 1; while (used.has(slot)) slot++;
            s.StageSlot = slot; used.add(slot);
        }
    }
    function build() {
        slots();
        const current = settings(), key = JSON.stringify([current, manuals, resolutions, reset, workbook?.signature, workbook?.choice]);
        if (key === cacheKey && cached) return cached;
        const result = ProjectEditor.plan(session, current, Generator, {}, reset);
        for (const [originalPath, record] of Object.entries(manuals)) {
            const step = record.stepId && state.steps.find(s => s.id === record.stepId);
            const path = step ? `${step.ProcessName}.pro` : originalPath;
            const next = result.files.get(path)?.text;
            const merged = ProjectEditor.mergeText(record.base, record.text, next);
            let change = result.changes.find(c => c.path === path && c.status !== 'renamed');
            if (!change) { change = { path, before: session.files.get(path)?.text, generated: next, status: 'changed' }; result.changes.push(change); }
            Object.assign(change, merged);
            if (!merged.conflict) result.files.set(path, { text: merged.text, bytes: null });
        }
        for (const change of result.changes) {
            const resolution = resolutions[change.path];
            // A choice only applies to the exact conflict the user reviewed.
            if (resolution && resolution.signature === conflictSignature(change, current)) {
                change.conflict = false; change.text = resolution.text;
                if (resolution.text === null) result.files.delete(change.path);
                else result.files.set(change.path, { text: resolution.text, bytes: null });
            }
        }
        if (workbook && workbook.signature === JSON.stringify(current)) {
            result.changes.push({ path: workbook.path, status: 'changed', binary: true, conflict: !workbook.choice });
            if (workbook.choice === 'new') result.files.set(workbook.path, { bytes: workbook.bytes, text: null });
        }
        cacheKey = key; cached = result; return result;
    }
    function relative(file) {
        if (session.files.has(file)) return file;
        if (file === 'Remote_IO_mapping.dat' || file.endsWith('.pro') || file.endsWith('.prj')) return file;
        return `Data/${file}`;
    }
    function fileContent(file) {
        const result = build(), path = relative(file);
        const conflict = result.changes.find(c => c.path === path && c.conflict);
        return conflict?.text ?? result.files.get(path)?.text ?? '';
    }
    function preview() {
        try {
            const file = $('fileSelector').value;
            const text = fileContent(file);
            $('tableContainer').classList.add('opacity-0', 'pointer-events-none');
            $('tableContainer').replaceChildren();
            $('btnToggleEdit').disabled = file === 'Remote_IO_mapping.dat';
            showSourceCode(text);
        } catch (error) { notice(error.message, true); }
    }
    function captureEdit() {
        if (!session) return false;
        const path = relative($('fileSelector').value);
        if (!manuals[path]) manuals[path] = { base: fileContent($('fileSelector').value), text: '', stepId: state.steps.find(s => `${s.ProcessName}.pro` === path)?.id };
        manuals[path].text = $('codeEditor').value;
        cacheKey = ''; return true;
    }
    function nextNumber() {
        const last = Math.max(0, ...state.steps.map(s => s.No));
        if (last < 15) return last + 1;
        const free = Array.from({ length: 15 }, (_, i) => i + 1).filter(n => !state.steps.some(s => s.No === n));
        if (!free.length) return null;
        const value = Number(prompt(t('Choose an unused process number:') + ' ' + free.join(', ')));
        return free.includes(value) ? value : null;
    }
    function decorate() {
        if (!session) return;
        slots();
        addFiles();
        for (const [index, row] of [...$('stepsList').children].entries()) {
            const s = state.steps[index], old = session.original.steps.find(step => step.id === s.id);
            const signature = step => JSON.stringify(['No', 'WorkType', 'WorkMethod', 'ToolType', 'VisionUse', 'ExtraWaitCount', 'TrayXCount', 'TrayYCount', 'TrayPitchX', 'TrayPitchY', 'StageSlot'].map(key => step[key]).concat(ProjectEditor.stepName(step)));
            const status = old ? signature(old) === signature(s) ? 'Unchanged' : 'Changed' : 'Added';
            const detail = document.createElement('div'); detail.className = 'project-step-detail';
            const label = document.createElement('span'); label.textContent = t(status) + ' · ' + s.ProcessName; detail.appendChild(label);
            const waits = document.createElement('label'); waits.textContent = t('Extra wait positions') + ' ';
            const count = document.createElement('input'); count.type = 'number'; count.min = '0'; count.max = '8'; count.value = s.ExtraWaitCount || 0;
            count.setAttribute('aria-label', t('Extra wait positions'));
            count.onchange = () => {
                const n = Number(count.value);
                if (!Number.isInteger(n) || n < 0 || n > 8) { count.value = s.ExtraWaitCount; return; }
                s.ExtraWaitCount = n; renderSteps();
            };
            waits.appendChild(count); detail.appendChild(waits);
            if (Generator.UsesVisionSocket(s)) button('Socket settings', () => openVisionModal(index), detail);
            button('Reset process points', () => {
                if (confirm(t('Reset taught points for this process in every recipe?'))) {
                    if (!reset.includes(s.No)) reset.push(s.No); preview(); notice(t('Point reset added to review.'));
                }
            }, detail);
            row.appendChild(detail);
        }
        const removed = session.original.steps.filter(old => !state.steps.some(s => s.id === old.id));
        $('projectDeleted').replaceChildren();
        for (const s of removed) {
            const line = document.createElement('div'); line.textContent = t('Pending deletion') + ` · P${s.No} · ${s.ProcessName} `;
            button('Undo', () => {
                if (state.steps.some(step => step.No === s.No)) { notice(t('This process number is already in use.'), true); return; }
                const { ProcessName, ...fields } = s;
                state.steps.push(Object.assign(new ProcessStep(s.No), JSON.parse(JSON.stringify(fields))));
                state.steps.sort((a, b) => a.No - b.No);
                const cfg = session.original.options.VisionConfigs[s.id]; if (cfg) state.options.VisionConfigs[s.id] = { ...cfg };
                renderSteps();
            }, line);
            $('projectDeleted').appendChild(line);
        }
    }
    function addFiles() {
        if (!session) return;
        const sel = $('fileSelector'), selected = sel.value;
        sel.querySelector('[data-imported-files]')?.remove();
        const known = new Set([...sel.options].map(o => relative(o.value)));
        const group = document.createElement('optgroup'); group.label = t('Existing content'); group.dataset.importedFiles = '';
        for (const [path, file] of session.files) {
            if (file.text === null || path === ProjectEditor.META || known.has(path)) continue;
            if (session.original.steps.some(s => `${s.ProcessName}.pro` === path)) continue;
            if (path.endsWith('.prj')) continue;
            group.appendChild(new Option(path, path));
        }
        group.appendChild(new Option(`${settings().name}.prj`, `${settings().name}.prj`));
        sel.appendChild(group);
        if ([...sel.options].some(o => o.value === selected)) sel.value = selected;
    }
    function setSession(next) {
        // Commit imported state only after parsing and validation succeed.
        session = next; manuals = {}; resolutions = {}; reset = []; workbook = null; cacheKey = ''; cached = null;
        state.steps = next.original.steps.map(s => {
            const { ProcessName, ...fields } = s;
            return Object.assign(new ProcessStep(s.No), fields);
        });
        state.options = cloneOptions(next.original.options); state.optionsDraft = null;
        state.projectName = next.name; $('prjName').value = next.name;
        state.userEdits = {}; state.labelOverrides = {}; state.ptsOverrides = {}; state.warningOverrides = {};
        state.editMode = false;
        const model = $('cmbRobotModel');
        if (![...model.options].some(o => o.value === state.options.RobotName)) model.add(new Option(state.options.RobotName, state.options.RobotName));
        model.value = state.options.RobotName;
        $('projectImportPanel').hidden = false; $('btnNewProject').hidden = false;
        $('btnGenerate').textContent = t('Review modified project');
        renderSteps(); renderIssues();
        notice(next.name + ' · ' + t('Project loaded. Existing files and taught points will be preserved.'));
    }
    function renderIssues() {
        const box = $('projectImportIssues'); box.replaceChildren();
        if (!session.issues.length) return;
        const info = document.createElement('p'); info.textContent = t('Check the original settings marked below before making changes.'); box.appendChild(info);
        for (const issue of session.issues) {
            const line = document.createElement('div');
            const s = state.steps.find(s => s.id === issue.id);
            line.textContent = s ? `P${s.No}: ${issue.fields.join(', ')}` : issue.path;
            if (issue.kind === 'unmapped') button('Identify process', () => {
                const no = nextNumber(); if (!no) return;
                const step = new ProcessStep(no); step.ProcessName = issue.path.replace(/\.pro$/i, '');
                state.steps.push(step); issue.kind = 'step'; issue.id = step.id; issue.fields = ['WorkType', 'WorkMethod', 'ToolType'];
                renderSteps(); renderIssues();
            }, line);
            box.appendChild(line);
        }
        button('Confirm original settings', () => {
            if (session.issues.some(i => i.kind === 'unmapped')) { notice(t('Identify the remaining processes first.'), true); return; }
            if (session.issues.some(i => i.kind === 'labels')) { notice(t('Labels.jsn could not be read. Repair the file and import again.'), true); return; }
            session.original = settings();
            if (!session.metadata) session.baseline = ProjectEditor.generate(session.original, Generator);
            session.issues = []; cacheKey = ''; renderIssues(); renderSteps();
            notice(t('Original settings confirmed. You can now modify the project.'));
        }, box);
    }
    async function importFiles(input) {
        try {
            notice(t('Reading project...'));
            const entries = await ProjectEditor.readEntries([...input], JSZip);
            const paths = [...entries.keys()].filter(path => /\.prj$/i.test(path));
            if (!paths.length) throw new Error(t('No .prj file found. Select the whole project folder or ZIP.'));
            if (paths.length === 1) setSession(ProjectEditor.open(entries, paths[0], defaults, Generator));
            else {
                importedEntries = entries;
                const select = $('projectImportSelect'); select.replaceChildren();
                paths.forEach(path => select.add(new Option(path, path)));
                $('projectImportChoice').hidden = false;
                notice(t('Choose the project to modify.'));
            }
        } catch (error) { notice(error.message, true); }
    }
    async function review() {
        if (session.issues.length) { notice(t('Confirm the original settings before exporting.'), true); $('projectImportIssues').scrollIntoView(); return; }
        try {
            validateIdentifier(settings().name, 'Project name');
            if (!state.steps.length) throw new Error(t('At least one process step is required.'));
            const names = new Set(['main', 'PLC_internal', 'PLC_TCP_Speed', 's01_initial', 's02_offset', 's03_teach_mode', 's04_Tool_Control'].map(n => n.toLowerCase()));
            for (const s of state.steps) {
                const name = validateIdentifier(s.ProcessName, 'Process name').toLowerCase();
                if (names.has(name)) throw new Error(t('Process names must be unique.')); names.add(name);
                Generator.ExtraWaitCount(s); if (Generator.IsTray(s)) Generator.TraySettings(s);
                if (state.options.VisionConfigs[s.id]) validateVisionEndpoint(state.options.VisionConfigs[s.id]);
            }
            const current = settings();
            const usesTray = config => config.steps.some(Generator.UsesTrayOffset);
            if (usesTray(session.original) !== usesTray(current) || session.original.options.LabelAliases?.xwTray_index !== current.options.LabelAliases?.xwTray_index) {
                const path = [...session.files.keys()].find(path => /(?:^|\/)InoRobot_IO_Map[^/]*\.xlsx$/i.test(path));
                if (path && workbook?.signature !== JSON.stringify(current)) {
                    workbook = { path, signature: JSON.stringify(current), choice: null, bytes: await buildIOMapExcel() };
                    cacheKey = '';
                }
            }
            pendingPlan = build();
            renderReview(); $('projectReviewDialog').showModal();
        } catch (error) { notice(error.message, true); }
    }
    function renderReview(selectedPath) {
        const list = $('projectReviewFiles'); list.replaceChildren();
        const unresolved = pendingPlan.changes.filter(c => c.conflict).length;
        $('projectReviewSummary').textContent = `${pendingPlan.changes.length} ${t('file changes')} · ${unresolved} ${t('unresolved conflicts')}`;
        $('projectDownload').disabled = unresolved > 0;
        const modelChanged = session.original.options.RobotName !== state.options.RobotName;
        $('projectModelNotice').hidden = !modelChanged;
        if (!pendingPlan.changes.length) $('projectReviewSummary').textContent = t('No changes. Existing files will be included as they are.');
        for (const change of pendingPlan.changes) {
            const item = button((change.conflict ? '⚠ ' : '') + t(change.status) + ' · ' + change.path + (change.target ? ' → ' + change.target : ''), () => showChange(change), list);
            item.dataset.path = change.path;
        }
        const change = pendingPlan.changes.find(c => c.path === selectedPath) || pendingPlan.changes[0];
        if (change) showChange(change);
        else { renderDiff('', ''); $('projectResolveActions').hidden = true; $('projectEditGenerated').hidden = true; }
    }
    function renderDiff(before, after) {
        const rows = ProjectEditor.diffLines(before, after);
        const generation = ++diffGeneration;
        for (const [id, side] of [['projectReviewBefore', 'before'], ['projectReviewGenerated', 'after']]) {
            const pane = $(id), lines = document.createElement('div'); lines.className = 'project-diff-lines';
            for (const row of rows) {
                const value = row[side], line = document.createElement('div');
                line.className = `project-diff-line project-diff-${value?.kind || 'empty'}`;
                const number = document.createElement('span'); number.className = 'project-diff-number'; number.textContent = value?.number ?? '';
                const marker = document.createElement('span'); marker.className = 'project-diff-marker';
                marker.textContent = value?.kind === 'removed' ? '−' : value?.kind === 'added' ? '+' : '';
                const code = document.createElement('span'); code.className = 'project-diff-text'; code.textContent = value?.text || '\u00a0';
                if (value) line.dataset.line = value.number;
                line.append(number, marker, code); lines.appendChild(line);
            }
            pane.replaceChildren(lines); pane.scrollTop = 0; pane.scrollLeft = 0;
        }
        const firstChange = rows.findIndex(row => row.before?.kind === 'removed' || row.after?.kind === 'added');
        requestAnimationFrame(() => {
            if (generation !== diffGeneration) return;
            for (const id of ['projectReviewBefore', 'projectReviewGenerated']) $(id).scrollTop = Math.max(0, firstChange - 3) * 20;
        });
        $('projectReviewGenerated').hidden = false;
        $('projectReviewEdit').hidden = true;
        $('projectUseEdited').hidden = true;
    }
    function showChange(change) {
        $('projectReviewPath').textContent = change.path;
        const before = change.status === 'renamed' ? session.files.get(change.path)?.text : change.before;
        const proposed = change.status === 'renamed' ? pendingPlan.files.get(change.target)?.text
            : change.conflict ? change.generated : change.text;
        renderDiff(before ?? '', proposed ?? '');
        $('projectReviewEdit').value = proposed ?? '';
        $('projectEditGenerated').hidden = !change.conflict || Boolean(change.binary);
        $('projectResolveActions').hidden = !change.conflict;
        if (change.binary) {
            renderDiff(t('Existing IO workbook'), t(workbook.choice === 'old' ? 'Existing IO workbook' : 'New IO workbook generated from current settings'));
        }
        for (const item of $('projectReviewFiles').children) item.setAttribute('aria-pressed', String(item.dataset.path === change.path));
        $('projectEditGenerated').onclick = () => {
            $('projectReviewGenerated').hidden = true; $('projectReviewEdit').hidden = false;
            $('projectUseEdited').hidden = false; $('projectEditGenerated').hidden = true; $('projectReviewEdit').focus();
        };
        $('projectUseOld').onclick = () => resolve(change, change.binary ? '__workbook_old__' : change.before ?? null);
        $('projectUseNew').onclick = () => resolve(change, change.binary ? '__workbook_new__' : change.generated ?? null);
        $('projectUseEdited').onclick = () => resolve(change, $('projectReviewEdit').value);
    }
    function resolve(change, text) {
        if (change.binary) {
            workbook.choice = text === '__workbook_new__' ? 'new' : 'old';
            cacheKey = ''; pendingPlan = build(); renderReview(change.path); return;
        }
        resolutions[change.path] = { signature: conflictSignature(change, settings()), text };
        cacheKey = ''; pendingPlan = build(); renderReview(change.path);
    }
    async function download() {
        const btn = $('projectDownload'); btn.disabled = true;
        try {
            const result = build();
            if (result.changes.some(c => c.conflict)) throw new Error(t('Resolve all conflicts before exporting.'));
            const problems = ProjectEditor.validate(result.files);
            if (problems.length) throw new Error(problems.join('\n'));
            const zip = new JSZip(), folder = zip.folder(result.config.name);
            for (const [path, file] of result.files) {
                ProjectEditor.safePath(path);
                // Unchanged files use their original bytes, including binary attachments.
                folder.file(path, file.bytes || String(file.text ?? '').replace(/\r?\n/g, '\r\n'));
            }
            folder.file(ProjectEditor.META, ProjectEditor.metadata(result.config, result.generated));
            saveAs(await zip.generateAsync({ type: 'blob' }), `${result.config.name}_modified.zip`);
            $('projectReviewDialog').close(); notice(t('Modified project ZIP exported.')); preview();
        } catch (error) { $('projectReviewSummary').textContent = error.message; }
        finally { btn.disabled = Boolean(pendingPlan?.changes.some(c => c.conflict)); }
    }
    function newProject() {
        if (!confirm(t('Close this modified project and start a new project?'))) return;
        session = null; manuals = {}; resolutions = {}; reset = []; workbook = null; cacheKey = ''; cached = null;
        state.steps = []; state.options = cloneOptions(defaults); state.userEdits = {}; state.labelOverrides = {};
        state.ptsOverrides = {}; state.warningOverrides = {}; state.editMode = false; state.optionsDraft = null;
        const date = new Date();
        state.projectName = `InoProject_${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        $('prjName').value = state.projectName;
        $('cmbRobotModel').value = defaults.RobotName; $('btnNewProject').hidden = true;
        $('projectImportPanel').hidden = true; $('projectDeleted').replaceChildren();
        $('btnGenerate').textContent = t('Generate Project'); notice(t('New project mode')); $('projectEditStatus').hidden = true; addStep();
    }
    function init() {
        const container = document.querySelector('.generator-main-grid');
        const panel = document.createElement('section'); panel.id = 'projectEditStatus'; panel.className = 'project-edit-status glass'; panel.hidden = true;
        panel.innerHTML = `<input id="projectZipInput" type="file" accept=".zip" hidden><input id="projectFolderInput" type="file" webkitdirectory multiple hidden>
            <p id="projectEditMessage" role="status"></p>
            <div id="projectImportChoice" hidden><select id="projectImportSelect"></select><button id="projectImportOpen">${t('Open project')}</button></div>
            <div id="projectImportPanel" hidden><div id="projectImportIssues"></div><div id="projectDeleted"></div></div>`;
        container.before(panel);
        const dialog = document.createElement('dialog'); dialog.id = 'projectReviewDialog';
        dialog.innerHTML = `<div class="project-review-header"><strong>${t('Review modified project')}</strong><button id="projectReviewClose">${t('Close')}</button></div>
            <p id="projectReviewSummary" role="status"></p><p id="projectModelNotice" hidden>${t('Robot model changed. Taught coordinates are preserved without conversion. Check them for the selected robot.')}</p>
            <div class="project-diff-legend"><span class="project-diff-removed">− ${t('Removed lines')}</span><span class="project-diff-added">+ ${t('Added lines')}</span></div>
            <div class="project-review-layout"><nav id="projectReviewFiles" aria-label="${t('Changed files')}"></nav><div class="project-review-code"><strong id="projectReviewPath"></strong><div class="project-review-columns">
            <section class="project-review-pane"><strong id="projectBeforeLabel">${t('Existing')}</strong><div id="projectReviewBefore" class="project-diff-view" role="region" tabindex="0" aria-labelledby="projectBeforeLabel"></div></section>
            <section class="project-review-pane"><div class="project-pane-heading"><strong id="projectGeneratedLabel">${t('New generated')}</strong><button id="projectEditGenerated" type="button" hidden>${t('Edit')}</button></div><div id="projectReviewGenerated" class="project-diff-view" role="region" tabindex="0" aria-labelledby="projectGeneratedLabel"></div><textarea id="projectReviewEdit" aria-labelledby="projectGeneratedLabel" wrap="off" spellcheck="false" hidden></textarea></section></div>
            <div id="projectResolveActions"><button id="projectUseOld">${t('Keep existing')}</button><button id="projectUseNew">${t('Use generated')}</button><button id="projectUseEdited">${t('Apply edited result')}</button></div></div></div>
            <div class="project-review-footer"><button id="projectDownload">${t('Download modified ZIP')}</button></div>`;
        document.body.appendChild(dialog);
        const importButton = $('btnImportProject'), importMenu = $('projectImportMenu');
        const closeImport = () => { importMenu.hidden = true; importButton.setAttribute('aria-expanded', 'false'); };
        importButton.onclick = () => { importMenu.hidden = !importMenu.hidden; importButton.setAttribute('aria-expanded', String(!importMenu.hidden)); };
        importButton.onkeydown = event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); importMenu.hidden = false; importButton.setAttribute('aria-expanded', 'true'); $('btnImportZip').focus(); }
        };
        $('projectImportControl').onkeydown = event => {
            if (event.key === 'Escape') { closeImport(); importButton.focus(); }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                if (event.target === importButton) return;
                event.preventDefault(); (event.target === $('btnImportZip') ? $('btnImportFolder') : $('btnImportZip')).focus();
            }
        };
        document.addEventListener('click', event => { if (!$('projectImportControl').contains(event.target)) closeImport(); });
        $('btnImportZip').onclick = () => { closeImport(); $('projectZipInput').click(); };
        $('btnImportFolder').onclick = () => { closeImport(); $('projectFolderInput').click(); };
        for (const [left, right] of [['projectReviewBefore', 'projectReviewGenerated'], ['projectReviewGenerated', 'projectReviewBefore']]) {
            $(left).onscroll = () => { if ($(right).scrollTop !== $(left).scrollTop) $(right).scrollTop = $(left).scrollTop; };
        }
        for (const id of ['projectZipInput', 'projectFolderInput']) $(id).onchange = async event => {
            const input = event.target; if (input.files.length) await importFiles(input.files); input.value = '';
        };
        $('projectImportOpen').onclick = () => {
            try { setSession(ProjectEditor.open(importedEntries, $('projectImportSelect').value, defaults, Generator)); $('projectImportChoice').hidden = true; }
            catch (error) { notice(error.message, true); }
        };
        $('btnNewProject').onclick = newProject;
        $('projectReviewClose').onclick = () => dialog.close(); $('projectDownload').onclick = download;
        const originalInput = $('codeEditor').oninput;
        $('codeEditor').oninput = event => { if (!captureEdit()) originalInput(event); };
        if (window.InoRobotI18n) { InoRobotI18n.apply(panel); InoRobotI18n.apply(dialog); }
    }
    document.addEventListener('DOMContentLoaded', init);
    return { get session() { return session; }, nextNumber, decorate, addFiles, preview, fileContent, review, importFiles, build, setSession };
})();
