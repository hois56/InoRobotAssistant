// CAD_Lightweight writes standard glTF metres; the simulator uses millimetres.
// Keep the existing convention of other importers and only normalize this
// identified exporter. Scale the content root, including its origin offset.
export function applyCadLightweightGltfUnits(gltf) {
    const scene = gltf.scene;
    if (gltf.asset?.generator !== 'CAD_Lightweight' || !scene
        || scene.userData.cadLightweightUnitsNormalized) return;
    scene.scale.multiplyScalar(1000);
    scene.userData.cadLightweightUnitsNormalized = true;
    scene.updateMatrixWorld(true);
}
