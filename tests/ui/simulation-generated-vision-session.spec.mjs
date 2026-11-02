import {test,expect} from '@playwright/test';
import {generateOlpGeneratorCases} from '../support/generated-olp-projects.mjs';

test('the real OLP project session connects its virtual-camera panel to the actual generated vision functions',async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()+'\nwindow.__visionSession={state,THREE,buildOlpProjectFromFiles,activateOlpProject,startOlpSession,getOlpRuntimeForRobot,getRobotOlpSocketService,setOlpInputFromIoSimulator,IO_SIMULATOR_DIRECTIONS,readOlpAddress,setJointAngle,getCurrentTcpPoseBase};'});
    });
    await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__visionSession);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(()=>window.__visionSession.state.models.some(model=>model.userData.tcpFrame));
    // Native Home and its reached-output require an explicitly configured
    // origin table/output. Register the loaded S7 zero pose through the UI.
    await page.locator('#program-work-origin-robot').click();
    await page.locator('#btn-register-work-origin').click();
    await page.locator('#program-work-origin-robot').click();
    const entry=generateOlpGeneratorCases({optionOverrides:{RobotName:'IR-S7-60Z20S3-C2LH-INT_01741021',EnableTorque:false,EnableTcpSpeed:false}})
        .find(entry=>entry.name==='step-056-Vision-Check-Vision_Socket_-Use_Socket');
    expect(entry).toBeTruthy();
    await page.evaluate(async files=>{
        const a=window.__visionSession,robot=a.state.models.find(model=>model.userData.tcpFrame);
        [0,0,0,0].forEach((angle,i)=>a.setJointAngle(robot.userData.joints[i],angle,false));
        const points={100:[420,80,-50,30,0,0],101:[400,110,-50,30,0,0],110:[400,110,-65,30,0,0],111:[400,110,-80,30,0,0]};
        const input=Object.entries(files).map(([name,text])=>{
            if(name.endsWith('.pts'))text=text.split(/\r?\n/).map(line=>{
                const match=line.match(/^\s*P\[(\d+)\]\s*=/i),pose=points[Number(match?.[1])];if(!pose)return line;
                const parts=line.split(';');parts[0]=`P[${match[1]}] = ${pose.join(', ')}`;parts[1]='1, 0, 0, 0';return parts.join(';');
            }).join('\r\n');
            return{name:name.split('/').at(-1),relativePath:`VisionProject/${name}`,text:async()=>text};
        });
        const project=await a.buildOlpProjectFromFiles(input);
        a.activateOlpProject(project,{robot,enabled:true,connectBus:false});
        Object.assign(a,{robot,project});
        a.setInput=(name,value)=>{
            const raw=project.labels[name],match=raw.match(/^(IN|INW)\[(\d+)\]$/i),width=match[1].toUpperCase()==='INW'?16:1;
            const bitStart=Number(match[2])*width;
            a.setOlpInputFromIoSimulator({direction:a.IO_SIMULATOR_DIRECTIONS.INPUT,bitStart,bitEnd:bitStart+width-1,bitWidth:width},value);
        };
        a.setInput('xwSet_speed',100);a.setInput('xwProcess_work_pos',1);
    },entry.files);
    await page.locator('#olp-socket-simulator > summary').click();
    await page.locator('#olp-socket-response').fill('1.25,-2.5,3.75');
    await page.locator('#olp-socket-connected').check();
    await page.locator('#olp-socket-auto-reply').check();
    await page.evaluate(()=>{
        const a=window.__visionSession;
        a.running=a.startOlpSession({robot:a.robot});
        a.runtime=a.getOlpRuntimeForRobot(a.robot);
        // The external PLC lowers its request when the actual completion word
        // rises. Keep the real output adapter and virtual camera untouched.
        const write=a.runtime.adapter.writeAddress;
        a.runtime.adapter.writeAddress=(address,value,current)=>{
            write(address,value,current);
            if(a.readOlpAddress(a.project.labels.ywProcess_work_comp,a.runtime)===1)
                a.setInput('xwProcess_work_pos',0);
        };
    });
    await page.waitForFunction(()=>{
        const a=window.__visionSession,r=a.runtime;
        return r?.readSymbol('R_Cur_pos')===111&&r.readPositionSymbol('PR[0]')?.[0]===1.25
            &&a.readOlpAddress(a.project.labels.ywProcess_work_comp,r)===1;
    },null,{timeout:12000});
    const result=await page.evaluate(async()=>{
        const a=window.__visionSession,r=a.runtime;
        a.setInput('xwProcess_work_pos',0);r.stop();await a.running;
        const snapshot=a.getRobotOlpSocketService(a.robot).snapshot(2),pose=a.getCurrentTcpPoseBase(a.robot);
        return{offset:r.readPositionSymbol('PR[0]'),lastSent:snapshot.lastSent,position:pose.position.toArray(),
            error:r.lastError,phase:r.phase,tasks:r.backgroundTasks.map(task=>({scans:task.scans,running:task.runtime.running})),
            staticStartFlag:a.readOlpAddress('IN[12800]',r)};
    });
    expect(result.offset).toEqual([1.25,-2.5,0,3.75,0,0]);expect(result.lastSent).toBe('Shot');
    result.position.forEach((value,i)=>expect(value).toBeCloseTo([400,110,-80][i],2));
    expect(result.phase).toBe('stopped');expect(result.error??'').not.toMatch(/Unsupported|not found|Alarm/i);
    expect(result.tasks).toHaveLength(1);expect(result.tasks[0].scans).toBeGreaterThan(0);expect(result.tasks[0].running).toBe(false);
    expect(result.staticStartFlag).toBe(0);expect(errors).toEqual([]);
    await expect(page.locator('#olp-socket-last-sent')).toHaveText('Shot');
});
