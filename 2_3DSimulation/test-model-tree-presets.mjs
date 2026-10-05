// Authored folder names and part memberships from the supplied All.inosim project.
const PRESETS = {
    "Conveyor.step": {"partCount":41,"groups":[{"name":"Base","parts":[26,27,28,29,30,31,32,33,34,35,36,37,9,10,11,12,14,15,16,17,21,22,24,25,19,20,23,13,18],"collapsed":true},{"name":"Motor","parts":[38,39,40],"collapsed":true},{"name":"Roller_1","parts":[1,2,3,4],"collapsed":true},{"name":"Roller_2","parts":[5,6,7,8],"collapsed":true}]},
    "Square_Tray_3x3.step": {"partCount":26,"groups":[{"name":"Base","parts":[0,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],"collapsed":true},{"name":"Tray","parts":[1,2,3,4,5,6,7,8,9],"collapsed":true}]},
    "Stage_VAC_module.step": {"partCount":41,"groups":[{"name":"Base","parts":[0,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40],"collapsed":true},{"name":"Suction_pad","parts":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"collapsed":true},{"name":"Vacuum_manifold","parts":[17,18,19,20,21,22,23,24],"collapsed":true}]},
    "Vision_module.step": {"partCount":32,"groups":[{"name":"Base","parts":[0,1,2,3,4,5,6,7,8,9,10],"collapsed":true},{"name":"Camera","parts":[11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],"collapsed":true},{"name":"Ring_light","parts":[26,27,28,29,30,31],"collapsed":true}]},
    "Base_1000x1000x500.step": {"partCount":64,"groups":[{"name":"Base","parts":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,51],"collapsed":true},{"name":"Panel_1","parts":[15,19,20,21,22,23,24,25,26],"collapsed":true},{"name":"Panel_2","parts":[18,27,28,29,30,31,32,33,34],"collapsed":true},{"name":"Panel_3","parts":[16,35,36,37,38,39,40,41,42],"collapsed":true},{"name":"Panel_4","parts":[17,43,44,45,46,47,48,49,50],"collapsed":true},{"name":"Foot_1","parts":[52,53,54],"collapsed":true},{"name":"Foot_2","parts":[55,56,57],"collapsed":true},{"name":"Foot_3","parts":[58,59,60],"collapsed":true},{"name":"Foot_4","parts":[61,62,63],"collapsed":true}]},
    "Teaching_kit.step": {"partCount":51,"groups":[{"name":"Base","parts":[41,42,43,44,45,46,47,48,49,50],"collapsed":true},{"name":"Track","parts":[1,2,3,4],"collapsed":true},{"name":"Label","parts":[23,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,24],"collapsed":true},{"name":"Taget","parts":[25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40],"collapsed":true}]},
    "Dual_VAC_Tool_lowered.step": {"partCount":23,"groups":[{"name":"Base","parts":[0,1,2,3,4,5,7,8,13,14,15,17,18,19,9,6,16],"collapsed":true},{"name":"Road","parts":[10,11,12,20,21,22],"collapsed":true}]},
    "Dual_VAC_Tool_raised.step": {"partCount":23,"groups":[{"name":"Base","parts":[0,1,2,4,5,6,7,8,9,13,14,15,16,17,18,19,3],"collapsed":true},{"name":"Road","parts":[10,11,12,20,21,22],"collapsed":true}]},
    "Teaching_pointer.step": {"partCount":7,"groups":[{"name":"Base","parts":[0,1,2,3,4],"collapsed":true},{"name":"TCP","parts":[5,6],"collapsed":true}]},
    "Single_VAC_Tool.step": {"partCount":8,"groups":[{"name":"Base","parts":[0,1,2,3,4,5],"collapsed":true},{"name":"VAC pad","parts":[6,7],"collapsed":true}]},
    "Scara_adapter_shaft20mm.step": {"partCount":6,"groups":[{"name":"Tool Flange","parts":[0,1,2],"collapsed":true},{"name":"Shaft Flange","parts":[3,4,5],"collapsed":true}]},
    "Scara_adapter.step": {"partCount":6,"groups":[{"name":"Tool Flange","parts":[0,1],"collapsed":true},{"name":"Shaft Clamp","parts":[2,3,4,5],"collapsed":true}]},
    "SCARA_height_base.step": {"partCount":7,"groups":[{"name":"Mount Plates","parts":[0,1],"collapsed":true},{"name":"Column","parts":[2],"collapsed":true},{"name":"Gussets","parts":[3,4,5,6],"collapsed":true}]},
    "Square_object_40x40x40.step": {"partCount":1,"groups":[],"folder":"Object"}
};

export function getTestModelTreePreset(fileName, partCount) {
    const name = String(fileName || "").split(/[\\/]/).pop().toLowerCase();
    const entry = Object.entries(PRESETS).find(([key]) => key.toLowerCase() === name)?.[1];
    if (!entry || entry.partCount !== partCount) return null;
    return {
        groups: entry.groups.map(group => ({ name: group.name, parts: [...group.parts], collapsed: group.collapsed })),
        folder: entry.folder || null
    };
}
