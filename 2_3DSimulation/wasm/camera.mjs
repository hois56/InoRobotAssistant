import { engine, numbers } from './engine.mjs';

export function updateOrbitTransition(transition, timestamp) {
    const input = numbers(27);
    transition.fromTarget.toArray(input, 0);
    transition.toTarget.toArray(input, 3);
    transition.fromQuaternion.toArray(input, 6);
    transition.toQuaternion.toArray(input, 10);
    transition.fromUp.toArray(input, 14);
    transition.upRotation.toArray(input, 17);
    transition.toPosition.toArray(input, 21);
    transition.toUp.toArray(input, 24);
    transition.progress = engine.orbit_transition(timestamp - transition.startTime, transition.duration,
        transition.fromDistance, transition.toDistance, transition.fromZoom, transition.toZoom);
    const frame = numbers(10);
    transition.controls.target.fromArray(frame, 0);
    transition.camera.position.fromArray(frame, 3);
    transition.camera.up.fromArray(frame, 6);
    transition.camera.zoom = frame[9];
}

export function followSelectedCenter(camera, controls, origin, center) {
    const input = numbers(12);
    origin.toArray(input, 0);
    center.toArray(input, 3);
    camera.position.toArray(input, 6);
    controls.target.toArray(input, 9);
    if (!engine.orbit_follow_selection()) return false;
    const result = numbers(12);
    camera.position.fromArray(result, 6);
    controls.target.fromArray(result, 9);
    return true;
}

export function resizeOrthographicCamera(camera, width, height) {
    numbers(4);
    engine.resize_orthographic(camera.left, camera.right, camera.top, camera.bottom, width, height);
    [camera.left, camera.right, camera.top, camera.bottom] = numbers(4);
}
