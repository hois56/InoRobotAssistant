import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {OlpRuntime} from '../../2_3DSimulation/olp-runtime.mjs';
import {normalizeToolLoad} from '../../2_3DSimulation/tool-data-core.mjs';
const threeSource=fs.readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js',import.meta.url),'utf8');
const THREE=await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);
const source=fs.readFileSync(new URL('../../2_3DSimulation/main.js',import.meta.url),'utf8');

test('OLP Tool fields retain explicit zeros and distinguish unassigned values',()=>{
    const r=new OlpRuntime({});
    assert.equal(r.getToolOverrides(1),null);
    r.writeSymbol('tOoL [ 1 ] . TLoad . Mass',.763255778);
    r.writeSymbol('Tool[1].TFrame.X',0);
    r.writeSymbol('Tool[1].TFrame.A',90);
    r.writeSymbol('Tool[1].TLoad.Cog[2]',-56.95625085);
    r.writeSymbol('Tool[1].TLoad.Inertia[2]',.000615142);
    const tool=r.getToolOverrides(1);
    assert.equal(tool.load.mass,.763255778);
    assert.equal(tool.frame.position[0],0);
    assert.equal(tool.frame.position[1],undefined);
    assert.equal(tool.frame.rotation[2],90);
    assert.equal(tool.load.cog[2],-56.95625085);
    assert.equal(tool.load.inertia[2],.000615142);
    assert.equal(r.getToolOverrides(2),null);
});

test('actual OLP assignments reach the selected live Tool without changing saved UI data',async()=>{
    const robot=new THREE.Group(),tcpFrame=new THREE.Group();robot.add(tcpFrame);
    const saved={position:new THREE.Vector3(20,30,-40),quaternion:new THREE.Quaternion(),load:{mass:6,cog:[1,2,3],inertia:[.01,.02,.03]}};
    robot.userData={tcpFrame,activeTcpProfileIndex:1,tcpProfiles:[{position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),load:normalizeToolLoad()},saved]};
    const c=vm.createContext({THREE,normalizeToolLoad,TCP_PROFILE_COUNT:16,state:{},ensureRobotTcpProfiles:r=>r.userData.tcpProfiles,
        normalizeTcpProfile:p=>({position:p.position.clone(),quaternion:p.quaternion.clone(),load:normalizeToolLoad(p.load)}),
        getTcpProfileRotationDegrees:p=>{const e=new THREE.Euler().setFromQuaternion(p.quaternion,'ZYX');return {rx:e.x*180/Math.PI,ry:e.y*180/Math.PI,rz:e.z*180/Math.PI};},
        syncActiveTcpFrame:r=>{const p=r.userData.tcpLiveProfile||r.userData.tcpProfiles[r.userData.activeTcpProfileIndex];r.userData.tcpFrame.position.copy(p.position);r.userData.tcpFrame.quaternion.copy(p.quaternion);},
        captureCurrentTcpTarget(){},refreshTcpProfileUi(){}});
    vm.runInContext(source.match(/function applyOlpTcpProfile\([^]*?\n\}/)[0],c);
    const seen=[];
    const text='Start\nTool[1].TLoad.Mass = 0.763255778;\nTool[1].TLoad.Cog[2] = -56.95625085;\nTool[1].TFrame.X = 0;\nTool[1].TFrame.A = 90;\nMovJ JP[0], Tool[1];\nTool[1].TLoad.Mass = 0;\nMovJ JP[0];\nEnd';
    const p={programPath:'main.pro',programFiles:['main.pro'],programs:[{path:'main.pro',text}],pointRecords:[{kind:'jointPoint',sourceSymbol:'JP',index:0,values:[0,0,-20,0]}]};
    await new OlpRuntime(p,{move:async(_m,_p,_s,_prj,r,opts)=>{c.applyOlpTcpProfile(robot,opts,r);const live=robot.userData.tcpLiveProfile;seen.push({mass:live?.load.mass,cog:live?.load.cog,position:tcpFrame.position.toArray(),rotation:tcpFrame.quaternion.toArray()});}}).run();
    assert.equal(seen[0].mass,.763255778);
    assert.deepEqual(Array.from(seen[0].cog),[1,2,-56.95625085]);
    assert.deepEqual(seen[0].position,[0,30,-40]);
    assert.ok(Math.abs(seen[0].rotation[2]-Math.SQRT1_2)<1e-10);
    assert.equal(seen[1].mass,0);
    assert.equal(saved.load.mass,6);
    assert.deepEqual(saved.position.toArray(),[20,30,-40]);
});
