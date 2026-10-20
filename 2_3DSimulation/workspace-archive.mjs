const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});

function header(size, signature) {
    const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
    view.setUint32(0, signature, true);
    return { bytes, view };
}

// Read, compress and write one source at a time. JSZip prepares Blob inputs
// eagerly, which otherwise holds all original files in memory even when its
// compressed output is streamed. Keep the existing standard ZIP file format.
export async function writeWorkspaceArchive(entries, writable) {
    if (entries.length > 65535) throw new Error('Too many files for a ZIP archive.');
    const encoder = new TextEncoder(), directory = [];
    let offset = 0;
    const write = async bytes => {
        if (offset + bytes.byteLength > 0xffffffff) throw new Error('Project archive exceeds the 4 GB ZIP limit.');
        await writable.write(bytes);
        offset += bytes.byteLength;
    };
    for (const entry of entries) {
        const name = encoder.encode(entry.name), start = offset;
        if (name.length > 65535 || entry.blob.size > 0xffffffff) throw new Error('Project archive entry is too large.');
        let compressor = null;
        try { compressor = new CompressionStream('deflate-raw'); } catch { /* Older browsers store the file without compression. */ }
        const method = compressor ? 8 : 0;
        const local = header(30, 0x04034b50);
        local.view.setUint16(4, 20, true);
        local.view.setUint16(6, 0x0808, true);
        local.view.setUint16(8, method, true);
        local.view.setUint16(12, 0x21, true);
        local.view.setUint16(26, name.length, true);
        await write(local.bytes); await write(name);
        let crc = 0xffffffff, size = 0, compressedSize = 0;
        let stream = entry.blob.stream().pipeThrough(new TransformStream({
            transform(chunk, controller) {
                size += chunk.byteLength;
                for (const value of chunk) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
                controller.enqueue(chunk);
            }
        }));
        if (compressor) stream = stream.pipeThrough(compressor);
        const reader = stream.getReader();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                compressedSize += value.byteLength;
                await write(value);
            }
        } catch (error) {
            try { await reader.cancel(error); } catch { }
            throw error;
        } finally { reader.releaseLock(); }
        crc = (crc ^ 0xffffffff) >>> 0;
        const descriptor = header(16, 0x08074b50);
        descriptor.view.setUint32(4, crc, true);
        descriptor.view.setUint32(8, compressedSize, true);
        descriptor.view.setUint32(12, size, true);
        await write(descriptor.bytes);
        const central = header(46, 0x02014b50);
        central.view.setUint16(4, 20, true); central.view.setUint16(6, 20, true);
        central.view.setUint16(8, 0x0808, true); central.view.setUint16(10, method, true);
        central.view.setUint16(14, 0x21, true);
        central.view.setUint32(16, crc, true);
        central.view.setUint32(20, compressedSize, true); central.view.setUint32(24, size, true);
        central.view.setUint16(28, name.length, true); central.view.setUint32(42, start, true);
        directory.push(central.bytes, name);
    }
    const directoryStart = offset;
    for (const bytes of directory) await write(bytes);
    const end = header(22, 0x06054b50);
    end.view.setUint16(8, entries.length, true); end.view.setUint16(10, entries.length, true);
    end.view.setUint32(12, offset - directoryStart, true); end.view.setUint32(16, directoryStart, true);
    await write(end.bytes);
}
