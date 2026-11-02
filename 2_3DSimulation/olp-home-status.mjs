// SPC25 work-origin output predicate, separate from any application labels.
// Verified packaged R7H/S7/R10 stOriPoiOffset defaults use this per-axis
// tolerance; live configuration may differ. Native comparison adds .0009.
export const OLP_HOME_DEFAULT_TOLERANCE=0.01000000001;
export const OLP_HOME_TOLERANCE_EPSILON=0.0009;

const finite=(value,name)=>{
    if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError(`${name} must be finite`);
    return value;
};
const toleranceAt=(setting,index,name)=>finite(Array.isArray(setting)?setting[index]:setting,name);

/** Return null when no configured output is enabled, otherwise its bit value.
 * mode 1 checks robot joints; mode 2 also checks configured external axes.
 * Joint units are native display degrees/mm; no cyclic-angle wrapping occurs.
 * independentAxisMask uses robot-joint bits first, then external-axis bits.
 */
export function evaluateOlpHomeStatus(config,currentJoints,currentExternalAxes=[],independentAxisMask=0) {
    const {mode,outputBit,joints,jointTolerance=OLP_HOME_DEFAULT_TOLERANCE,
        externalAxes=[],externalTolerance=OLP_HOME_DEFAULT_TOLERANCE}=config??{};
    if(![1,2].includes(mode)||!Number.isInteger(outputBit)||outputBit<0)return null;
    if(!Array.isArray(currentJoints)||![4,6].includes(currentJoints.length))
        throw new TypeError('Home status requires four or six current robot joints');
    if(!Array.isArray(joints)||joints.length<currentJoints.length)
        throw new TypeError('Home status requires a configured value for every robot joint');
    if(!Number.isInteger(independentAxisMask)||independentAxisMask<0||independentAxisMask>0xffff)
        throw new RangeError('Independent axis mask must be an unsigned 16-bit integer');
    const inside=(home,current,tolerance,maskOffset)=>current.every((value,index)=>{
        if(independentAxisMask&(1<<(index+maskOffset)))return true;
        const delta=Math.abs(finite(home[index],'Configured home joint')-finite(value,'Current joint'));
        return delta<=toleranceAt(tolerance,index,'Home tolerance')+OLP_HOME_TOLERANCE_EPSILON;
    });
    if(!inside(joints,currentJoints,jointTolerance,0))return false;
    if(mode===1)return true;
    if(!Array.isArray(currentExternalAxes)||currentExternalAxes.length>6
        ||!Array.isArray(externalAxes)||externalAxes.length<currentExternalAxes.length)
        throw new TypeError('Home status requires a configured value for every current external axis');
    return inside(externalAxes,currentExternalAxes,externalTolerance,currentJoints.length);
}
