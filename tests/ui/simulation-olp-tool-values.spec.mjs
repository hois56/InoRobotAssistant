import {test,expect} from '@playwright/test';

test('OLP Tool assignments reach RapidMove planning while saved Tool data remains available',async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()+'\nwindow.__olpTool={state,OlpRuntime,runOlpMove,ensureRobotTcpProfiles,getRobotRapidMoveOptions};'});
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(()=>window.__olpTool);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(()=>window.__olpTool.state.models.some(m=>m.userData.tcpFrame));
    const result=await page.evaluate(async()=>{
        const a=window.__olpTool,robot=a.state.models.find(m=>m.userData.tcpFrame);
        const profiles=a.ensureRobotTcpProfiles(robot);
        profiles[1].position.set(20,0,0);profiles[1].load={mass:6,cog:[0,0,0],inertia:[0,0,0]};
        const text='Start\nRapidMove(ALL,ON);\nTool[1].TFrame.X=0;\nTool[1].TLoad.Mass=0.763255778;\nTool[1].TLoad.Cog[2]=-56.95625085;\nTool[1].TLoad.Inertia[2]=0.000615142;\nMovJ JP[0],V[100],Tool[1];\nEnd';
        const project={programPath:'main.pro',programFiles:['main.pro'],programs:[{path:'main.pro',text}],
            pointRecords:[{kind:'jointPoint',sourceSymbol:'JP',index:0,values:[15,30,-40,5]}]};
        const runtime=new a.OlpRuntime(project,{move:a.runOlpMove});runtime.robot=robot;
        await runtime.run();
        const options=a.getRobotRapidMoveOptions(robot);
        return {mass:options.toolLoad.mass,cog:options.toolLoad.cog,inertia:options.toolLoad.inertia,
            tcpX:robot.userData.tcpFrame.position.x,storedMass:robot.userData.tcpProfiles[1].load.mass,
            storedX:robot.userData.tcpProfiles[1].position.x,joints:robot.userData.joints.map(j=>j.angle)};
    });
    expect(result.mass).toBe(.763255778);
    expect(result.cog[2]).toBe(-56.95625085);
    expect(result.inertia[2]).toBe(.000615142);
    expect(result.tcpX).toBe(0);
    expect(result.storedMass).toBe(6);
    expect(result.storedX).toBe(20);
    result.joints.forEach((v,i)=>expect(v).toBeCloseTo([15,30,-40,5][i],8));
    expect(errors).toEqual([]);
});
