import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/robot-native-ts-fk-gold.json',import.meta.url),'utf8'));

for(const group of fixture.groups)test(`${group.folder} flange/TCP frames and Cartesian IK match original ceiling-SCARA firmware`,async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()+'\nwindow.__ceilingFrames={THREE,state,setJointAngle,getCurrentTcpPoseBase,ensureRobotTcpProfiles,applyOlpTcpProfile,solveScaraIK,getTcpRotationDegrees,quaternionFromTcpRotationDegrees};'});
    });
    await page.goto('/2_3DSimulation/index.html');await page.waitForFunction(()=>window.__ceilingFrames);
    await page.locator('#model-select').selectOption(`robot:${group.folder}`);
    await page.waitForFunction(folder=>window.__ceilingFrames.state.models.some(m=>m.userData.motionModelFolder===folder&&m.userData.tcpFrame),group.folder);
    const results=await page.evaluate(({folder,cases})=>{
        const a=window.__ceilingFrames,robot=a.state.models.find(m=>m.userData.motionModelFolder===folder);
        const rows=[];
        for(const row of cases) {
            a.ensureRobotTcpProfiles(robot);
            robot.userData.tcpProfiles[1].position.fromArray(row.toolTranslationMm);
            a.applyOlpTcpProfile(robot,{tool:1});
            row.joints.forEach((value,i)=>a.setJointAngle(robot.userData.joints[i],value,false));
            const pose=a.getCurrentTcpPoseBase(robot);
            const matrix=new a.THREE.Matrix4().makeRotationFromQuaternion(pose.quaternion).elements;
            const rotation=[matrix[0],matrix[4],matrix[8],matrix[1],matrix[5],matrix[9],matrix[2],matrix[6],matrix[10]];
            const result={positionError:Math.hypot(...pose.position.toArray().map((value,i)=>value-row.position[i])),
                rotationError:Math.max(...rotation.map((value,i)=>Math.abs(value-row.rotation[i])))};
            const reported=a.getTcpRotationDegrees(robot,pose);
            const nativeYawDegrees=row.nativeCoordinateItem[3]*180/Math.PI;
            const yawDifference=(reported.rz-nativeYawDegrees)*Math.PI/180;
            result.reportedYawError=Math.abs(Math.atan2(Math.sin(yawDifference),Math.cos(yawDifference)));
            result.programYawError=a.quaternionFromTcpRotationDegrees(robot,0,0,nativeYawDegrees).angleTo(pose.quaternion);
            if(Math.abs(row.joints[1])>1) {
                [10,20,-30,-10].forEach((value,i)=>a.setJointAngle(robot.userData.joints[i],value,false));
                const solved=a.solveScaraIK(robot,pose);
                const recovered=a.getCurrentTcpPoseBase(robot);
                Object.assign(result,{ikSuccess:solved.success,ikPositionError:recovered.position.distanceTo(pose.position),
                    ikRotationError:recovered.quaternion.angleTo(pose.quaternion)});
            }
            rows.push(result);
        }
        return rows;
    },group);
    for(const row of results) {
        expect(row.positionError).toBeLessThan(1e-7);expect(row.rotationError).toBeLessThan(1e-9);
        expect(row.reportedYawError).toBeLessThan(1e-9);expect(row.programYawError).toBeLessThan(1e-7);
        if('ikSuccess'in row){expect(row.ikSuccess).toBe(true);expect(row.ikPositionError).toBeLessThan(.01);expect(row.ikRotationError).toBeLessThan(.0002);}
    }
    expect(errors).toEqual([]);
});
