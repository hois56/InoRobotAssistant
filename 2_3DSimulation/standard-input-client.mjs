export const STANDARD_INPUT_LAST = 64;
const validAddress = address => Number.isInteger(address) && address >= 0 && address <= STANDARD_INPUT_LAST;
function snapshot(inputs) {
    if (!inputs || typeof inputs !== 'object') return null;
    const result = {};
    for (let address = 0; address <= STANDARD_INPUT_LAST; address++) {
        if (inputs[address] !== 0 && inputs[address] !== 1) return null;
        result[address] = inputs[address];
    }
    return result;
}
// Each connection has confirmed feedback and a bounded queue of user writes.
// A new connection never inherits pending writes or cached input values.
export class StandardInputClient {
    constructor({ send, changed = () => {}, now = () => performance.now() }) {
        this.send = send; this.changed = changed; this.now = now;
        this.states = new WeakMap(); this.sequence = 0;
    }
    state(controller) {
        let state = this.states.get(controller);
        if (!state || state.generation !== controller.socketGeneration || state.socket !== controller.socket) {
            state = { values: null, at: 0, pending: null, queue: new Map(), nextRead: 0, error: '',
                generation: controller.socketGeneration, socket: controller.socket };
            this.states.set(controller, state);
        }
        return state;
    }
    connected(controller) {
        return controller?.wanted && controller.controllerKind === 'virtual' && controller.source === 'bridge'
            && /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(controller.ipAddress)
            && ['connected', 'streaming'].includes(controller.status) && controller.socket?.readyState === 1;
    }
    view(controller, address = 0) {
        const state = this.state(controller);
        const values = this.connected(controller) && this.now() - state.at < 1500 ? state.values : null;
        return { ...state, values, value: values?.[address] ?? null,
            writing: state.queue.has(address) || Boolean(state.pending?.write && state.pending.address === address) };
    }
    sendNext(controller) {
        const state = this.state(controller);
        if (!this.connected(controller) || state.pending) return;
        const queued = state.queue.entries().next().value;
        if (!queued && this.now() < state.nextRead) return;
        const id = `inputs-${++this.sequence}`, address = queued?.[0] ?? 0;
        const message = { type: queued ? 'setStandardInput' : 'readStandardInputs', requestId: id, address };
        if (queued) { message.value = queued[1]; state.queue.delete(address); }
        state.pending = { id, deadline: this.now() + 1500, write: Boolean(queued), address };
        try {
            if (!this.send(message, controller)) throw new Error('연결이 끊겼습니다.');
        } catch {
            state.pending = null; state.queue.clear(); state.values = null; state.error = '입력을 전송하지 못했습니다.';
            state.nextRead = this.now() + 1000;
        }
        this.changed(controller);
    }
    request(controller, value = null, address = 0) {
        if (!this.connected(controller) || !validAddress(address) || (value !== null && value !== 0 && value !== 1)) return false;
        const state = this.state(controller);
        if (value !== null) state.queue.set(address, value);
        else state.nextRead = 0;
        this.sendNext(controller); this.changed(controller); return true;
    }
    tick(controller) {
        const state = this.state(controller), now = this.now();
        if (!this.connected(controller)) {
            if (state.values !== null || state.pending || state.queue.size) {
                state.values = null; state.pending = null; state.queue.clear(); state.error = ''; this.changed(controller);
            }
            return;
        }
        if (state.pending && now >= state.pending.deadline) {
            state.pending = null; state.queue.clear(); state.values = null;
            state.error = '응답 시간 초과 · 브리지와 K14 가상 컨트롤러 버전을 확인하세요.';
            state.nextRead = now + 1000; this.changed(controller);
        }
        this.sendNext(controller);
    }
    message(message, controller) {
        if (message?.type !== 'standardInputResult') return false;
        const state = this.state(controller);
        if (!this.connected(controller) || message.requestId !== state.pending?.id) return true;
        const pending = state.pending;
        state.pending = null;
        const values = message.success === true ? snapshot(message.inputs) : null;
        if (values && message.address === pending.address) {
            state.values = values; state.at = this.now(); state.error = ''; state.nextRead = this.now() + 250;
        } else {
            state.values = null; state.queue.clear(); state.error = message.message || '전체 입력을 읽지 못했습니다. 최신 브리지와 K14로 다시 연결하세요.';
            state.nextRead = this.now() + 1000;
        }
        this.changed(controller); this.sendNext(controller); return true;
    }
}
