import { FPS, recordingSize, selectFormat, encodeVideo } from './recording-video.mjs';
import { RecordingCuts, timecode } from './recording-cuts.mjs?v=20261120-5';
import { createRecordingTimeline } from './recording-timeline.mjs?v=20261120-5';
import { uiText, uiFormat } from './ui-language.mjs';

function waitForMedia(video, event, signal, start) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const done = error => {
            video.removeEventListener(event, ready);
            video.removeEventListener('error', failed);
            signal.removeEventListener('abort', aborted);
            if (error) reject(error); else resolve();
        };
        const ready = () => done();
        const failed = () => done(video.error || new Error('Video decode failed'));
        const aborted = () => done(signal.reason);
        video.addEventListener(event, ready);
        video.addEventListener('error', failed);
        signal.addEventListener('abort', aborted, { once: true });
        try { start(); } catch (error) { done(error); }
    });
}

function releaseVideo(video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
}

async function openVideo(url, signal) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    try {
        await waitForMedia(video, 'loadeddata', signal, () => { video.src = url; });
        if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw new Error('Invalid recording');
        return video;
    } catch (error) {
        releaseVideo(video);
        throw error;
    }
}

// Seeking to the middle avoids the millisecond rounding of WebM block timestamps.
function frameTime(video, index) {
    return Math.max(0, Math.min((index + 0.5) / FPS, video.duration - 0.0001));
}

async function openFrameReader(source, signal) {
    if (source.createReader) return source.createReader();
    const video = await openVideo(source.url, signal);
    return {
        async frame(index) {
            const time = frameTime(video, index);
            if (video.currentTime !== time) await waitForMedia(video, 'seeked', signal, () => { video.currentTime = time; });
            return video;
        },
        dispose() { releaseVideo(video); }
    };
}

function drawFrame(context, image, elapsed = null) {
    const { width, height } = context.canvas;
    const imageWidth = image.videoWidth || image.width, imageHeight = image.videoHeight || image.height;
    const sourceWidth = Math.min(imageWidth, imageHeight * width / height);
    const visibleWidth = Math.min(width, height * sourceWidth / imageHeight);
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, (imageWidth - sourceWidth) / 2, 0, sourceWidth, imageHeight,
        (width - visibleWidth) / 2, 0, visibleWidth, height);
    if (elapsed === null || elapsed < 0) return;
    const fontSize = height * 0.055, margin = height * 0.035, pad = fontSize * 0.35;
    const digits = timecode(elapsed);
    context.font = '600 ' + fontSize + 'px Consolas, monospace';
    const boxWidth = context.measureText(digits).width + pad * 2;
    context.fillStyle = 'rgba(12, 18, 20, 0.85)';
    context.fillRect(width - margin - boxWidth, margin, boxWidth, fontSize + pad * 2);
    context.fillStyle = 'white';
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    context.fillText(digits, width - margin - pad, margin + pad + fontSize / 2);
}

async function exportEdit(source, cuts, progress, signal) {
    const reader = await openFrameReader(source, signal);
    try {
        const { width, height } = recordingSize(source.height);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: false });
        const config = source.createReader ? source.config : await selectFormat(width, height);
        return await encodeVideo({ width, height, config, count: cuts.length, progress, signal,
            async draw(frame) {
                drawFrame(context, await reader.frame(cuts.sourceFrame(frame)), cuts.elapsed(frame));
                return canvas;
            }
        });
    } finally {
        reader.dispose();
    }
}

