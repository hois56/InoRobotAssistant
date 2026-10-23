import * as THREE from 'three';
import { ROBOT_LOGO_COLOR } from './robot-logo-material-core.mjs';

let logoTexturePromise;

export async function applyRobotLogoProjection(mesh, projection) {
    logoTexturePromise ||= new THREE.TextureLoader().loadAsync(
        new URL('../1_RobotModelSelect/INOVANCE_Logo.png', import.meta.url).href
    );
    const texture = await logoTexturePromise;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
        const bodyColor = material.color.clone();
        material.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, {
                robotLogoMap: { value: texture },
                robotLogoColor: { value: new THREE.Color(ROBOT_LOGO_COLOR) },
                robotLogoBodyColor: { value: bodyColor },
                robotLogoNegative: { value: new THREE.Vector4(...projection.negative) },
                robotLogoPositive: { value: new THREE.Vector4(...projection.positive) },
                robotLogoMinDepth: { value: projection.minDepth }
            });
            shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vRobotLogoPosition;
varying float vRobotLogoFacing;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vRobotLogoPosition = position;
vRobotLogoFacing = normal.y;`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D robotLogoMap;
uniform vec3 robotLogoColor;
uniform vec3 robotLogoBodyColor;
uniform vec4 robotLogoNegative;
uniform vec4 robotLogoPositive;
uniform float robotLogoMinDepth;
varying vec3 vRobotLogoPosition;
varying float vRobotLogoFacing;`).replace('#include <color_fragment>', `#include <color_fragment>
// Highlight colors take precedence over the normal logo color.
if (distance(diffuse, robotLogoBodyColor) < 0.0001
    && abs(vRobotLogoPosition.y) > robotLogoMinDepth
    && vRobotLogoFacing * sign(vRobotLogoPosition.y) > 0.8) {
    vec4 logoRect = vRobotLogoPosition.y < 0.0 ? robotLogoNegative : robotLogoPositive;
    vec2 logoUv = (vRobotLogoPosition.xz - logoRect.xy) / logoRect.zw;
    if (vRobotLogoPosition.y > 0.0) logoUv.x = 1.0 - logoUv.x;
    if (all(greaterThanEqual(logoUv, vec2(0.0))) && all(lessThanEqual(logoUv, vec2(1.0)))) {
        // Transparent-pixel bounds of the supplied 3347 x 897 logo image.
        vec2 imageUv = (vec2(261.0, 175.0) + logoUv * vec2(2826.0, 481.0)) / vec2(3347.0, 897.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, robotLogoColor, texture2D(robotLogoMap, imageUv).a);
    }
}`);
        };
        material.customProgramCacheKey = () => 'inovance-surface-logo-v1';
        material.needsUpdate = true;
    }
    mesh.userData.robotLogoProjection = projection;
}
