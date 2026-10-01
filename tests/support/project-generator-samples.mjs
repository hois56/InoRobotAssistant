import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function normalizeGeneratedText(value) {
  return value
    .replace(/^\uFEFF/, '')
    .replaceAll('\r\n', '\n')
    .replace(/(\bTime\s*=\s*")[^"]*(")/g, '$1<TIMESTAMP>$2');
}

export function generateProjectSamples() {
  const sandbox = vm.createContext({ console, Date });
  const assets = fs.readFileSync(path.join(repoRoot, '4_ProjectGenerator', 'assets.js'), 'utf8');
  const generator = fs.readFileSync(path.join(repoRoot, '4_ProjectGenerator', 'generator.js'), 'utf8');

  new vm.Script(`${assets}\n;globalThis.__Assets = Assets;`, { filename: '4_ProjectGenerator/assets.js' }).runInContext(sandbox);
  new vm.Script(`${generator}\n;globalThis.__Generator = Generator;`, { filename: '4_ProjectGenerator/generator.js' }).runInContext(sandbox);

  const steps = [
    { id: 'tray-get', No: 1, WorkType: 'Tray', WorkMethod: 'Get', ToolType: 'Vacuum', VisionUse: 'No use', ExtraWaitCount: 1 },
    { id: 'stage-put', No: 2, WorkType: 'Stage', WorkMethod: 'Put', ToolType: 'Gripper', VisionUse: 'No use', ExtraWaitCount: 0 },
    { id: 'vision-check', No: 3, WorkType: 'Vision', WorkMethod: 'Check', ToolType: 'Vision (Socket)', VisionUse: 'Use - Socket', ExtraWaitCount: 0 }
  ];
  const options = {
    RobotName: 'IR-R10-140S5-D1NH-INT_01741041',
    EnableMultiRecipe: true,
    RecipeCount: 2,
    EnableTcpSpeed: true,
    EnableTorque: true,
    EnableToolControl: true,
    ToolControlType: 'DIO',
    EnableTeachingMode: true,
    EnableWaitPos: true,
    EnableProcessBusy: true,
    VisionConfigs: { 'vision-check': { IsClient: true, IpAddress: '192.168.10.12', Port: '5001' } }
  };
  const api = sandbox.__Generator;
  const raw = {
    'main.pro': api.MainProgram(steps, options),
    'PLC_internal.pro': api.PLCInternalProgram(options),
    's01_initial.pro': api.InitialProgram(steps, options),
    's02_offset.pro': api.OffsetProgram(steps, options),
    's03_teach_mode.pro': api.TeachModeProgram(steps, options),
    's04_Tool_Control.pro': api.ToolControlProgram(options, steps),
    'PLC_TCP_Speed.pro': api.TcpSpeedProgram(options.RobotName),
    'PLC_Current_Torque.pro': api.TorqueProgram(options.RobotName),
    'sP01_Tray_Get.pro': api.ProcessProgram(steps[0], options, 1),
    'sP02_Stage_Put.pro': api.ProcessProgram(steps[1], options, 1),
    'sP03_Vision_Check.pro': api.ProcessProgram(steps[2], options, 1),
    'P.pts': api.DataPoints(steps, options, 'P.pts'),
    'P01.pts': api.DataPoints(steps, options, 'P01.pts'),
    'UserDefineWarning.jsn': api.DataWarning(steps, options),
    'Labels.jsn': api.LabelsJson(steps, options),
    'Remote_IO_mapping.dat': api.RemoteIOInfo(options),
    'RemoteIO_PointMapping.dat': api.RobPointMapping(options),
    'GeneratorSample.prj': api.DataPrj(steps, options, 'GeneratorSample')
  };

  return Object.fromEntries(Object.entries(raw).map(([name, content]) => {
    if (typeof content !== 'string') throw new TypeError(`Generator returned non-text output for ${name}`);
    return [name, normalizeGeneratedText(content)];
  }));
}

export { repoRoot };
