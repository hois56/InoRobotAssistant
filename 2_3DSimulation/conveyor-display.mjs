// Leave room for interpolation between K14 joint samples (~20 ms apart).
export const conveyorDisplayTime = paintTime => paintTime - 48;

// Keep the transport timer's actual motion, including stops and reversals, until
// the viewport has presented it. The timer can also run while the tab is hidden.
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

export function createConveyorDisplay() {
    const products = new Map();
    const belts = new Map();
    return {
        get pending() { return products.size > 0 || belts.size > 0; },
        recordProduct(object, position, start, end) {
            if (!(end > start)) return;
            let motion = products.get(object);
            if (!motion) {
                for (const [previous, entry] of products) {
                    if (entry.segments.at(-1).end < start - historyMs) products.delete(previous);
                }
            }
            if (!motion || motion.parent !== object.parent || !motion.segments.at(-1).to.equals(object.position)) {
                motion = { parent: object.parent, segments: [] };
                products.set(object, motion);
            }
            append(motion.segments, { start, end, from: object.position.clone(), to: position.clone() });
        },
        recordBelt(uniform, from, distance, length, start, end) {
            if (!(end > start) || !distance) return;
            if (!belts.has(uniform)) belts.set(uniform, []);
            append(belts.get(uniform), { start, end, from, distance, length });
        },
        forgetBelt(uniform) { belts.delete(uniform); },
        clear() { products.clear(); belts.clear(); },
        paint(time, render) {
            if (!products.size && !belts.size) return render();
            const positions = [], phases = [];
            try {
                for (const [object, { parent, segments }] of products) {
                    const last = segments.at(-1);
                    if (time >= last.end || object.parent !== parent || !last.to.equals(object.position) || !isFree(object)) {
                        products.delete(object);
                        continue;
                    }
                    const segment = segments.find(item => time < item.end);
                    positions.push([object, last.to]);
                    object.position.lerpVectors(segment.from, segment.to, fractionAt(segment, time));
                    object.updateWorldMatrix(true, true);
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
                    object.updateWorldMatrix(true, true);
                }
            }
        }
    };
}
