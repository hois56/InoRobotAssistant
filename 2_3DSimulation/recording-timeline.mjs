import { timecode } from './recording-cuts.mjs?v=20261120-5';
import { uiFormat } from './ui-language.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const percent = (frame, length) => (100 * frame / length) + '%';

// Thumbnail decoding has its own queue so scrubbing a file never moves its decoder.
function createFilmstrip(canvas, openReader, drawThumbnail) {
    let session = null;
    function reset() {
        if (!session) return;
        session.controller.abort();
        session.reader?.dispose();
        session.reader = null;
        session = null;
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    async function draw(job) {
        job.busy = true;
        const signal = job.controller.signal;
        try {
            if (!job.reader) {
                const reader = await openReader(job.source, signal);
                if (signal.aborted) { reader.dispose(); return; }
                job.reader = reader;
            }
            while (job.pending) {
                const frames = job.pending;
                job.pending = null;
                const strip = canvas.ownerDocument.createElement('canvas');
                strip.width = frames.length * 96;
                strip.height = 54;
                const context = strip.getContext('2d');
                for (const [index, frame] of frames.entries()) {
                    let tile = job.tiles.get(frame);
                    if (!tile) {
                        const image = await job.reader.frame(frame);
                        signal.throwIfAborted();
                        tile = canvas.ownerDocument.createElement('canvas');
                        tile.width = 96;
                        tile.height = 54;
                        drawThumbnail(tile.getContext('2d'), image);
                        if (job.tiles.size >= 32) job.tiles.delete(job.tiles.keys().next().value);
                        job.tiles.set(frame, tile);
                    }
                    context.drawImage(tile, index * 96, 0);
                    await new Promise(resolve => setTimeout(resolve, 0));
                    signal.throwIfAborted();
                    if (job.pending) break;
                }
                if (!job.pending) {
                    canvas.width = strip.width;
                    canvas.height = strip.height;
                    canvas.getContext('2d').drawImage(strip, 0, 0);
                }
            }
        } catch (error) {
            if (!signal.aborted) {
                console.warn('Recording thumbnails unavailable', error);
                job.reader?.dispose();
                job.reader = null;
            }
        } finally {
            job.busy = false;
        }
    }

    return {
        reset,
        update(source, cuts) {
            if (source !== session?.source) {
                reset();
                session = { source, controller: new AbortController(), tiles: new Map(), nextUpdate: 0 };
            }
            const count = clamp(Math.round(canvas.clientWidth / 78), 2, 10);
            if (session.segments === cuts.segments && session.count === count) return;
            const now = performance.now();
            if (source.running && session.pieceCount === cuts.segments.length && now < session.nextUpdate) return;
            Object.assign(session, { segments: cuts.segments, count, pieceCount: cuts.segments.length, nextUpdate: now + 1200 });
            const length = cuts.length;
            session.pending = Array.from({ length: count }, (_, i) => cuts.sourceFrame(Math.floor((i + 0.5) * length / count)));
            if (!session.busy) void draw(session);
        }
    };
}

export function createRecordingTimeline(controls, { seek, beginTrim, previewTrim, commitTrim, cancelTrim, openReader, drawThumbnail }) {
    const { timeline, ruler, pieces, handles, guide, playhead } = controls;
    const filmstrip = createFilmstrip(controls.filmstrip, openReader, drawThumbnail);
    let cuts = null, source = null, shown = null, selected = -1, busy = false, gesture = null;
    const resize = new ResizeObserver(() => {
        if (cuts && timeline.clientWidth) filmstrip.update(source, cuts);
    });
    resize.observe(timeline);

    function layout(length) {
        while (pieces.children.length > cuts.segments.length) pieces.lastChild.remove();
        let offset = 0;
        cuts.segments.forEach(([first, end], index) => {
            let piece = pieces.children[index];
            if (!piece) {
                piece = pieces.ownerDocument.createElement('span');
                piece.dataset.piece = String(index);
                piece.setAttribute('role', 'img');
                pieces.append(piece);
            }
            const duration = end - first;
            piece.style.left = percent(offset, length);
            piece.style.width = percent(duration, length);
            piece.title = timecode(offset) + ' – ' + timecode(offset + duration);
            piece.setAttribute('aria-label', uiFormat('조각 {number}', { number: index + 1 }) + ', ' + piece.title);
            offset += duration;
        });
        [...ruler.children].forEach((label, i) => { label.textContent = timecode(Math.round(i * length / 4)); });
    }

    function positionHandles(start, end, length) {
        handles.style.left = percent(start, length);
        handles.style.width = percent(end - start, length);
    }

    function drawHandles(piece, length) {
        const overlays = pieces.children;
        overlays[selected]?.classList.remove('is-selected');
        overlays[piece.index].classList.add('is-selected');
        selected = piece.index;
        positionHandles(piece.start, piece.end, length);
        for (const handle of handles.children) {
            const { min, max, value } = cuts.edgeRange(selected, handle.dataset.edge);
            handle.setAttribute('aria-valuemin', min);
            handle.setAttribute('aria-valuemax', max);
            handle.setAttribute('aria-valuenow', value);
            handle.setAttribute('aria-valuetext', timecode(value));
            handle.setAttribute('aria-disabled', String(busy));
            handle.tabIndex = busy ? -1 : 0;
        }
    }

    function update(model, item, cursor, disabled) {
        cuts = model;
        source = item;
        const changed = shown !== cuts.segments, length = cuts.length;
        if (changed) layout(length);
        const piece = cuts.pieceAt(cursor);
        if (changed || piece.index !== selected || disabled !== busy) {
            busy = disabled;
            drawHandles(piece, length);
        }
        shown = cuts.segments;
        if (!gesture?.moved || !gesture.edge) playhead.style.left = percent(cursor, length);
        filmstrip.update(source, cuts);
    }

    const frameAt = (x, drag) => clamp(Math.round((x - drag.rect.left) * drag.length / drag.rect.width), 0, drag.length);
    function move(x) {
        const drag = gesture;
        if (!drag.edge) {
            const frame = frameAt(x, drag);
            if (drag.frame !== frame) { drag.frame = frame; seek(frame); }
            return;
        }
        if (!drag.moved && Math.abs(x - drag.x) < 4) return;
        const { min, max, value } = drag.range;
        const target = clamp(value + Math.round((x - drag.x) * drag.length / drag.rect.width), min, max);
        if (drag.moved && drag.target === target) return;
        drag.moved = true;
        drag.target = target;
        const edgeFrame = drag.piece[drag.edge];
        const position = clamp(edgeFrame + target - value, 0, drag.length);
        positionHandles(drag.edge === 'start' ? position : drag.piece.start,
            drag.edge === 'end' ? position : drag.piece.end, drag.length);
        guide.hidden = false;
        guide.style.left = percent(Math.min(position, edgeFrame), drag.length);
        guide.style.width = percent(Math.abs(position - edgeFrame), drag.length);
        playhead.style.left = percent(position, drag.length);
        previewTrim(drag.edge === 'start' ? target : target - 1, position);
    }

    function end(cancelled) {
        const drag = gesture;
        if (!drag) return;
        gesture = null;
        guide.hidden = true;
        if (timeline.hasPointerCapture(drag.id)) timeline.releasePointerCapture(drag.id);
        if (!drag.edge) return;
        positionHandles(drag.piece.start, drag.piece.end, drag.length);
        if (cancelled) cancelTrim();
        else if (drag.moved) commitTrim(drag.piece.index, drag.edge, drag.target);
        else seek(drag.edge === 'start' ? drag.piece.start : drag.piece.end - 1);
    }

    timeline.addEventListener('pointerdown', event => {
        if (!cuts || gesture || event.button !== 0 || !event.isPrimary || controls.seek.disabled) return;
        event.preventDefault();
        const edge = event.target.closest('[data-edge]')?.dataset.edge;
        if (edge && busy) return;
        const piece = cuts.pieceAt(Number(controls.seek.value));
        gesture = { id: event.pointerId, x: event.clientX, rect: timeline.getBoundingClientRect(), length: cuts.length,
            edge, piece, range: edge ? cuts.edgeRange(piece.index, edge) : null };
        timeline.setPointerCapture(event.pointerId);
        if (edge) {
            event.target.closest('[data-edge]').focus({ preventScroll: true });
            beginTrim();
        } else {
            controls.seek.focus({ preventScroll: true });
            move(event.clientX);
        }
    });
    timeline.addEventListener('pointermove', event => { if (event.pointerId === gesture?.id) move(event.clientX); });
    timeline.addEventListener('pointerup', event => {
        if (event.pointerId !== gesture?.id) return;
        move(event.clientX);
        end(false);
    });
    for (const type of ['pointercancel', 'lostpointercapture']) {
        timeline.addEventListener(type, event => { if (event.pointerId === gesture?.id) end(true); });
    }
    handles.addEventListener('keydown', event => {
        const edge = event.target.dataset.edge;
        if (!edge || busy || gesture || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const { min, value, max } = cuts.edgeRange(selected, edge);
        const target = { ArrowLeft: value - 1, ArrowRight: value + 1, Home: min, End: max }[event.key];
        commitTrim(selected, edge, clamp(target, min, max));
    });

    return {
        update,
        get trimming() { return !!gesture?.edge; },
        cancel() { if (!gesture) return false; end(true); return true; },
        reset() {
            end(true);
            filmstrip.reset();
            pieces.children[selected]?.classList.remove('is-selected');
            source = cuts = shown = null;
            selected = -1;
        }
    };
}
