import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {test, expect} from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROBOT = 'IR-S7-60Z20S3-C2LH-INT_01741021';

// The project generator's simulation output for Tray Get -> Stage Put, without PLC tool control.
function generateSimulationProject() {
    const context = vm.createContext({console, Date});
    for (const name of ['assets.js', 'generator.js']) {
        vm.runInContext(fs.readFileSync(path.join(repoRoot, '4_ProjectGenerator', name), 'utf8'), context, {filename: name});
    }
    const G = vm.runInContext('Generator', context);
    const step = (No, WorkType, WorkMethod) => ({id: `p${No}`, No, WorkType, WorkMethod, ToolType: 'Vacuum', VisionUse: 'No use',
        ExtraWaitCount: 0, TrayXCount: 1, TrayYCount: 1, ProcessName: `sP0${No}_${WorkType}_${WorkMethod}`});
    const steps = [step(1, 'Tray', 'Get'), step(2, 'Stage', 'Put')];
    const options = {RobotName: ROBOT, EnableMultiRecipe: false, RecipeCount: 2, EnableTcpSpeed: true, EnableTorque: true,
        EnableToolControl: false, ToolControlType: 'PLC_IO', EnableTeachingMode: true, EnableWaitPos: true, EnableProcessBusy: true, VisionConfigs: {}};
    const sim = G.SimulationSettings(steps, options, {Cycles: 2, ToolTime: 0.2});
    const programs = G.SimulationProgramFiles(steps, options, sim);
    return {...programs, 'SIM.prj': G.SimulationProjectInfo(Object.keys(programs)),
        'Data/P.pts': G.DataPoints(steps, options, 'P.pts'), 'Data/Labels.jsn': G.LabelsJson(steps, options)};
}

test('a generated simulation project records every move per cycle and shows them in the OLP move-time table', async ({page}) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({response, body: await response.text()
            + '\nwindow.__tact={state,buildOlpProjectFromFiles,activateOlpProject,startOlpSession,setJointAngle};'});
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__tact);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(() => window.__tact.state.models.some(model => model.userData.tcpFrame));
    await page.locator('#program-work-origin-robot').click();
    await page.locator('#btn-register-work-origin').click();
    await page.locator('#program-work-origin-robot').click();

    const result = await page.evaluate(async files => {
        const a = window.__tact, robot = a.state.models.find(model => model.userData.tcpFrame);
        // Untaught generated points are zero; teach reachable S7 poses into the existing records.
        const taught = {100: [420, 80, -50, 30, 0, 0], 101: [400, 110, -50, 30, 0, 0], 110: [400, 110, -65, 30, 0, 0], 111: [400, 110, -80, 30, 0, 0],
            200: [300, -150, -50, 0, 0, 0], 201: [320, -170, -50, 0, 0, 0], 210: [320, -170, -65, 0, 0, 0], 211: [320, -170, -80, 0, 0, 0]};
        const prepared = Object.entries(files).map(([name, text]) => {
            if (name.endsWith('.pts')) text = text.split(/\r?\n/).map(line => {
                const match = line.match(/^\s*P\[(\d+)\]\s*=/i), pose = taught[Number(match?.[1])];
                if (!pose) return line;
                const segments = line.split(';');
                segments[0] = `P[${match[1]}] = ${pose.join(', ')}`;
                segments[1] = '1, 0, 0, 0';
                return segments.join(';');
            }).join('\r\n');
            return {name: name.split('/').at(-1), relativePath: `SIM/${name}`, text: async () => text};
        });
        [0, 0, 0, 0].forEach((angle, i) => a.setJointAngle(robot.userData.joints[i], angle, false));
        const project = await a.buildOlpProjectFromFiles(prepared);
        a.activateOlpProject(project, {robot, enabled: true, connectBus: false});
        // The real OLP Start path: the session runs main.pro to End and keeps the log after it stops.
        await a.startOlpSession({robot});
        const log = a.state.olp.tactLogs?.get(robot.userData.motionInstanceId);
        const execution = a.state.olp.executions?.get?.(robot.userData.motionInstanceId) || {};
        return {error: execution.error || '', phase: execution.phase || '', status: a.state.olp.status,
            cycles: log.cycles.map(cycle => ({...cycle})),
            moves: log.moves.map(({motion, target, cycle, seconds, gapSeconds, estimated, failed, process, functionName}) =>
                ({motion, target, cycle, seconds, gapSeconds, estimated, failed, process, functionName}))};
    }, generateSimulationProject());

    expect(result.error).toBe('');
    expect(result.status).not.toBe('error');
    expect(result.moves[0]).toMatchObject({motion: 'HOME', cycle: null});
    expect(result.cycles.map(cycle => cycle.index)).toEqual([1, 2]);
    for (const cycle of result.cycles) {
        const moves = result.moves.filter(move => move.cycle === cycle.index);
        expect(moves.length).toBe(cycle.moveCount);
        expect(moves.every(move => !move.failed && !move.estimated && Number.isFinite(move.seconds))).toBe(true);
        expect(moves.some(move => move.target === 'P2_Work' && move.motion === 'MOVL')).toBe(true);
        // Non-motion time is exactly the generated PLC tool time: Tool_Vac_ON, Stage_Vac_ON and Tool_Vac_OFF.
        expect(cycle.waitSeconds).toBeCloseTo(0.6, 6);
        expect(cycle.seconds).toBeCloseTo(cycle.motionSeconds + 0.6, 6);
    }
    // The second cycle starts at P2's work position and first returns through P2's path.
    expect(result.moves.find(move => move.cycle === 2)).toMatchObject({process: 'P1_pos', functionName: 'Return_move', target: 'P2_Pre_work'});

    // activateOlpProject opened the OLP workspace; the table follows the selected robot's last run.
    await expect(page.locator('#olp-tact-panel')).toBeVisible();
    const rows = page.locator('#olp-tact-body tr');
    await expect(rows).toHaveCount(result.cycles[1].moveCount);
    await expect(page.locator('#olp-tact-summary')).toContainText('사이클 2:');
    await expect(page.locator('#olp-tact-cycle option')).toHaveCount(3);
    await expect(rows.first().locator('.olp-tact-target')).toHaveText('P2_Pre_work');
    await expect(rows.first().locator('.olp-tact-meta')).toHaveText('P1_pos › Return_move · MovL V100 Z[1]');
    // The longest move is highlighted (symmetric paths can tie).
    const longest = Math.max(...result.moves.filter(move => move.cycle === 2).map(move => move.seconds));
    const highlighted = await page.locator('#olp-tact-body tr.longest td:nth-child(3)').allTextContents();
    expect(highlighted.length).toBeGreaterThanOrEqual(1);
    for (const text of highlighted) expect(Number(text)).toBeCloseTo(longest, 3);
    if (process.env.INOROBOT_TACT_SCREENSHOT) await page.locator('#olp-tact-panel').screenshot({path: process.env.INOROBOT_TACT_SCREENSHOT});

    await page.locator('#olp-tact-cycle').selectOption('1');
    await expect(rows).toHaveCount(result.cycles[0].moveCount);
    await expect(page.locator('#olp-tact-summary')).toContainText('사이클 1:');

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#olp-tact-export').click()]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    expect(csv.replace(/^\uFEFF/, '').split(/\r\n/)[0]).toBe('cycle,sequence,process,function,file,line,motion,target,speed,zone,acc,dec,move_s,gap_s,start_s,end_s,blended,estimated,failed');
    expect(csv).toContain('cycle,cycle_s,motion_s,non_motion_s,moves,timeout_wall_s');
    expect(errors).toEqual([]);
});
