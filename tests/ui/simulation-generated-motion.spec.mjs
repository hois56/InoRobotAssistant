import {test,expect} from '@playwright/test';
import {generateOlpGeneratorCases} from '../support/generated-olp-projects.mjs';

async function openRobot(page) {
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()+'\nwindow.__generatedMotion={THREE,state,OlpRuntime,ensureRobotTcpProfiles,syncActiveTcpFrame,getCurrentTcpPoseBase,getTcpRotationDegrees,getRobotControllerBaseFrame,ensureRobotWorkObjects,getOlpCurrentPosition,setJointAngle,animateOlpJointMove,getOlpEffectiveMotionSpeed,runOlpMove,runOlpHome,buildOlpProjectFromFiles};'});
    });
    await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__generatedMotion);
    await page.locator('#model-select').selectOption('robot:IR-S7-60Z20');
    await page.waitForFunction(()=>window.__generatedMotion.state.models.some(model=>model.userData.tcpFrame));
    return errors;
}

test('generated MovL follows the active TCP Cartesian line at the requested absolute speed on every displayed frame',async({page})=>{
    const errors=await openRobot(page);
    const result=await page.evaluate(async()=>{
        const a=window.__generatedMotion,r=a.state.models.find(model=>model.userData.tcpFrame);
        a.ensureRobotTcpProfiles(r);r.userData.activeTcpProfileIndex=1;
        r.userData.tcpProfiles[1].position.set(35,-10,20);a.syncActiveTcpFrame(r);
        const start=[-20,70,-80,10],end=[10,60,-110,15];
        end.forEach((value,i)=>a.setJointAngle(r.userData.joints[i],value,false));
        const targetPose=a.getCurrentTcpPoseBase(r);
        start.forEach((value,i)=>a.setJointAngle(r.userData.joints[i],value,false));
        const startPose=a.getCurrentTcpPoseBase(r),samples=[];
        await a.animateOlpJointMove(r,end,300,{motion:'MOVL',startPose,targetPose,
            motionOptions:{speedMode:'absolute',rapidMove:{ptp:false}},
            onProgress:metrics=>samples.push({...metrics,position:a.getCurrentTcpPoseBase(r).position.toArray()})});
        const delta=targetPose.position.clone().sub(startPose.position),distance=delta.length();
        const measured=samples.map(sample=>{
            const p=new a.THREE.Vector3().fromArray(sample.position),t=p.clone().sub(startPose.position).dot(delta)/distance**2;
            return {...sample,t,error:p.distanceTo(startPose.position.clone().addScaledVector(delta,t))};
        });
        const peak=Math.max(...measured.slice(1).map((sample,i)=>{
            const dt=sample.elapsedSeconds-measured[i].elapsedSeconds;
            return dt>1e-6?new a.THREE.Vector3().fromArray(sample.position).distanceTo(new a.THREE.Vector3().fromArray(measured[i].position))/dt:0;
        }));
        return{count:samples.length,maxError:Math.max(...measured.map(sample=>sample.error)),
            monotonic:measured.every((sample,i)=>i===0||sample.t>=measured[i-1].t-1e-5),distance,
            duration:samples.at(-1).durationSeconds,endpoint:a.getCurrentTcpPoseBase(r).position.distanceTo(targetPose.position),peak};
    });
    expect(result.count).toBeGreaterThan(10);expect(result.maxError).toBeLessThan(.05);
    expect(result.monotonic).toBe(true);expect(result.endpoint).toBeLessThan(.01);
    expect(result.duration).toBeGreaterThanOrEqual(result.distance/300);
    expect(result.peak).toBeLessThan(320);expect(errors).toEqual([]);
});

