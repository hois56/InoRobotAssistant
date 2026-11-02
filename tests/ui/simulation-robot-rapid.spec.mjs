import {test,expect} from '@playwright/test';
import {RAPID_MODEL_DATA as data} from '../../2_3DSimulation/rapid-model-data.mjs';

test('all priority robot models select their own offline dynamics through the real 3D UI',async({page})=>{
    test.setTimeout(180_000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()+'\nwindow.__rapidModels={state,createRapidMoveState,getRobotRapidMoveOptions,ensureRobotTcpProfiles,setJointAngle,animateOlpJointMove};'});
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(()=>window.__rapidModels);
    const priorities=Object.entries(data.models).filter(([,row])=>row.priority<=8);
    expect(priorities).toHaveLength(15);
    for(const [index,[folder,entry]] of priorities.entries())await test.step(folder,async()=>{
        await page.locator('#model-select').selectOption(`robot:${folder}`);
        if(index>0)await page.locator('#btn-replace-robot-model-choice').click();
        await page.waitForFunction(folder=>window.__rapidModels.state.models.some(m=>m.userData.motionModelFolder===folder&&m.userData.tcpFrame),folder);
        const playback=['IR-R7H-90','IR-S4-40Z15','IR-S25-100Z42'].includes(folder);
        const result=await page.evaluate(async({folder,playback})=>{
            const a=window.__rapidModels,robot=a.state.models.find(m=>m.userData.motionModelFolder===folder);
            const six=robot.userData.joints.length===6;
            const start=six?[0,-30,40,0,20,0]:[0,-30,-40,0];
            const target=six?[20,-25,50,15,25,30]:[20,10,-70,30];
            start.forEach((v,i)=>a.setJointAngle(robot.userData.joints[i],v,false));
            const profiles=a.ensureRobotTcpProfiles(robot);robot.userData.activeTcpProfileIndex=1;
            profiles[1].load={mass:1,cog:[10,20,30],inertia:[.001,.002,.003]};
            const plan=settings=>a.createRapidMoveState(start,target,robot.userData.joints,100,a.getRobotRapidMoveOptions(robot,settings));
            const flangeLoadBefore=a.getRobotRapidMoveOptions(robot).toolLoad;
            const original=plan({rapidMove:{ptp:true}});
            robot.userData.tcpProfiles[1].position.set(100,40,30);
            const translatedOptions=a.getRobotRapidMoveOptions(robot);
            const movedTcp=plan({rapidMove:{ptp:true}});
            robot.userData.tcpProfiles[1].load={mass:2,cog:[10,20,30],inertia:[.001,.002,.003]};
            const heavier=plan({rapidMove:{ptp:true}});
            robot.userData.tcpProfiles[1].load={mass:1,cog:[10,20,30],inertia:[.001,.002,.003]};
            const off=plan({rapidMove:{ptp:false}}),cpOff=plan({rapidMove:{ptp:true,cp:false}});
            const metrics=[];
            if(playback)await a.animateOlpJointMove(robot,target,100,{motion:'MOVJ',motionOptions:{rapidMove:{ptp:true},motionQueueTiming:{nextStartAt:NaN}},onProgress:m=>metrics.push(m)});
            return {folder:robot.userData.motionModelFolder,source:original.dynamics?.sourceModel,
                planner:original.planner,duration:original.durationSeconds,movedTcp:movedTcp.durationSeconds,
                flangeLoadBefore,flangeLoadAfter:translatedOptions.toolLoad,toolTranslationMm:translatedOptions.toolTranslationMm,
                heavierMass:heavier.dynamics?.estimatedMovingPayloadKg,off:off.enabled,cpSource:cpOff.dynamics?.sourceModel,
                last:metrics.at(-1),actual:robot.userData.joints.map(j=>j.angle),target};
        },{folder,playback});
        expect(result.folder).toBe(folder);
        expect(result.source).toBe(entry.defaultVariantId);
        expect(result.cpSource).toBe(entry.defaultVariantId);
        expect(result.duration).toBeGreaterThan(0);
        // TCP translation affects native six-axis mechanical reach. It must
        // remain separate from the ToolLoad CoG, already in the flange frame.
        expect(result.flangeLoadAfter).toEqual(result.flangeLoadBefore);
        expect(result.toolTranslationMm).toEqual([100,40,30]);
        expect(result.heavierMass).toBe(2);
        expect(result.off).toBe(false);
        if(playback) {
            expect(result.last.progress).toBe(1);
            expect(result.last.durationSeconds).toBeCloseTo(result.movedTcp,10);
            result.actual.forEach((value,i)=>expect(value).toBeCloseTo(result.target[i],7));
        }
    });
    expect(errors).toEqual([]);
});
