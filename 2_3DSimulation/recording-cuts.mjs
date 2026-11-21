import { FPS } from './recording-video.mjs';

export function timecode(frame) {
    const hundredths = Math.floor(frame * 100 / FPS);
    const two = value => String(value).padStart(2, '0');
    return two(Math.floor(hundredths / 6000)) + ':' + two(Math.floor(hundredths / 100) % 60) + '.' + two(hundredths % 100);
}

// Segments are half-open ranges of original frames. The playhead and selection
// use the joined timeline, so an edit can cross any number of previous cuts.
export class RecordingCuts {
    constructor(frames) {
        this.sourceLength = frames;
        this.segments = [[0, frames]];
        this.stopwatchSource = null;
        this.stopwatchEndSource = null;
        this.hideAfterEnd = false;
        this.history = [];
    }

    get length() { return this.segments.reduce((total, [start, end]) => total + end - start, 0); }

    sourceFrame(frame) {
        for (const [start, end] of this.segments) {
            if (frame < end - start) return start + frame;
            frame -= end - start;
        }
        return this.segments.at(-1)[1] - 1;
    }

    outputFrame(source) {
        let frame = 0;
        for (const [start, end] of this.segments) {
            if (source < end) return frame + Math.max(0, source - start);
            frame += end - start;
        }
        return frame;
    }

    get stopwatch() { return this.stopwatchSource === null ? null : this.outputFrame(this.stopwatchSource); }

    get stopwatchEnd() { return this.stopwatchEndSource === null ? null : this.outputFrame(this.stopwatchEndSource); }

    elapsed(frame) {
        const start = this.stopwatch, end = this.stopwatchEnd;
        if (start === null || frame < start) return null;
        if (end !== null && frame >= end) return this.hideAfterEnd ? null : end - start;
        return frame - start;
    }

    state() {
        const { sourceLength, segments, stopwatchSource, stopwatchEndSource, hideAfterEnd } = this;
        return { sourceLength, segments, stopwatchSource, stopwatchEndSource, hideAfterEnd };
    }

    snapshot() { return Object.assign(new RecordingCuts(this.sourceLength), this.state()); }

    remember() { this.history.push(this.state()); }

    extend(frames) {
        if (frames <= this.sourceLength) return;
        const last = this.segments.at(-1);
        this.segments = last[1] === this.sourceLength
            ? [...this.segments.slice(0, -1), [last[0], frames]]
            : [...this.segments, [this.sourceLength, frames]];
        this.sourceLength = frames;
    }

    setStopwatch(frame) {
        const source = frame === null ? null : this.sourceFrame(frame);
        if (source === this.stopwatchSource) return;
        this.remember();
        this.stopwatchSource = source;
        if (source === null || (this.stopwatchEnd !== null && this.stopwatchEnd <= frame)) this.stopwatchEndSource = null;
    }

    setStopwatchEnd(frame) {
        if (this.stopwatch === null || frame <= this.stopwatch || frame > this.length) return;
        const boundary = frame === this.length ? this.segments.at(-1)[1] : this.sourceFrame(frame);
        if (boundary === this.stopwatchEndSource) return;
        this.remember();
        this.stopwatchEndSource = boundary;
    }

    setHideAfterEnd(hide) {
        if (this.hideAfterEnd === hide) return;
        this.remember();
        this.hideAfterEnd = hide;
    }

    pieceAt(frame) {
        let start = 0;
        for (const [index, [first, last]] of this.segments.entries()) {
            const end = start + last - first;
            if (frame < end || index === this.segments.length - 1) return { index, start, end };
            start = end;
        }
    }

    split(frame) {
        const { index, start, end } = this.pieceAt(frame);
        if (frame <= start || frame >= end) return false;
        const [first, last] = this.segments[index], boundary = first + frame - start;
        this.remember();
        this.segments = [...this.segments.slice(0, index), [first, boundary], [boundary, last], ...this.segments.slice(index + 1)];
        return true;
    }

    edgeRange(index, edge) {
        const [first, end] = this.segments[index];
        if (edge === 'start') return { min: this.segments[index - 1]?.[1] ?? 0, value: first, max: end - 1 };
        return { min: first + 1, value: end, max: this.segments[index + 1]?.[0] ?? this.sourceLength };
    }

    trimEdge(index, edge, frame) {
        const { min, value, max } = this.edgeRange(index, edge);
        const target = Math.max(min, Math.min(max, Math.round(frame)));
        if (target === value) return false;
        const segments = this.segments.slice(), [first, end] = segments[index];
        segments[index] = edge === 'start' ? [target, end] : [first, target];
        this.applySegments(segments);
        return true;
    }

    slice(from, to) {
        const segments = [];
        let offset = 0;
        for (const [start, end] of this.segments) {
            const first = start + Math.max(0, from - offset);
            const last = Math.min(end, start + to - offset);
            if (first < last) segments.push([first, last]);
            offset += end - start;
        }
        return segments;
    }

    cut(from, to, keep) {
        const length = this.length;
        if (from < 0 || from >= to || to > length || (from === 0 && to === length)) return;
        this.applySegments(keep ? this.slice(from, to) : [...this.slice(0, from), ...this.slice(to, length)]);
    }

    applySegments(segments) {
        this.remember();
        this.segments = segments;
        if (this.stopwatchSource !== null && this.stopwatchSource >= this.segments.at(-1)[1]) {
            this.stopwatchSource = this.stopwatchEndSource = null;
        }
    }

    undo() {
        const previous = this.history.pop();
        if (previous) {
            const frames = this.sourceLength;
            Object.assign(this, previous);
            this.extend(frames);
        }
    }
}
