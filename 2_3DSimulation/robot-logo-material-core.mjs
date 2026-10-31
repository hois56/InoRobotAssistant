export { ROBOT_LOGO_FACES } from './robot-logo-faces.mjs?v=20261031-r35-r50-1';
export { ROBOT_LOGO_PROJECTIONS } from './robot-logo-projections.mjs?v=20261031-r35-r50-1';

// Dominant opaque blue sampled from 1_RobotModelSelect/INOVANCE_Logo.png.
export const ROBOT_LOGO_COLOR = 0x108ccf;

export function createRobotLogoIndex(vertexCount, mask) {
    if (!mask || vertexCount !== mask.triangleCount * 3) return null;
    const logoCount = mask.ranges.reduce((count, [, length]) => count + length * 3, 0);
    const bodyCount = vertexCount - logoCount;
    const index = new Uint32Array(vertexCount);
    let bodyOffset = 0;
    let logoOffset = bodyCount;
    let rangeIndex = 0;
    for (let triangle = 0; triangle < mask.triangleCount; triangle++) {
        const range = mask.ranges[rangeIndex];
        const isLogo = range && triangle >= range[0] && triangle < range[0] + range[1];
        const offset = isLogo ? logoOffset : bodyOffset;
        for (let vertex = 0; vertex < 3; vertex++) index[offset + vertex] = triangle * 3 + vertex;
        if (isLogo) {
            logoOffset += 3;
            if (triangle + 1 === range[0] + range[1]) rangeIndex++;
        } else {
            bodyOffset += 3;
        }
    }
    return { index, bodyCount };
}