test('an actual generated S7 main project executes its taught Home, MovJ and MovL cycle through the real 3D adapters',async({page})=>{
    const errors=await openRobot(page);
    await page.locator('#program-work-origin-robot').click();
    await page.locator('#btn-register-work-origin').click();
    await page.locator('#program-work-origin-robot').click();
    const generated=generateOlpGeneratorCases({optionOverrides:{RobotName:'IR-S7-60Z20S3-C2LH-INT_01741021',EnableTorque:false,EnableTcpSpeed:false}})
        .find(entry=>entry.name==='single-cell-tray');
    const result=await page.evaluate(async files=>{
        const a=window.__generatedMotion,r=a.state.models.find(model=>model.userData.tcpFrame);
        // A freshly generated project contains untaught zero points. Teach its
        // existing records to valid S7 poses; keep every generated .pro intact.
        const taught={100:[420,80,-50,30,0,0],101:[400,110,-50,30,0,0],110:[400,110,-65,30,0,0],111:[400,110,-80,30,0,0]};
        const prepared=Object.entries(files).map(([name,text])=>{
            if(name.endsWith('.pts'))text=text.split(/\r?\n/).map(line=>{
                const match=line.match(/^\s*P\[(\d+)\]\s*=/i),pose=taught[Number(match?.[1])];
                if(!pose)return line;
                const segments=line.split(';');segments[0]=`P[${match[1]}] = ${pose.join(', ')}`;segments[1]='1, 0, 0, 0';return segments.join(';');
            }).join('\r\n');
            return{name:name.split('/').at(-1),relativePath:`GeneratedProject/${name}`,text:async()=>text};
        });
        const project=await a.buildOlpProjectFromFiles(prepared),banks={IN:new Uint8Array(65536),OUT:new Uint8Array(65536)};
        const address=value=>typeof value==='object'?value:(()=>{const m=value.match(/^(IN|OUT)(W|B)?\[(\d+)\]$/i);return{prefix:m[1].toUpperCase()+(m[2]??'').toUpperCase(),index:Number(m[3])};})();
        const location=value=>{const ad=address(value),width=ad.prefix.endsWith('W')?16:ad.prefix.endsWith('B')?8:1;return{bank:banks[ad.prefix.startsWith('IN')?'IN':'OUT'],start:ad.index*width,width};};
        const read=value=>{const{bank,start,width}=location(value);let n=0;for(let i=0;i<width;i++)n+=bank[start+i]*2**i;return n;};
        const write=(value,n)=>{const{bank,start,width}=location(value);for(let i=0;i<width;i++)bank[start+i]=(Number(n)>>>i)&1;};
        const label=name=>project.labels[Object.keys(project.labels).find(key=>key.toLowerCase()===name.toLowerCase())];
        const set=(name,value)=>write(label(name),value),get=name=>read(label(name));
        set('yRobot_home_sts',1);set('xwSet_speed',100);set('xwProcess_work_pos',1);
        let runtime,completed=false,timedOut=false;const moves=[],homes=[];
        runtime=new a.OlpRuntime(project,{
            readAddress:ad=>read(ad),writeAddress:(ad,value)=>{write(ad,value);if(get('yP1_work_pos_comp')===1){completed=true;set('xwProcess_work_pos',0);}},
            move:async(...args)=>{moves.push({motion:args[0],expression:args[1]});return a.runOlpMove(...args);},
            home:async(...args)=>{homes.push(args[0]);return a.runOlpHome(...args);},
            getCurrentPosition:(kind,current)=>a.getOlpCurrentPosition(kind,current),
            delay:milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))
        });runtime.robot=r;
        const deadline=setTimeout(()=>{timedOut=true;runtime.stop();},12000);
        const monitor=setInterval(()=>{if(completed&&get('ywProcess_work_busy')===0)runtime.stop();},5);
        let error='';try{await runtime.run('main.pro');}catch(problem){if(!runtime.cancelled||!completed)error=problem.message;}
        finally{clearTimeout(deadline);clearInterval(monitor);runtime.stop();}
        const pose=a.getCurrentTcpPoseBase(r);
        return{error,timedOut,completed,moves,homes,position:pose.position.toArray(),curPos:runtime.readSymbol('R_Cur_pos'),
            completeWord:get('ywProcess_work_comp'),busyWord:get('ywProcess_work_busy'),tool:r.userData.activeTcpProfileIndex,
            tasks:runtime.backgroundTasks.map(task=>({path:task.path,running:task.runtime.running,scans:task.scans}))};
    },generated.files);
    expect(result.error).toBe('');expect(result.timedOut).toBe(false);expect(result.completed).toBe(true);
    expect(result.homes).toEqual([0]);expect(result.moves.map(move=>move.motion)).toEqual(['MOVJ','MOVJ','MOVJ','MOVL']);
    expect(result.curPos).toBe(111);expect(result.completeWord).toBe(1);expect(result.busyWord).toBe(0);expect(result.tool).toBe(1);
    result.position.forEach((value,i)=>expect(value).toBeCloseTo([400,110,-80][i],2));
    expect(result.tasks).toHaveLength(1);expect(result.tasks[0].scans).toBeGreaterThan(0);expect(result.tasks[0].running).toBe(false);
    expect(errors).toEqual([]);
});

