const MODEL_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#14b8a6', '#a78bfa', '#f472b6', '#ef4444', '#84cc16', '#fb923c', '#facc15', '#22d3ee', '#e879f9', '#fda4af', '#60a5fa', '#10b981'];

export const TEST_MODEL_CATALOG = Object.freeze([
    ['base', '3D_model/Base_1000x1000x500.step', 'Base 1000 × 1000 × 500', 'model'],
    ['conveyor', '3D_model/Conveyor.step', 'Conveyor', 'model'],
    ['square-object', '3D_model/Square_object_40x40x40.step', 'Square object 40 × 40 × 40', 'model'],
    ['square-tray', '3D_model/Square_Tray_3x3.step', 'Square Tray 3 × 3', 'model'],
    ['stage-vac', '3D_model/Stage_VAC_module.step', 'Stage VAC module', 'model'],
    ['teaching-kit', '3D_model/Teaching_kit.step', 'Teaching kit', 'model'],
    ['vision', '3D_model/Vision_module.step', 'Vision module', 'model'],
    ['equipment', 'Test_Equipment_CAD.step', 'Test Equipment CAD', 'model'],
    ['dual-vac-lowered', 'Tool/Dual_VAC_Tool_lowered.step', 'Dual VAC Tool lowered', 'tool'],
    ['dual-vac-raised', 'Tool/Dual_VAC_Tool_raised.step', 'Dual VAC Tool raised', 'tool'],
    ['scara-adapter', 'Tool/Scara_adapter.step', 'SCARA adapter', 'tool'],
    ['single-vac', 'Tool/Single_VAC_Tool.step', 'Single VAC Tool', 'tool'],
    ['teaching-pointer', 'Tool/Teaching_pointer.step', 'Teaching pointer', 'tool'],
    ['vacuum-x200', 'Vacuum_Tool_X200mm.stl', 'Vacuum Tool X200 mm', 'tool'],
    ['scara-height-base', '3D_model/SCARA_height_base.step', 'SCARA height base 200 mm', 'model']
].map(([id, file, name, category], index) => Object.freeze({
    id, file, name, category, path: `./test-assets/${file}`,
    image: `./test-assets/previews/${id}.png`, color: MODEL_COLORS[index]
})));

export function getImportedModelColor(fileName) {
    const name = String(fileName || '').split(/[\\/]/).pop().toLowerCase();
    const asset = TEST_MODEL_CATALOG.find(asset => asset.file.split('/').pop().toLowerCase() === name);
    if (asset) return asset.color;
    let hash = 0;
    for (const character of name) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
    return `hsl(${hash % 360}, 58%, 62%)`;
}

export function getTestModelSelection(quantities) {
    const selection = TEST_MODEL_CATALOG.flatMap(asset => {
        const quantity = Number(quantities[asset.id] ?? 0);
        if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) {
            throw new Error('모델별 수량은 0~20 사이의 정수로 입력해 주세요.');
        }
        return quantity ? [{ asset, quantity }] : [];
    });
    if (selection.reduce((sum, item) => sum + item.quantity, 0) > 100) {
        throw new Error('한 번에 최대 100개까지 가져올 수 있습니다.');
    }
    return selection;
}

export function getTestModelSelectionForRobot(selection, robotType, hasScaraAdapter = false) {
    if (robotType !== 'scara' || hasScaraAdapter
        || !selection.some(item => item.asset.category === 'tool')
        || selection.some(item => item.asset.id === 'scara-adapter')) return selection;
    return [{ asset: TEST_MODEL_CATALOG.find(asset => asset.id === 'scara-adapter'), quantity: 1 }, ...selection];
}

const EDUCATIONAL_COMPACT_REACH = Object.freeze({
    'IR-S4-40Z15': 400,
    'IR-S7-50Z20': 500,
    'IR-S7-60Z20': 600,
    'IR-S7-70Z20': 700,
    'IR-S10-60Z20': 600,
    'IR-S10-70Z20': 700,
    'IR-R4-56': 560,
    'IR-R4H-54': 540,
    'IR-R7H-70': 700
});

export function getEducationalModelSelection({ robotType, robotModel, robotPosition = [0, 0, 0] } = {}) {
    const reach = EDUCATIONAL_COMPACT_REACH[robotModel];
    // Conveyor footprint: 500×200 mm; trays/vision: 200×200 mm.
    // Separate rows by at least 20 mm, while keeping the belt ends in reach.
    const conveyorY = reach ? Math.min(350, reach * .5 + 50) : 350;
    const visionX = reach ? Math.round(reach * .7) : 650;
    const trayX = reach ? visionX - 40 : 650;
    const trayY = reach ? -190 : -350;
    // The near tray must also stay outside SCARA's inner joint-limit boundary.
    const leftTrayY = reach ? ({ 'IR-S7-70Z20': 310, 'IR-S10-60Z20': 290, 'IR-R7H-70': 310 })[robotModel] ?? 250 : 350;
    const originX = reach ? robotPosition[0] : 0;
    const originY = reach ? robotPosition[1] : 0;
    const at = (x, y, z = 0) => [originX + x, originY + y, z];
    const modules = [
        ['conveyor', at(reach ? 40 : 100, conveyorY)],
        ['square-tray', at(trayX, trayY)],
        ['vision', at(visionX, reach ? 30 : 0)],
        ['square-tray', at(-50, -leftTrayY)],
        ['base', [0, 0, 0]]
    ];
    // STEP tray openings: centers -58/0/58 mm, inner floor at Z=176 mm.
    const objects = [-58, 0, 58].flatMap(x => [-58, 0, 58].map(y => (
        ['square-object', at(trayX + x, trayY + y, 176)]
    )));
    const scaraBase = robotType === 'scara' ? [['scara-height-base', [robotPosition[0], robotPosition[1], 0]]] : [];
    return [...modules, ...objects, ...scaraBase].map(([id, position]) => ({
        asset: TEST_MODEL_CATALOG.find(asset => asset.id === id), quantity: 1, position
    }));
}
