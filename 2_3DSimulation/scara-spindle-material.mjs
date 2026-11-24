import { DataTexture, EquirectangularReflectionMapping, LinearFilter } from 'three';

let studioMap;

function spindleReflections() {
    if (studioMap) return studioMap;
    // Broad neutral fill keeps the shaded side silver and softens the highlight.
    const width = 256, height = 128;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        const latitude = ((y + 0.5) / height - 0.5) * Math.PI;
        for (let x = 0; x < width; x++) {
            const longitude = ((x + 0.5) / width - 0.5) * 2 * Math.PI;
            const dx = Math.cos(latitude) * Math.cos(longitude);
            const dy = Math.sin(latitude);
            const dz = Math.cos(latitude) * Math.sin(longitude);
            const light = 0.6 + 0.22 * dx - 0.2 * dy + 0.15 * dz;
            const offset = (y * width + x) * 4;
            const value = Math.round(255 * Math.min(1, light));
            pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
            pixels[offset + 3] = 255;
        }
    }
    studioMap = new DataTexture(pixels, width, height);
    studioMap.mapping = EquirectangularReflectionMapping;
    studioMap.magFilter = studioMap.minFilter = LinearFilter;
    studioMap.userData.sharedSpindleReflections = true;
    studioMap.needsUpdate = true;
    return studioMap;
}

export function polishScaraSpindle(material) {
    material.setValues({
        color: 0xeff1f3, metalness: 0.88, roughness: 0.55,
        envMap: spindleReflections(), envMapIntensity: 0.8
    });
}
