import {nativeSixMatrixArithmetic,nativeScaraMatrixArithmetic} from './native-matrix-arithmetic.mjs?v=20261102-models-2';

const layouts={
    'six-axis':{axes:6,active:0xab0,matrix:0x774,c1:0x804,c2:0x894,c2Columns:15,gravity:0x9fc,gravityInput:0xf30,run:nativeSixMatrixArithmetic},
    scara:{axes:4,active:0x670,matrix:0x514,c1:0x554,c2:0x594,c2Columns:3,gravity:0x5c4,gravityInput:0x970,run:nativeScaraMatrixArithmetic}
};
const fields=['a','d','pitch','mass','inertia','cog','ratio','motorInertia','ratedTrq','stiffness','coulombFric','viscousFric'];
export function nativeLinkValues(link) {
    const values=Array.isArray(link)?[...link]:fields.flatMap(name=>Array.isArray(link[name])?link[name]:[link[name]]);
    if(values.length!==19||!values.every(Number.isFinite))throw new TypeError('An effective native link must contain 19 finite SI values');
    return values;
}
/**
 * Original SPC25 arithmetic. q is INTERNAL joint radians, including SCARA's
 * screw angle. Input links are the effective native actLinkPara records after
 * end/arm load assembly, in meters, kg and kg*m^2. No unit guessing or tensor
 * repair occurs here. The body matrix excludes reflected motor inertia.
 */
export function createNativeDynamicsKernel({robotType,links,gravityVector=[0,0,9.81],joint2OffsetRadians=0}) {
    const layout=layouts[robotType];
    if(!layout)throw new RangeError('robotType must be six-axis or scara');
    if(!Array.isArray(links)||links.length!==layout.axes)throw new TypeError(`Expected ${layout.axes} effective links`);
    const records=links.map(nativeLinkValues);
    if(!Array.isArray(gravityVector)||gravityVector.length!==3||!gravityVector.every(Number.isFinite))throw new TypeError('gravityVector must contain three finite values in m/s^2');
    if(!Number.isFinite(joint2OffsetRadians))throw new TypeError('joint2OffsetRadians must be finite');
    const buffer=new ArrayBuffer(0x20000),memory=new DataView(buffer),u=new Uint32Array(buffer),fm=new Float32Array(buffer);
    const registers=new Uint32Array(16),vfp=new ArrayBuffer(32*8),vu=new Uint32Array(vfp),s=new Float32Array(vfp),d=new Float64Array(vfp);
    const conversion=new ArrayBuffer(8),cv=new Uint32Array(conversion),cd=new Float64Array(conversion);
    const model=0x1000,qAddress=0x3000;
    records.forEach((record,i)=>record.forEach((value,j)=>memory.setFloat64(model+layout.active+i*0x98+j*8,value,true)));
    gravityVector.forEach((value,i)=>memory.setFloat64(model+layout.gravityInput+i*8,value,true));
    const matrix=(offset,rows,columns)=>Array.from({length:rows},(_,i)=>Array.from(fm.slice((model+offset)/4+i*columns,(model+offset)/4+(i+1)*columns)));
    const pairs=robotType==='scara'?[[0,1],[0,3],[1,3]]:Array.from({length:6},(_,i)=>Array.from({length:5-i},(_,j)=>[i,i+j+1])).flat();
    function evaluate(q) {
        if(!Array.isArray(q)||q.length!==layout.axes||!q.every(Number.isFinite))throw new TypeError(`q must contain ${layout.axes} finite internal radians`);
        q.forEach((value,i)=>memory.setFloat64(qAddress+i*8,value,true));
        registers.fill(0);vu.fill(0);registers[0]=model;registers[1]=qAddress;registers[13]=0x1f000;
        if(robotType==='scara'){cd[0]=joint2OffsetRadians;registers[2]=cv[0];registers[3]=cv[1];}
        layout.run(memory,u,fm,registers,vu,s,d,cv,cd);
        const rigidBodyMassMatrix=matrix(layout.matrix,layout.axes,layout.axes);
        const C1=matrix(layout.c1,layout.axes,layout.axes),C2=matrix(layout.c2,layout.axes,layout.c2Columns);
        const gravityTorqueNm=Array.from(fm.slice((model+layout.gravity)/4,(model+layout.gravity)/4+layout.axes));
        const coriolis=(velocity)=>{
            if(!Array.isArray(velocity)||velocity.length!==layout.axes||!velocity.every(Number.isFinite))throw new TypeError('velocity must contain internal rad/s values');
            if(robotType==='scara') {
                // Original StandardInvDyncTrqCalc_Scara uses float32 running
                // sums, and consumes only the first TWO of its three C2
                // columns. Preserve that native behavior rather than replacing
                // it by a mathematically reconstructed Christoffel expression.
                const products=pairs.map(([j,k])=>Math.fround(velocity[j]*velocity[k]));
                return C1.map((row,i)=>{
                    let square=0,mixed=0;
                    for(let j=0;j<4;j++)square=Math.fround(square+velocity[j]*(row[j]*velocity[j]));
                    for(let j=0;j<2;j++)mixed=Math.fround(mixed+Math.fround(Math.fround(C2[i][j]+C2[i][j])*products[j]));
                    return Math.fround(mixed+square);
                });
            }
            return C1.map((row,i)=>row.reduce((sum,value,j)=>sum+value*velocity[j]*velocity[j],0)
                +C2[i].reduce((sum,value,j)=>sum+2*value*velocity[pairs[j][0]]*velocity[pairs[j][1]],0));
        };
        return {rigidBodyMassMatrix,C1,C2,gravityTorqueNm,coriolis,
            fidelity:'original SPC25 native matrix arithmetic; effective actLinkPara input'};
    }
    return {evaluate,axisCount:layout.axes,robotType};
}

