// Include user-imported scene obstacles as well as attachments and other robots.
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
    if (left !== right && left?.userData?.tcpFrame && right?.userData?.tcpFrame) return true;
    const isSceneModel = model => model?.userData?.placement === 'scene';
    if (left !== right && (left?.userData?.tcpFrame && isSceneModel(right)
        || right?.userData?.tcpFrame && isSceneModel(left))) return true;
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
