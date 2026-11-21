import * as THREE from 'three';
import { SceneRecording } from './scene-recording.mjs?v=20261120-4';
import { renderWithContactAO, disposeContactAO } from './contact-ambient-occlusion.mjs?v=20261120-record';
import { usesSoftwareRasterizer } from './software-renderer.mjs?v=frame-limit-1';
import { uiText, uiFormat } from './ui-language.mjs';
import { FPS, recordingSize, selectFormat, encodeVideo } from './recording-video.mjs';
import { createRecordingEditor } from './recording-editor.mjs?v=20261120-5';

function recordingRenderer(take) {
    const { width, height, display, timeline } = take;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.shadowMap.enabled = display.shadowMap.enabled;
    renderer.shadowMap.type = display.shadowMap.type;
    renderer.toneMapping = display.toneMapping;
    renderer.toneMappingExposure = display.toneMappingExposure;
    renderer.outputColorSpace = display.outputColorSpace;
    let models = [];
    const software = usesSoftwareRasterizer(renderer);
    let matte;
    return {
        frame(time) {
            timeline.play(time);
            const camera = timeline.camera;
            const aspect = camera.isPerspectiveCamera ? camera.aspect : (camera.right - camera.left) / (camera.top - camera.bottom);
            const sourceWidth = height * aspect;
            const visibleWidth = Math.min(width, sourceWidth);
            // Keep the recorded vertical field of view and render its centered horizontal slice.
            camera.setViewOffset(sourceWidth, height, (sourceWidth - visibleWidth) / 2, 0, visibleWidth, height);
            const renderWidth = Math.max(1, Math.round(visibleWidth));
            const canvas = renderer.domElement;
            if (canvas.width !== renderWidth || canvas.height !== height) renderer.setSize(renderWidth, height, false);
            if (models.length !== timeline.modelRoots.size) models = [...timeline.modelRoots];
            if (software) renderer.render(timeline.scene, camera);
            else renderWithContactAO(renderer, timeline.scene, camera, models);
            if (renderWidth === width) return canvas;
            // A narrower source needs side bars to keep its full height at the same scale.
            if (!matte) {
                const output = document.createElement('canvas');
                output.width = width;
                output.height = height;
                matte = output.getContext('2d', { alpha: false });
            }
            matte.fillStyle = 'black';
            matte.fillRect(0, 0, width, height);
            matte.drawImage(canvas, Math.floor((width - renderWidth) / 2), 0);
            return matte.canvas;
        },
        dispose() { disposeContactAO(renderer); renderer.dispose(); renderer.forceContextLoss(); }
    };
}

class SimulationTake {
    constructor(display, size, config, getBeltAnimation) {
        Object.assign(this, size);
        this.display = display;
        this.config = config;
        this.name = 'InoRobot-3D-' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
        this.timeline = new SceneRecording(getBeltAnimation);
        this.readers = 0;
        this.running = false;
        this.retired = false;
    }

    get frames() { return Math.max(1, Math.ceil(this.timeline.time * FPS / 1000)); }

    resume(state, now) {
        this.origin = now - this.timeline.time;
        this.running = true;
        this.sample(state, now, true, true);
    }

    sample(state, now, force = false, discontinuous = false) {
        if (!this.running) return;
        const time = Math.max(this.timeline.time, now - this.origin);
        if (!force && time - this.timeline.time < 1000 / FPS - 1) return;
        this.timeline.sample(state.scene, state.camera, time, state.models, discontinuous);
    }

    pause(state) {
        try { this.sample(state, performance.now(), true); }
        finally { this.running = false; }
    }

    createReader(maxHeight = this.height) {
        const size = recordingSize(Math.min(maxHeight, this.height));
        const view = recordingRenderer({ ...size, display: this.display, timeline: this.timeline });
        this.readers++;
        return {
            frame: frame => view.frame(frame * 1000 / FPS),
            dispose: () => {
                view.dispose();
                if (--this.readers === 0 && this.retired) this.timeline.dispose();
            }
        };
    }

    retire() {
        this.retired = true;
        if (!this.readers) this.timeline.dispose();
    }

    async encodeOriginal(progress) {
        const revision = this.timeline.serial;
        if (this.cached?.revision === revision) return this.cached.blob;
        const reader = this.createReader();
        try {
            const blob = await encodeVideo({ width: this.width, height: this.height, config: this.config,
                count: this.frames, draw: reader.frame, progress });
            if (this.timeline.serial === revision && !this.retired) this.cached = { revision, blob };
            return blob;
        } finally {
            reader.dispose();
        }
    }
}

export function createViewRecording({ button, editButton, editorDialog, state, requestRender, download, status, getBeltAnimation }) {
    const doc = button.ownerDocument;
    const finish = doc.getElementById('view-record-end');
    const save = doc.getElementById('view-record-save'), startLabel = button.querySelector('[data-record-label]');
    const editor = createRecordingEditor(editorDialog, download);
    let current = null, last = null, starting = false, saving = false, percent = 0;

    function refresh() {
        button.disabled = starting;
        button.setAttribute('aria-pressed', String(!!current?.running));
        const label = uiText(current?.running ? '녹화 정지' : current ? '녹화 재개' : '녹화 시작');
        if (startLabel.textContent !== label) startLabel.textContent = label;
        finish.disabled = !current;
        save.disabled = saving || !(current || last);
        const saveLabel = saving ? uiFormat('영상 저장 중 {percent}%', { percent }) : uiText('녹화 저장');
        if (save.textContent !== saveLabel) save.textContent = saveLabel;
        editor.refresh();
    }

    function publish() {
        editor.setTakes(current, last);
        refresh();
    }

    function report(error) {
        console.error('Simulation recording failed', error);
        status(error.message === '이 브라우저에서는 시뮬레이션 녹화를 지원하지 않습니다.'
            ? error.message : '영상을 저장하지 못했습니다.', '#ef4444');
    }

    button.addEventListener('click', async () => {
        if (starting) return;
        try {
            if (current?.running) {
                current.pause(state);
            } else if (!current) {
                starting = true;
                refresh();
                const display = state.renderer, size = recordingSize(display.domElement.height);
                const config = await selectFormat(size.width, size.height);
                const take = new SimulationTake(display, size, config, getBeltAnimation);
                try { take.resume(state, performance.now()); }
                catch (error) { take.retire(); throw error; }
                current = take;
            } else current.resume(state, performance.now());
            requestRender();
        } catch (error) {
            if (current) current.running = false;
            report(error);
        } finally {
            starting = false;
            publish();
        }
    });
    finish.addEventListener('click', () => {
        if (!current) return;
        try { current.pause(state); } catch (error) { report(error); }
        const old = last;
        last = current;
        current = null;
        publish();
        old?.retire();
    });
    save.addEventListener('click', async () => {
        const take = current || last;
        if (!take || saving) return;
        saving = true;
        percent = 0;
        refresh();
        try {
            take.sample(state, performance.now(), true);
            const blob = await take.encodeOriginal(value => {
                if (percent !== value) { percent = value; refresh(); }
            });
            download(blob, take.name);
        } catch (error) { report(error); }
        finally { saving = false; refresh(); }
    });
    editButton.addEventListener('click', () => {
        if (editButton.ownerDocument !== editorDialog.ownerDocument) editorDialog.ownerDocument.defaultView.focus();
        editor.open();
    });
    refresh();
    return {
        get active() { return !!current?.running; },
        sample(now) {
            try { current?.sample(state, now); }
            catch (error) { current.running = false; publish(); report(error); }
        },
        refresh
    };
}
