import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {normalizeToolLoad,combineToolLoads} from '../../2_3DSimulation/tool-data-core.mjs';
const THREE=await import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js',import.meta.url),'utf8')).toString('base64')}`);
const source=fs.readFileSync(new URL('../../2_3DSimulation/main.js',import.meta.url),'utf8');

test('six-axis CAD accessory frames map to native J3/J4 dynamics frames exactly once',()=>{
    const state={models:[]},robot=new THREE.Group(),j3=new THREE.Group(),j4=new THREE.Group();
    robot.position.set(400,-200,30);robot.rotation.set(.2,-.3,.7);
    j3.position.set(50,0,790);j3.rotation.y=-.4;robot.add(j3);
    j4.position.set(0,0,40);j4.rotation.x=.3;j3.add(j4);
    const toolLoad={mass:2,cog:[1,2,3],inertia:[.01,.02,.03]};
    robot.userData={manifest:{robotType:'six-axis',structure:[50,440,40,420,78,350],rapidMove:{enabled:true}},
        motionModelName:'IR-R7H-90S-INT',motionModelFolder:'IR-R7H-90',joints:[{},{},{group:j3},{group:j4}],activeTcpProfileIndex:1,
        tcpProfiles:[{position:new THREE.Vector3(),load:normalizeToolLoad()},{position:new THREE.Vector3(120,-30,80),load:toolLoad}]};
    const accessory=(frame,index,mountOffset,position,rotation)=>{
        const mount=new THREE.Group();mount.position.fromArray(mountOffset);frame.add(mount);
        const model=new THREE.Group();model.position.fromArray(position);model.rotation.set(...rotation);model.scale.set(2,2,2);mount.add(model);
        model.userData={placement:'arm-load',attachmentHost:robot,attachmentJointIndex:index,
            armLoadProperties:{mass:3,cogX:4,cogY:5,cogZ:6,ixx:.1,iyy:.2,izz:.3}};
        state.models.push(model);
    };
    accessory(j3,2,[36,0,99.5],[10,20,30],[0,0,Math.PI/2]);
    accessory(j4,3,[297,0,49.5],[-20,10,40],[Math.PI/2,0,0]);
    const context=vm.createContext({THREE,state,normalizeToolLoad,combineToolLoads,
        ensureRobotTcpProfiles:r=>r.userData.tcpProfiles,normalizeArmLoadProperties:value=>({...value}),
        getArmLoadJointIndex:model=>model.userData.attachmentJointIndex});
    vm.runInContext(source.match(/function getRobotRapidMoveOptions\([^]*?\n\}/)[0],context);
    const result=context.getRobotRapidMoveOptions(robot);
    const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
    assert.equal(result.armLoads.length,2);
    // CAD offsets+rotated stored COM (already scaled) are J3[41,24,135.5],
    // J4[281,4,94.5]. The native basis is independently verified by original
    // point-mass M/G execution; it differs from the CAD joint-group basis.
    const expected=[{index:2,cog:[135.5,-41,-24],inertia:[.3,.2,.1]},
        {index:3,cog:[94.5,-4,281],inertia:[.2,.3,.1]}];
    result.armLoads.forEach((load,i)=>{
        assert.equal(load.linkIndex,expected[i].index);assert.equal(load.mass,3);
        load.cog.forEach((value,j)=>near(value,expected[i].cog[j]));
        load.inertia.forEach((value,j)=>near(value,expected[i].inertia[j]));
    });
    assert.deepEqual(Array.from(result.toolLoad.cog),[1,2,3]);
    assert.deepEqual(Array.from(result.toolTranslationMm),[120,-30,80]);
    assert.deepEqual(Array.from(result.loadDiagnostics),[]);
});

test('ceiling SCARA accessory CoG rotates into the native folded-link frame without changing programmed ToolLoad',()=>{
    const state={models:[]},robot=new THREE.Group(),j2=new THREE.Group();
    robot.rotation.set(.2,-.3,.7);robot.add(j2);j2.position.x=175;j2.rotation.z=-.5;
    robot.userData={manifest:{robotType:'scara',kinematicVariant:'ceiling-scara',secondArmDirection:-1,
        structure:[175,175,0,16],rapidMove:{enabled:true}},motionModelName:'IR-TS4-35Z15S-INT',motionModelFolder:'IR-TS4-35Z15',
        joints:[{},{group:j2}],activeTcpProfileIndex:1,
        tcpProfiles:[{position:new THREE.Vector3(),load:normalizeToolLoad()},
            {position:new THREE.Vector3(30,10,-20),load:{mass:2,cog:[1,2,3],inertia:[.01,.02,.03]}}]};
    const mount=new THREE.Group();mount.position.set(-111.024,0,68.4);j2.add(mount);
    const arm=new THREE.Group();arm.position.set(10,20,30);arm.rotation.z=Math.PI/2;mount.add(arm);
    arm.userData={placement:'arm-load',attachmentHost:robot,attachmentJointIndex:1,
        armLoadProperties:{mass:3,cogX:4,cogY:5,cogZ:6,ixx:.1,iyy:.2,izz:.3}};
    state.models.push(arm);
    const context=vm.createContext({THREE,state,normalizeToolLoad,combineToolLoads,
        ensureRobotTcpProfiles:r=>r.userData.tcpProfiles,normalizeArmLoadProperties:value=>({...value}),
        getArmLoadJointIndex:model=>model.userData.attachmentJointIndex});
    vm.runInContext(source.match(/function getRobotRapidMoveOptions\([^]*?\n\}/)[0],context);
    const result=context.getRobotRapidMoveOptions(robot),load=result.armLoads[0];
    [106.024,-24,104.4].forEach((value,i)=>assert.ok(Math.abs(load.cog[i]-value)<1e-9));
    [.2,.1,.3].forEach((value,i)=>assert.ok(Math.abs(load.inertia[i]-value)<1e-9));
    assert.deepEqual(Array.from(result.toolLoad.cog),[1,2,3]);
    assert.deepEqual(Array.from(result.toolTranslationMm),[30,10,-20]);
});
