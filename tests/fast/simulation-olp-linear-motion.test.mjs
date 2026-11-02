import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as core from '../../2_3DSimulation/motion-program-core.mjs';
const THREE=await import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js',import.meta.url),'utf8')).toString('base64')}`);
const source=fs.readFileSync(new URL('../../2_3DSimulation/main.js',import.meta.url),'utf8');

async function line(speed=1000) {
    let clock=0;const samples=[];
    const start=[0,60,-50,-60],target=[60,60,-50,-120];
    const robot=new THREE.Group();robot.userData={joints:start.map(angle=>({angle})),manifest:{robotType:'scara',cartesianMotion:{maxSpeed:2500}}};
    // Independent 2R Cartesian FK/IK isolates the animation contract from the
    // application's robot solver. Joint interpolation describes an arc here.
    const fk=()=>{
        const [a,b,z]=robot.userData.joints.map(j=>j.angle),q1=a*Math.PI/180,q2=b*Math.PI/180;
        return new THREE.Vector3(300*Math.cos(q1)+300*Math.cos(q1+q2),300*Math.sin(q1)+300*Math.sin(q1+q2),z);
    };
    const first=fk();target.forEach((a,i)=>robot.userData.joints[i].angle=a);const last=fk();start.forEach((a,i)=>robot.userData.joints[i].angle=a);
    const context=vm.createContext({...core,THREE,robot,state:{programSpeedOverride:100},
        performance:{now:()=>clock},window:{setTimeout:fn=>{clock+=250;queueMicrotask(fn);}},
        setJointAngle:(joint,value)=>{joint.angle=value;},captureCurrentTcpTarget(){},appendTcpPathPoint(){},syncJointControls(){},requestRender(){},
        sampleOlpJointMotion(){},finishOlpJointMotion(){},
        solveRobotIK:(_robot,pose)=>{
            const {x,y,z}=pose.position,c=(x*x+y*y-180000)/180000;
            if(Math.abs(c)>1)return{success:false,reason:'unreachable test line'};
            const q2=Math.acos(c),q1=Math.atan2(y,x)-Math.atan2(300*Math.sin(q2),300+300*Math.cos(q2));
            [q1*180/Math.PI,q2*180/Math.PI,z,-(q1+q2)*180/Math.PI].forEach((a,i)=>robot.userData.joints[i].angle=a);
            return{success:true};
        },restoreRobotJointAngles:(_robot,angles)=>angles.forEach((a,i)=>robot.userData.joints[i].angle=a)
    });
    vm.runInContext(source.match(/async function animateOlpJointMove\([^]*?\n\}(?=\r?\n|$)/)[0],context);
    let lastMetric;
    await context.animateOlpJointMove(robot,target,speed,{motion:'MOVL',startPose:{position:first,quaternion:new THREE.Quaternion()},
        targetPose:{position:last,quaternion:new THREE.Quaternion()},onProgress:metric=>{samples.push(fk());lastMetric=metric;}});
    return {samples,first,last,elapsed:clock/1000,duration:lastMetric.durationSeconds};
}

test('MOVL interpolates the TCP line rather than the joint-space arc',async()=>{
    const {samples,first,last}=await line();
    const direction=last.clone().sub(first),length=direction.length();direction.normalize();
    assert.ok(samples.length>3);
    for(const point of samples) {
        const relative=point.clone().sub(first),along=relative.dot(direction),error=relative.clone().addScaledVector(direction,-along).length();
        assert.ok(error<1e-8,`TCP deviated ${error} mm from MOVL line`);assert.ok(along>=-1e-8&&along<=length+1e-8);
    }
    assert.ok(samples.at(-1).distanceTo(last)<1e-8);
});

test('slow or long OLP motions retain their calculated time beyond eight seconds',async()=>{
    const result=await line(10),expected=core.calculateMovlDuration(result.first.distanceTo(result.last),0,10,{maxSpeed:2500});
    assert.ok(expected>8);assert.ok(Math.abs(result.duration-expected)<1e-10);
    assert.ok(result.elapsed>=expected&&result.elapsed-expected<.251);
});