/** Native MaxNaturalCycleCalc / MaxEigCalc finite convergence policy. */
export function nativeNaturalPeriod(rigidBodyMassMatrix,stiffness) {
    const count=stiffness.length;
    if(!stiffness.every(value=>Number.isFinite(value)&&value>0))throw new RangeError('stiffness must be positive');
    const a=rigidBodyMassMatrix.map((row,i)=>row.map(value=>Math.fround(value)/stiffness[i]));
    let vector=Array(count).fill(0),previous=0;vector[0]=1;
    for(let iteration=0;iteration<10;iteration++) {
        const next=a.map(row=>row.reduce((sum,value,i)=>sum+value*vector[i],0));
        const eigenvalue=Math.max(...next.map(Math.abs));
        if(Math.abs(eigenvalue-previous)<=2.533e-8)return 2*Math.PI*Math.sqrt(eigenvalue);
        previous=eigenvalue;vector=next.map(value=>value/eigenvalue);
    }
    return 2*Math.PI*Math.sqrt(previous);
}

const degrees=Math.PI/180;
function physicalLoad(input,name) {
    const load=input??{},mass=load.mass??0,cog=load.cog??[0,0,0],inertia=load.inertia??[0,0,0];
    if(!Number.isFinite(mass)||mass<0||!Array.isArray(cog)||cog.length!==3||!cog.every(Number.isFinite)
        ||!Array.isArray(inertia)||inertia.length!==3||!inertia.every(value=>Number.isFinite(value)&&value>=0))
        throw new TypeError(`${name} must supply nonnegative kg mass, finite mm cog and nonnegative kg*m^2 principal inertia`);
    return {mass,cog:[...cog],inertia:[...inertia]};
}
function diagonalOffset(offset,i) {return offset[(i+1)%3]**2+offset[(i+2)%3]**2;}
/** AsmLoadMassWithMat: the original helper uses TCP translation only. */
function mergeEndLoads(tool,grip,translationMm) {
    const mass=tool.mass+grip.mass,inverse=mass>0?1/mass:0;
    const gripCog=grip.cog.map((v,i)=>v+translationMm[i]);
    const cog=tool.cog.map((v,i)=>(tool.mass*v+grip.mass*gripCog[i])*.001*inverse);
    const a=tool.cog.map((v,i)=>v*.001-cog[i]),b=gripCog.map((v,i)=>v*.001-cog[i]);
    const inertia=tool.inertia.map((v,i)=>v+tool.mass*diagonalOffset(a,i)+grip.inertia[i]+grip.mass*diagonalOffset(b,i));
    return {mass,cog,inertia};
}
/** SetDyncArmLoad / AsmEndMass: input cog is SI; off-diagonal entries become0. */
function mergeLinkLoad(record,load,endLink=false) {
    const result=[...record],baseMass=record[3],mass=baseMass+load.mass,inverse=mass>0?1/mass:0;
    const loadCog=load.cog.map((v,i)=>v+(endLink&&i===2?record[1]:0));
    const cog=record.slice(10,13).map((v,i)=>(baseMass*v+load.mass*loadCog[i])*inverse);
    const a=record.slice(10,13).map((v,i)=>v-cog[i]),b=loadCog.map((v,i)=>v-cog[i]);
    result[3]=mass;
    for(let i=0;i<3;i++) {
        result[4+i]=record[4+i]+baseMass*diagonalOffset(a,i)+load.inertia[i]+load.mass*diagonalOffset(b,i);
        result[7+i]=0;result[10+i]=cog[i];
    }
    return result;
}
/**
 * Native parameter-command initialization: SetDyncLinkPrm -> SetDyncArmLoad
 * (including empty arm records), structural SetDyncDH, SetEndLoadWithMat.
 * Tool and grip cog are flange-frame mm; arm cog uses its native link frame.
 * The default zero-payload substitution remains an offline approximation:
 * original live max-load COM/inertia are unavailable. It is reported explicitly.
 */
