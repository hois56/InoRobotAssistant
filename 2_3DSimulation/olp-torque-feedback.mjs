import {evaluateRobotDynamics,resolveRapidDynamicsModel,jointsToNativeRadians} from './robot-rapid-dynamics.mjs?v=20261102-models-2';

/** Offline motor-current percentage estimate. The language reads drive feedback
 * in 0.1% increments; this estimator does not represent measured servo current.
 */
export class OlpTorqueFeedback {
    constructor(){this.key=null;this.values=null;}
    read(axis,{joints,velocities,accelerations,options}) {
        const selected=resolveRapidDynamicsModel(options);
        if(!selected)throw new Error('Torque estimation requires a matching firmware dynamics model');
        if(!Number.isInteger(axis)||axis<1||axis>selected.model.axisCount)
            throw new RangeError(`GetTorque axis must be 1..${selected.model.axisCount}`);
        velocities??=joints.map(()=>0);accelerations??=joints.map(()=>0);
        const key=JSON.stringify([joints,velocities,accelerations,options]);
        if(key!==this.key) {
            const state=evaluateRobotDynamics(joints,options);
            const qd=jointsToNativeRadians(velocities,selected.model),qdd=jointsToNativeRadians(accelerations,selected.model);
            const coriolis=state.coriolis(qd);
            this.values=state.massMatrix.map((row,i)=>{
                const link=selected.model.links[i];
                const jointTorque=row.reduce((sum,value,j)=>sum+value*qdd[j],0)+coriolis[i]+state.gravityTorqueNm[i]
                    +link.viscousFric*qd[i]+link.coulombFric*Math.sign(qd[i]);
                const percent=jointTorque/(link.ratio*link.ratedTrq)*100;
                const driveFeedback=Math.max(-32768,Math.min(32767,Math.round(percent*10)));
                return Math.fround(driveFeedback*.1);
            });
            this.key=key;
        }
        return this.values[axis-1];
    }
}

/** Sample actual displayed joints, or exact analytic joint derivatives when
 * available. Cartesian/legacy motion derivatives use successive frame samples.
 */
const motionSamples = new WeakMap();
export function getOlpJointMotionSample(robot) {return motionSamples.get(robot);}
export function sampleOlpJointMotion(robot,timeMilliseconds,analytic=null) {
    const joints=robot.userData.joints.map(joint=>Number(joint.angle));
    const previous=motionSamples.get(robot);
    const dt=previous?(timeMilliseconds-previous.timeMilliseconds)/1000:0;
    const velocities=analytic?.velocities??joints.map((value,i)=>dt>1e-6?(value-previous.joints[i])/dt:0);
    const accelerations=analytic?.accelerations??joints.map((_value,i)=>dt>1e-6?(velocities[i]-(previous.velocities[i]??0))/dt:0);
    const sample={timeMilliseconds,joints,velocities,accelerations};
    motionSamples.set(robot,sample);return sample;
}

export function finishOlpJointMotion(robot,timeMilliseconds=performance.now()) {
    const zeros=robot.userData.joints.map(()=>0);
    return sampleOlpJointMotion(robot,timeMilliseconds,{velocities:zeros,accelerations:zeros});
}
