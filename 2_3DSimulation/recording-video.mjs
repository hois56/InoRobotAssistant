export const FPS = 60;
const frameTime = frame => Math.round(frame * 1_000_000 / FPS);
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

export async function selectFormat(width, height) {
    if (globalThis.VideoEncoder && globalThis.VideoFrame) {
        for (const codec of ['vp8', 'vp09.00.10.08']) {
            const config = { codec, width, height, framerate: FPS, latencyMode: 'quality',
                bitrate: Math.max(1_500_000, Math.round(width * height * FPS * 0.12)) };
            if ((await VideoEncoder.isConfigSupported(config).catch(() => null))?.supported) return config;
        }
    }
    // The local simulator can also run over plain HTTP, without WebCodecs.
    const probe = document.createElement('canvas');
    probe.width = probe.height = 2;
    if (probe.toDataURL('image/webp').startsWith('data:image/webp;')) return null;
    throw new Error('이 브라우저에서는 시뮬레이션 녹화를 지원하지 않습니다.');
}

async function webpFrame(canvas) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp') throw new Error('영상을 저장하지 못했습니다.');
    const data = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(data.buffer);
    for (let i = 12; i + 8 <= data.length;) {
        const size = view.getUint32(i + 4, true);
        if (view.getUint32(i) === 0x56503820 && i + 8 + size <= data.length) return data.subarray(i + 8, i + 8 + size);
        i += 8 + size + (size % 2);
    }
    throw new Error('영상을 저장하지 못했습니다.');
}

export function recordingSize(sourceHeight) {
    // Multiples of 32 × 18 give an exact 16:9 frame with even codec dimensions.
    const unit = Math.max(1, Math.round(sourceHeight / 18));
    return { width: 32 * unit, height: 18 * unit };
}

export async function encodeVideo({ width, height, config, count, draw, progress, signal }) {
    const { Muxer, ArrayBufferTarget } = await import('./vendor/webm-muxer/webm-muxer.mjs');
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, video: { width, height, frameRate: FPS,
        codec: config?.codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8' } });
    let encoder, failure;
    try {
        if (config) {
            encoder = new VideoEncoder({
                output(chunk, metadata) {
                    try { muxer.addVideoChunk(chunk, metadata); } catch (error) { failure = error; }
                },
                error(error) { failure = error; }
            });
            encoder.configure(config);
        }
        let nextYield = performance.now() + 30;
        for (let i = 0; i < count; i++) {
            if (failure) throw failure;
            signal?.throwIfAborted();
            const canvas = await draw(i);
            const timestamp = frameTime(i);
            if (encoder) {
                const frame = new VideoFrame(canvas, { timestamp, duration: frameTime(i + 1) - timestamp });
                try { encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 }); }
                finally { frame.close(); }
                if (encoder.encodeQueueSize >= 6) await encoder.flush();
            } else {
                muxer.addVideoChunkRaw(await webpFrame(canvas), 'key', timestamp);
            }
            if (performance.now() >= nextYield) {
                progress(Math.floor((i + 1) * 100 / count));
                await yieldToBrowser();
                nextYield = performance.now() + 30;
            }
        }
        if (encoder) await encoder.flush();
        if (failure) throw failure;
        signal?.throwIfAborted();
        muxer.finalize();
        return new Blob([target.buffer], { type: 'video/webm' });
    } finally {
        if (encoder && encoder.state !== 'closed') encoder.close();
    }
}
