// Leave about one K14 feedback period for display interpolation.
export const conveyorDisplayTime = paintTime => paintTime - 16;

// Keep the actual transport path through stops and reversals for delayed robot samples.
const historyMs = 300;

function append(segments, segment) {
    while (segments.length && segments[0].end < segment.start - historyMs) segments.shift();
    segments.push(segment);
}

function fractionAt(segment, time) {
    return Math.max(0, time - segment.start) / (segment.end - segment.start);
}

function isFree(object) {
    for (let node = object; node; node = node.parent) {
        if (!node.visible || node.userData.attachmentHost || node.userData.equipmentOwner) return false;
    }
    return Boolean(object.parent);
}

function updatePosition(object) {
    if (!object.matrixAutoUpdate) object.updateMatrix();
    object.updateWorldMatrix(true, true);
}

export function createConveyorDisplay() {
    const products = new Map();
    const belts = new Map();
    let productHistory = new WeakMap();
    function forgetProduct(object) {
        products.delete(object);
        productHistory.delete(object);
    }
    return {
        get pending() { return products.size > 0 || belts.size > 0; },
        recordProduct(object, position, start, end) {
            if (!(end > start)) return;
            if (!products.has(object)) {
                for (const [previous, entry] of products) {
                    if (entry.segments.at(-1).end < start - historyMs) products.delete(previous);
                }
            }
            let motion = productHistory.get(object);
            const last = motion?.segments.at(-1);
            if (!last || motion.parent !== object.parent || !last.to.equals(object.position) || last.end < start - historyMs) {
                motion = { parent: object.parent, segments: [] };
                productHistory.set(object, motion);
            }
            products.set(object, motion);
            append(motion.segments, { start, end, from: object.position.clone(), to: position.clone() });
        },
        recordBelt(uniform, from, distance, length, start, end) {
            if (!(end > start) || !distance) return;
            if (!belts.has(uniform)) belts.set(uniform, []);
            append(belts.get(uniform), { start, end, from, distance, length });
        },
        forgetBelt(uniform) { belts.delete(uniform); },
        clear() { products.clear(); belts.clear(); productHistory = new WeakMap(); },
        withProductPositionsAt(candidates, time, transportTime, acquire) {
            const positions = [];
            try {
                const available = candidates.filter(({ object }) => {
                    const motion = productHistory.get(object);
                    if (!motion) return true;
                    const { parent, segments } = motion;
                    const last = segments.at(-1);
                    if (object.parent !== parent || !last.to.equals(object.position)) {
                        forgetProduct(object);
                        return true;
                    }
                    if (transportTime === null || time > transportTime
                        || time < Math.max(segments[0].start, transportTime - historyMs)) return false;
                    const segment = segments.find(item => time < item.end);
                    positions.push({ object, parent, live: segment && last.to });
                    if (segment) {
                        object.position.lerpVectors(segment.from, segment.to, fractionAt(segment, time));
                        updatePosition(object);
                    }
                    return true;
                });
                return acquire(available);
            } finally {
                for (const { object, parent, live } of positions) {
                    // Attachment keeps the workpiece pose at the instant of contact.
                    if (object.parent !== parent || !isFree(object)) forgetProduct(object);
                    else if (live) {
                        object.position.copy(live);
                        updatePosition(object);
                    }
                }
            }
        },
        paint(time, render) {
            if (!products.size && !belts.size) return render();
            const positions = [], phases = [];
            try {
                for (const [object, { parent, segments }] of products) {
                    const last = segments.at(-1);
                    if (object.parent !== parent || !last.to.equals(object.position) || !isFree(object)) {
                        forgetProduct(object);
                        continue;
                    }
                    if (time >= last.end) {
                        products.delete(object);
                        continue;
                    }
                    const segment = segments.find(item => time < item.end);
                    positions.push([object, last.to]);
                    object.position.lerpVectors(segment.from, segment.to, fractionAt(segment, time));
                    updatePosition(object);
                }
                for (const [uniform, segments] of belts) {
                    const segment = segments.find(item => time < item.end);
                    if (!segment) { belts.delete(uniform); continue; }
                    phases.push([uniform, uniform.value]);
                    uniform.value = (segment.from + segment.distance * fractionAt(segment, time)) % segment.length;
                }
                return render();
            } finally {
                for (const [uniform, phase] of phases) uniform.value = phase;
                for (const [object, position] of positions) {
                    object.position.copy(position);
                    updatePosition(object);
                }
            }
        }
    };
}