export function createRecordingEditor(dialog, download) {
    const controls = Object.fromEntries([...dialog.querySelectorAll('[data-edit]')].map(node => [node.dataset.edit, node]));
    const preview = controls.preview.getContext('2d', { alpha: false });
    const drafts = new WeakMap();
    let current = null, last = null, file = null, source = null, reader = null, cuts = null;
    let loading = null, saving = null, percent = 0;
    let cursor = 0, following = false, playing = false, trimPreview = null;
    let animation = 0, playStart = 0, playFrame = 0, nextLivePaint = 0;

    const timeline = createRecordingTimeline(controls, {
        seek,
        beginTrim() { pause(); following = false; refresh(); },
        previewTrim(original, position) {
            trimPreview = original;
            controls.position.textContent = timecode(position) + ' / ' + timecode(cuts.length);
            showCursor();
        },
        commitTrim(index, edge, target) {
            cuts.trimEdge(index, edge, target);
            const [first, end] = cuts.segments[index];
            seek(cuts.outputFrame(edge === 'start' ? first : end - 1));
        },
        cancelTrim() { seek(cursor); },
        drawThumbnail: drawFrame,
        openReader(item, signal) {
            if (item.video) return openFrameReader(item, signal);
            // A take renders synchronously. Copy each thumbnail from the preview renderer
            // before its next frame, without allocating another WebGL context.
            return { frame: original => previewFrame(original), dispose() {} };
        }
    });

    function schedule() {
        if (!animation && dialog.open && !timeline.trimming && (playing || source?.running)) animation = requestAnimationFrame(tick);
    }

    function updatePosition() {
        const length = cuts.length, busy = !!(loading || saving);
        controls.seek.max = String(length);
        controls.seek.value = String(cursor);
        const position = timecode(cursor);
        controls.seek.setAttribute('aria-valuetext', position);
        if (trimPreview === null) controls.position.textContent = position + ' / ' + timecode(length);
        controls.clock.disabled = busy || cursor >= length;
        controls['clock-end'].disabled = busy || cuts.stopwatch === null || cursor <= cuts.stopwatch;
        const piece = cuts.pieceAt(cursor);
        controls.split.disabled = busy || cursor <= piece.start || cursor >= piece.end;
        timeline.update(cuts, source, cursor, busy);
    }

    function updateMarks() {
        const length = cuts.length;
        for (const [marker, label, frame] of [['clock-mark', 'clock-time', cuts.stopwatch],
            ['clock-end-mark', 'clock-end-time', cuts.stopwatchEnd]]) {
            controls[marker].hidden = frame === null;
            if (frame !== null) controls[marker].style.left = (100 * frame / length) + '%';
            controls[label].textContent = frame === null ? '—' : timecode(frame);
        }
    }

    function refresh() {
        if (!dialog.open) return;
        controls.empty.hidden = !!source;
        controls.workspace.hidden = !source;
        controls.open.disabled = !!saving;
        controls.source.hidden = !(current || last || file);
        controls.source.disabled = !!saving;
        const sources = { current, last, file };
        for (const option of controls.source.options) {
            option.disabled = option.hidden = !sources[option.value];
        }
        if (source) controls.source.value = source === current ? 'current' : source === last ? 'last' : 'file';
        if (!cuts) return;
        const busy = !!(loading || saving);
        controls.seek.disabled = controls.play.disabled = !!loading;
        controls.play.textContent = playing ? 'Ⅱ' : '▶';
        controls.play.setAttribute('aria-label', uiText(playing ? '영상 일시정지' : '영상 재생'));
        controls.live.hidden = !source.running;
        controls.live.setAttribute('aria-pressed', String(following && !!source.running));
        controls['clear-clock'].disabled = busy || cuts.stopwatch === null;
        controls['hide-clock'].disabled = busy || cuts.stopwatchEnd === null;
        controls['hide-clock'].checked = cuts.hideAfterEnd;
        controls['delete-piece'].disabled = controls['keep-piece'].disabled = busy || cuts.segments.length < 2;
        controls.undo.disabled = busy || !cuts.history.length;
        controls.save.disabled = busy;
        controls.save.textContent = saving ? uiFormat('영상 저장 중 {percent}%', { percent }) : uiText('편집본 저장');
        updateMarks();
        updatePosition();
        schedule();
    }

    function extend() {
        if (!cuts || timeline.trimming || source.frames <= cuts.sourceLength) return false;
        const oldPieces = cuts.segments.length;
        cuts.extend(source.frames);
        if (following) cursor = cuts.length - 1;
        if (oldPieces !== cuts.segments.length) refresh();
        return true;
    }

    function previewFrame(original) {
        reader ??= source.createReader(controls.preview.height);
        return reader.frame(original);
    }

    function paint() {
        if (!dialog.open || !source) return;
        let image = source.video;
        if (image) {
            if (image.seeking || image.readyState < 2) return;
        } else image = previewFrame(trimPreview ?? cuts.sourceFrame(cursor));
        const frame = trimPreview === null ? cursor : cuts.outputFrame(trimPreview);
        drawFrame(preview, image, cuts.elapsed(Math.min(frame, cuts.length - 1)));
    }

    function pause() {
        playing = false;
        cancelAnimationFrame(animation);
        animation = 0;
        source?.video?.pause();
    }

    function showCursor() {
        if (!dialog.open || !source) return;
        const video = source.video;
        if (video) {
            const time = frameTime(video, trimPreview ?? cuts.sourceFrame(cursor));
            if (video.currentTime !== time) { video.currentTime = time; return; }
        }
        paint();
    }

    function seek(frame) {
        pause();
        following = false;
        trimPreview = null;
        extend();
        cursor = Math.max(0, Math.min(cuts.length, frame));
        showCursor();
        refresh();
    }

    function tick(now) {
        animation = 0;
        if (!dialog.open || !source) return;
        const grew = extend();
        if (following && source.running && now >= nextLivePaint) {
            nextLivePaint = now + 1000 / 30;
            paint();
            updatePosition();
            updateMarks();
        } else if (playing && !source.video) {
            const frame = playFrame + Math.max(0, Math.floor((now - playStart) * FPS / 1000));
            if (frame >= cuts.length) { seek(cuts.length); return; }
            if (cursor !== frame) { cursor = frame; paint(); updatePosition(); }
        } else if (playing && !source.video.seeking) {
            const video = source.video;
            const original = Math.floor(video.currentTime * FPS), output = cuts.outputFrame(original);
            if (video.ended || output >= cuts.length) { seek(cuts.length); return; }
            const next = cuts.sourceFrame(output);
            if (next !== original) video.currentTime = frameTime(video, next);
            else { cursor = output; paint(); updatePosition(); }
        }
        if (grew && !following) { updatePosition(); updateMarks(); }
        schedule();
    }

    controls.play.addEventListener('click', () => {
        if (playing) { seek(cursor); return; }
        if (following || cursor === cuts.length) seek(0);
        following = false;
        playing = true;
        playFrame = cursor;
        playStart = performance.now();
        const video = source.video;
        video?.play().catch(() => { if (source?.video === video && playing && video.paused) { pause(); refresh(); } });
        refresh();
    });
    controls.live.addEventListener('click', () => {
        if (following) { seek(cursor); return; }
        pause();
        following = true;
        extend();
        cursor = cuts.length - 1;
        showCursor();
        refresh();
    });
    controls.seek.addEventListener('input', () => seek(Number(controls.seek.value)));
    controls.split.addEventListener('click', () => { cuts.split(cursor); seek(cursor); });
    function cutPiece(keep) {
        const piece = cuts.pieceAt(cursor);
        cuts.cut(piece.start, piece.end, keep);
        seek(keep ? 0 : piece.start);
    }
    controls['delete-piece'].addEventListener('click', () => cutPiece(false));
    controls['keep-piece'].addEventListener('click', () => cutPiece(true));
    controls.undo.addEventListener('click', () => {
        const original = cursor === cuts.length ? cuts.segments.at(-1)[1] : cuts.sourceFrame(cursor);
        cuts.undo();
        seek(cuts.outputFrame(original));
    });
    controls.clock.addEventListener('click', () => { cuts.setStopwatch(cursor); seek(cursor); });
    controls['clock-end'].addEventListener('click', () => { cuts.setStopwatchEnd(cursor); seek(cursor); });
    controls['clear-clock'].addEventListener('click', () => { cuts.setStopwatch(null); seek(cursor); });
    controls['hide-clock'].addEventListener('change', () => { cuts.setHideAfterEnd(controls['hide-clock'].checked); seek(cursor); });

    function select(item) {
        timeline.reset();
        pause();
        if (source) {
            drafts.set(source, { cuts, cursor, following });
            source.video?.removeEventListener('seeked', paint);
        }
        reader?.dispose();
        reader = null;
        source = item;
        if (source) {
            const draft = drafts.get(source);
            cuts = draft?.cuts ?? new RecordingCuts(source.frames);
            cursor = draft?.cursor ?? 0;
            following = source === current && (draft?.following ?? true);
            extend();
            if (following) cursor = cuts.length - 1;
            const size = recordingSize(Math.min(source.video ? 540 : 360, source.height));
            controls.preview.width = size.width;
            controls.preview.height = size.height;
            source.video?.addEventListener('seeked', paint);
            showCursor();
        } else cuts = null;
        refresh();
    }

    async function load(blob, name) {
        loading?.abort();
        pause();
        const job = loading = new AbortController();
        controls.status.textContent = uiText('녹화 파일 여는 중…');
        refresh();
        const url = URL.createObjectURL(blob);
        try {
            const video = await openVideo(url, job.signal);
            if (job.signal.aborted) { releaseVideo(video); job.signal.throwIfAborted(); }
            const old = file;
            file = { video, url, name, height: video.videoHeight, frames: Math.max(1, Math.round(video.duration * FPS)) };
            select(file);
            if (old) { releaseVideo(old.video); URL.revokeObjectURL(old.url); }
            controls.status.textContent = '';
        } catch (error) {
            URL.revokeObjectURL(url);
            if (!job.signal.aborted) controls.status.textContent = uiText('녹화 파일을 열 수 없습니다.');
        } finally {
            if (loading === job) { loading = null; refresh(); }
        }
    }

    controls.source.addEventListener('change', () => {
        loading?.abort();
        controls.status.textContent = '';
        select({ current, last, file }[controls.source.value]);
    });
    controls.open.addEventListener('click', () => controls.file.click());
    controls.file.addEventListener('change', () => {
        const chosen = controls.file.files[0];
        controls.file.value = '';
        if (chosen && !saving) void load(chosen, chosen.name);
    });
    controls.save.addEventListener('click', async () => {
        extend();
        const job = saving = new AbortController();
        const item = source, snapshot = cuts.snapshot();
        percent = 0;
        controls.status.textContent = '';
        refresh();
        try {
            const blob = await exportEdit(item, snapshot, value => {
                if (value !== percent && !job.signal.aborted) { percent = value; refresh(); }
            }, job.signal);
            job.signal.throwIfAborted();
            download(blob, item.name.replace(/\.webm$/i, '') + '-edited.webm');
        } catch (error) {
            if (!job.signal.aborted) controls.status.textContent = uiText('영상을 저장하지 못했습니다.');
        } finally {
            if (saving === job) { saving = null; refresh(); }
        }
    });
    controls.close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        if (dialog.open) return;
        timeline.reset();
        pause();
        reader?.dispose();
        reader = null;
        loading?.abort();
        saving?.abort();
        controls.status.textContent = '';
    });
    dialog.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); if (!timeline.cancel()) dialog.close(); }
        if (!cuts || !controls.timeline.contains(event.target) || timeline.trimming) return;
        let action;
        if (event.key === ' ') action = controls.play;
        if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 's') action = controls.split;
        if (event.key === 'Delete') action = controls['delete-piece'];
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') action = controls.undo;
        if (action) { event.preventDefault(); if (!event.repeat) action.click(); }
    });

    return {
        setTakes(active, completed) {
            const newTake = active && active !== current;
            current = active;
            last = completed;
            if (!source || (source !== current && source !== last && source !== file) || (newTake && (!dialog.open || source !== file))) {
                select(current || last || file);
            } else {
                if (source !== current) following = false;
                extend();
                if (dialog.open) { showCursor(); refresh(); }
            }
        },
        open() {
            if (!dialog.open) dialog.show();
            extend();
            showCursor();
            refresh();
            dialog.focus();
        },
        refresh
    };
}