test('slow generated MovL is not shortened to an eight-second duration',async({page})=>{
    const errors=await openRobot(page);
    const result=await page.evaluate(async()=>{
        const a=window.__generatedMotion,r=a.state.models.find(model=>model.userData.tcpFrame);
        const start=[-20,70,-80,10],end=[10,60,-110,15];
        end.forEach((value,i)=>a.setJointAngle(r.userData.joints[i],value,false));const targetPose=a.getCurrentTcpPoseBase(r);
        start.forEach((value,i)=>a.setJointAngle(r.userData.joints[i],value,false));const startPose=a.getCurrentTcpPoseBase(r),samples=[];
        const returned=await a.animateOlpJointMove(r,end,20,{motion:'MOVL',startPose,targetPose,
            motionOptions:{speedMode:'absolute',rapidMove:{ptp:false}},shouldStop:()=>samples.length>=2,onProgress:sample=>samples.push(sample)});
        return{distance:startPose.position.distanceTo(targetPose.position),duration:samples[0].durationSeconds,interrupted:returned.interrupted};
    });
    expect(result.interrupted).toBe(true);expect(result.distance/20).toBeGreaterThan(8);
    expect(result.duration).toBeGreaterThanOrEqual(result.distance/20);expect(errors).toEqual([]);
});

test('an unreachable generated Cartesian target reports an error instead of moving to a silently clamped point',async({page})=>{
    const errors=await openRobot(page);
    const result=await page.evaluate(async()=>{
        const a=window.__generatedMotion,r=a.state.models.find(model=>model.userData.tcpFrame);
        [-20,70,-80,10].forEach((value,i)=>a.setJointAngle(r.userData.joints[i],value,false));
        const before=r.userData.joints.map(joint=>joint.angle);
        const project={programs:[],programFiles:[],pointRecords:[{kind:'point',sourceSymbol:'P',index:100,name:'Outside',values:[10000,0,-50,0,0,0]}]};
        const runtime=new a.OlpRuntime(project,{});runtime.robot=r;
        let error='';try{await a.runOlpMove('MOVJ','P[100]',100,project,runtime,{tool:0,wobj:0,zone:0});}catch(problem){error=problem.message;}
        return{error,change:Math.max(...r.userData.joints.map((joint,i)=>Math.abs(joint.angle-before[i])))};
    });
    expect(result.error).toMatch(/IK|unreachable|range/i);expect(result.change).toBeLessThan(1e-7);expect(errors).toEqual([]);
});

test('generated GetCurPos uses the selected Tool and Wobj including moved robot and work-object frames',async({page})=>{
    const errors=await openRobot(page);
    const result=await page.evaluate(()=>{
        const a=window.__generatedMotion,r=a.state.models.find(model=>model.userData.tcpFrame);
        a.ensureRobotTcpProfiles(r);r.userData.activeTcpProfileIndex=1;r.userData.tcpProfiles[1].position.set(35,-10,20);a.syncActiveTcpFrame(r);
        [-20,70,-80,10].forEach((value,i)=>a.setJointAngle(r.userData.joints[i],value,false));
        r.position.add(new a.THREE.Vector3(250,-100,0));r.rotation.z=.3;r.updateMatrixWorld(true);
        const workObjects=a.ensureRobotWorkObjects(r);workObjects[1].defined=true;workObjects[1].position=[100,200,300];workObjects[1].rotation=[0,0,40];
        r.userData.activeWorkObjectIndex=1;
        const runtime=new a.OlpRuntime({programs:[],programFiles:[]},{});runtime.robot=r;runtime.motionSettings.tool=1;runtime.motionSettings.wobj=1;
        const worldPosition=r.userData.tcpFrame.getWorldPosition(new a.THREE.Vector3());
        const worldQuaternion=r.userData.tcpFrame.getWorldQuaternion(new a.THREE.Quaternion());
        const inverseWobj=new a.THREE.Quaternion().setFromAxisAngle(new a.THREE.Vector3(0,0,1),-40*Math.PI/180);
        const expected=worldPosition.clone().sub(new a.THREE.Vector3(100,200,300)).applyQuaternion(inverseWobj);
        const expectedRotation=new a.THREE.Euler().setFromQuaternion(inverseWobj.clone().multiply(worldQuaternion),'ZYX').z*180/Math.PI;
        const actual=a.getOlpCurrentPosition('point',runtime);
        runtime.motionSettings.wobj=0;r.userData.activeWorkObjectIndex=0;
        const base=a.getOlpCurrentPosition('point',runtime),baseExpected=a.getCurrentTcpPoseBase(r);
        const yaw=(actual[3]-expectedRotation)*Math.PI/180;
        return{error:new a.THREE.Vector3().fromArray(actual).distanceTo(expected),rotationError:Math.abs(Math.atan2(Math.sin(yaw),Math.cos(yaw))),
            baseError:new a.THREE.Vector3().fromArray(base).distanceTo(baseExpected.position),difference:new a.THREE.Vector3().fromArray(actual).distanceTo(new a.THREE.Vector3().fromArray(base))};
    });
    expect(result.difference).toBeGreaterThan(10);expect(result.error).toBeLessThan(1e-7);
    expect(result.rotationError).toBeLessThan(1e-9);expect(result.baseError).toBeLessThan(1e-7);expect(errors).toEqual([]);
});