export function assembleNativeDynamicsModel(model,options={}) {
    const robotType=model.robotType??(model.axisCount===6?'six-axis':'scara'),axes=robotType==='six-axis'?6:4;
    const raw=model.links.map(nativeLinkValues);
    if(raw.length!==axes)throw new TypeError(`Expected ${axes} model links`);
    const structure=model.kinematicStructure;
    if(!Array.isArray(structure)||structure.length<4||!structure.every(Number.isFinite))throw new TypeError('kinematicStructure must contain finite native millimeters');
    const links=raw.map(record=>{const r=[...record];r[0]=0;r[1]=0;r[2]=0;return r;});
    links[0][0]=structure[0]*.001;links[1][0]=structure[1]*.001;
    if(robotType==='six-axis') {
        links[2][0]=structure[2]*.001;links[3][1]=structure[3]*.001;links[5][1]=structure[4]*.001;
        links[2][2]=structure[3]*.001;
    } else links[2][2]=Number(model.screwLeadMm??structure[3])*.001;
    const tool=physicalLoad(options.toolLoad,'toolLoad'),grip=physicalLoad(options.gripLoad,'gripLoad');
    const actualToolGripMassKg=tool.mass+grip.mass,zeroLoadFallback=actualToolGripMassKg<1e-5,diagnostics=[];
    const translation=options.gripTranslationMm??[0,0,0];
    if(!Array.isArray(translation)||translation.length!==3||!translation.every(Number.isFinite))throw new TypeError('gripTranslationMm must contain three finite mm values');
    let endLoad=mergeEndLoads(tool,grip,translation);
    if(zeroLoadFallback&&options.zeroLoadFallback!==false) {
        const nominal=Number(model.nominalPayloadKg);
        if(!Number.isFinite(nominal)||nominal<=0)throw new RangeError('A positive nominalPayloadKg is required for the reported zero-load approximation');
        endLoad={mass:nominal,cog:[0,0,0],inertia:[0,0,0]};
        diagnostics.push('zero-load-native-branch: nominal flange mass approximates unavailable native max-load COM/inertia');
    }
    const armRecords=new Map();
    for(const input of options.armLoads??[]) {
        const index=input.linkIndex;
        if(!Number.isInteger(index)||index<0||index>=axes)throw new RangeError('armLoads linkIndex is outside this model');
        const list=armRecords.get(index)??[];
        list.push(physicalLoad(input,`armLoads[${index}]`));armRecords.set(index,list);
    }
    for(let index=0;index<axes;index++) {
        links[index]=mergeLinkLoad(links[index],{mass:0,cog:[0,0,0],inertia:[0,0,0]});
        for(const arm of armRecords.get(index)??[])
            links[index]=mergeLinkLoad(links[index],{...arm,cog:arm.cog.map(v=>v*.001)});
    }
    links[axes-1]=mergeLinkLoad(links[axes-1],endLoad,true);
    const install=model.installModeRaw??{},alpha=Number(install.gravAlpha??0)*degrees,beta=Number(install.gravBeta??0)*degrees;
    if(!Number.isFinite(alpha)||!Number.isFinite(beta))throw new TypeError('Mount gravity angles must be finite degrees');
    const gravityVector=[-9.81*Math.sin(beta),-9.81*Math.cos(beta)*Math.sin(alpha),9.81*Math.cos(alpha)*Math.cos(beta)];
    const joint2OffsetRadians=model.joint2OffsetRadians??model.nativeJoint2OffsetRadians??0;
    if(!Number.isFinite(joint2OffsetRadians))throw new TypeError('joint2OffsetRadians must be finite');
    return {robotType,links,gravityVector,joint2OffsetRadians,zeroLoadFallback,diagnostics,payloadMassKg:endLoad.mass,actualToolGripMassKg,
        reflectedMotorInertia:links.map(record=>record[14]*record[13]**2),
        fidelity:'native parameter-command load/DH/gravity assembly; explicit nominal zero-load approximation'};
}
