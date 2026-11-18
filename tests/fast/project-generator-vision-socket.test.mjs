import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({ Date, Assets: { Robots_6_axis: '' } });
vm.runInContext(fs.readFileSync('4_ProjectGenerator/generator.js', 'utf8') + ';globalThis.api = Generator;', context);
const api = context.api;
const calibration = { id: 'calibration', No: 1, WorkType: 'Vision', WorkMethod: 'Calibration', ToolType: 'Vision (Socket)', VisionUse: 'No use' };
const options = { RobotName: 'test', VisionConfigs: { calibration: { IsClient: true, IpAddress: '192.168.10.25', Port: '5012' } } };

test('Socket calibration receives Shot data before Set_PR and adds it to the process offset', () => {
    const program = api.ProcessProgram(calibration, options, 1);
    assert.match(program, /Func Connect_socket\(\)/);
    assert.match(program, /String server_IP = "192\.168\.10\.25";/);
    assert.match(program, /Int server_port = 5012;/);
    assert.match(program, /Func Send_data\(String send_data\)/);
    assert.match(program, /Func String Receive_data\(\)/);
    assert.ok(program.includes('    Connect_socket();\n    Send_data("Shot");\n    Str[0] = Receive_data();\n    LB[0] = StrGetData(Str[0],",",LD[0]);\n    PR[0] = (LD[0],LD[1],0,LD[2],0,0);\n    s02_offset.Set_PR();'));
    assert.match(api.OffsetCode(calibration), /LPR\[B_PR\] = PR\[0\];/);
    assert.match(api.OffsetCode(calibration), /xwOffset_1_X\.Int\/10000/);
    assert.match(api.OffsetProgram([calibration], options), /PR\[B_PR\] = PR\[B_PR\] \+ LPR\[B_PR\];/);
    assert.doesNotMatch(api.OffsetProgram([calibration], options), /xwVision_offset/);
    assert.doesNotMatch(api.LabelsJson([calibration], options), /xwVision_offset/);
});

test('server calibration uses the server connection helper while PLC calibration retains IO data', () => {
    const serverOptions = { ...options, VisionConfigs: { calibration: { IsClient: false, Port: '5013' } } };
    const program = api.ProcessProgram(calibration, serverOptions, 1);
    assert.match(program, /Func Connect_socket\(\)/);
    assert.match(program, /GetPortState\(2\)/);
    assert.doesNotMatch(program, /Open Socket\(/);
    const io = { ...calibration, ToolType: 'PLC (IO)' };
    assert.doesNotMatch(api.ProcessProgram(io, options, 1), /Func Connect_socket/);
    assert.match(api.OffsetCode(io), /xwVision_offset_X/);
    assert.match(api.OffsetProgram([io], options), /xwVision_offset_X/);
    assert.match(api.LabelsJson([io], options), /xwVision_offset_X/);
    assert.match(api.LabelsJson([calibration, { ...io, No: 2 }], options), /xwVision_offset_X/);
});

test('Socket Get and Put apply received offsets before moving while Check exchanges after moving', () => {
    for (const [WorkType, WorkMethod] of [['Tray', 'Get'], ['Stage', 'Put'], ['Vision', 'Check']]) {
        const step = { ...calibration, WorkType, WorkMethod, ToolType: 'Vacuum', VisionUse: 'Use - Socket' };
        const program = api.ProcessProgram(step, options, 1);
        assert.match(program, /Connect_socket\(\);\s+Send_data\("Shot"\);/);
        const exchange = program.indexOf('Connect_socket();');
        const move = program.indexOf('Movl Offset(P1_Work');
        assert.equal(exchange < move, WorkMethod !== 'Check');
        const offset = api.OffsetProgram([step], options);
        assert.equal(offset.includes('LPR[B_PR] = PR[0];'), WorkMethod !== 'Check');
        assert.match(offset, /xwOffset_1_X\.Int\/10000/);
        assert.doesNotMatch(offset, /xwVision_offset/);
    }
});

test('Socket Tray keeps process and tray offsets while replacing only vision IO correction', () => {
    for (const No of [1, 11]) {
        const socket = { ...calibration, No, WorkType: 'Tray', WorkMethod: 'Get', ToolType: 'Vacuum', VisionUse: 'Use - Socket' };
        const io = { ...socket, No: 2, VisionUse: 'Use - IO' };
        assert.match(api.OffsetCode(socket), /LPR\[B_PR\] = PR\[0\];/);
        const program = api.OffsetProgram([socket, io], options);
        const branch = program.split(`        Case ${No}:\n`)[1].split('            Break;')[0];
        assert.match(branch, /PR\[B_PR\] = PR\[B_PR\] \+ LPR\[B_PR\];\s+Set_tray_offset\(\);/);
        if (No === 1) assert.match(branch, /xwOffset_1_X\.Int\/10000/);
        else assert.match(branch, /PR\[B_PR\] = \(0,0,0,0,0,0\);/);
        assert.doesNotMatch(branch, /xwVision_offset/);
        assert.match(program, /xwOffset_2_X\.Int\/10000/);
        assert.match(program, /xwVision_offset_X\.Int\/10000/);
    }
});
