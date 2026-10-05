// Scene collision alerts apply to models shown below a robot in the model tree.
export function isRobotAttachedCollisionModel(model) {
    const visited = new Set([model]);
    let host = model?.userData?.attachmentHost;
    while (host && !visited.has(host)) {
        if (host.userData?.tcpFrame) return true;
        visited.add(host);
        host = host.userData?.attachmentHost;
    }
    return false;
}

export function isSimulationCollisionPair(left, right) {
    return isRobotAttachedCollisionModel(left) || isRobotAttachedCollisionModel(right);
}

export function shouldReportSimulationCollision(hit, isRegisteredObject = () => false) {
    const left = hit?.objectA, right = hit?.objectB;
    if (!isSimulationCollisionPair(left, right)) return false;
    const leftObject = left?.userData?.placement === 'grip-object' || isRegisteredObject(left, hit.meshA);
    const rightObject = right?.userData?.placement === 'grip-object' || isRegisteredObject(right, hit.meshB);
    const leftTool = isRobotAttachedCollisionModel(left) && !leftObject;
    const rightTool = isRobotAttachedCollisionModel(right) && !rightObject;
    return !(leftObject && (rightObject || rightTool) || rightObject && leftTool);
}
