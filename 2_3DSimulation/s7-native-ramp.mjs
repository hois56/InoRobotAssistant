/**
 * Original MC_Scara_A VelAccLevelPreProc (0xe28e0) ramp mapping.
 * `percent` is the command SetAccRamp percentage, not the configured ms time.
 * Default RUN ramp percentage 50 and default jerk time 50 ms are two separate
 * native settings (RunSTRParaInit and PublicPrmInit respectively).
 */
export function getS7RampParameters(percent=50,defaultTimeMilliseconds=50,minimumTimeMilliseconds=8) {
  if(!Number.isFinite(percent)) throw new TypeError('ramp percent must be finite');
  if(!Number.isFinite(defaultTimeMilliseconds)||defaultTimeMilliseconds<=0) throw new RangeError('default ramp time must be positive');
  if(!Number.isFinite(minimumTimeMilliseconds)||minimumTimeMilliseconds<=0) throw new RangeError('minimum ramp time must be positive');
  const commandPercent=Math.max(1,Math.min(120,percent));
  // Preserve native multiplication order and the intermediate float cast.
  const factor=commandPercent<100
    ? commandPercent*commandPercent*.0001-commandPercent*2.5*.01+2
    : .5-(commandPercent-100)*.0125;
  let jerkLevel=Math.fround(factor);
  if(defaultTimeMilliseconds*jerkLevel<minimumTimeMilliseconds)
    jerkLevel=Math.fround(minimumTimeMilliseconds/defaultTimeMilliseconds);
  const localJerkRatioPerMillisecond=Math.fround(1/(defaultTimeMilliseconds*jerkLevel));
  return {commandPercent,jerkLevel,localJerkRatioPerMillisecond,
    nominalRampTimeMilliseconds:defaultTimeMilliseconds*jerkLevel,
    rampTimeMilliseconds:1/localJerkRatioPerMillisecond};
}

export function getS7RampTimeMilliseconds(percent=50,defaultTimeMilliseconds=50,minimumTimeMilliseconds=8) {
  return getS7RampParameters(percent,defaultTimeMilliseconds,minimumTimeMilliseconds).rampTimeMilliseconds;
}

/**
 * FreePlanAdapt transition clamp used by normal/high-power Rapid MovJ.
 * The separate AdaptivePlanning path consumes configured jsLim/jeLim directly.
 * This function does not calculate natural/mechanical periods or dynamic J.
 */
export function getS7FreePlanTransitionMilliseconds(periodSeconds,jerkLevel,setJerkTimeMilliseconds) {
  if(![periodSeconds,jerkLevel,setJerkTimeMilliseconds].every(v=>Number.isFinite(v)&&v>0))
    throw new RangeError('period, jerk level and set jerk time must be positive');
  const setTime=Math.fround(setJerkTimeMilliseconds);
  return Math.max(.5*setTime,Math.min(1.5*setTime,periodSeconds*1000*jerkLevel));
}

// RobotSetRapidMovPara2 -> SetPlanMechLim for the selected Z20S3 model:
// tempLimit[6],tempLimit[7],reserve1,reserve2,reserve3 = [40,40,0,0,0].
// The storage order below is MechJerkPara's native order. These configured
// fields replace DyncPlanModlInit's generic [.01,0,120,1400,.1] defaults.
export const S7_NATIVE_MECHANICAL_JERK_PARAMETERS=Object.freeze({
  massSlope:0,referenceMassKg:0,baseTimeMilliseconds:0,
  referenceLengthMm:40,lengthSlopeMillisecondsPerMm:40
});

/** Original MechLimitJerkTime(kind=1), units mm, kg and output seconds. */
export function getS7MechanicalJerkTimeSeconds(armLengthMm,payloadMassKg,
  parameters=S7_NATIVE_MECHANICAL_JERK_PARAMETERS) {
  if(!Number.isFinite(armLengthMm)||!Number.isFinite(payloadMassKg))
    throw new TypeError('arm length and payload mass must be finite');
  const {massSlope,referenceMassKg,baseTimeMilliseconds,referenceLengthMm,lengthSlopeMillisecondsPerMm}=parameters;
  if(!Object.values(parameters).every(Number.isFinite)) throw new TypeError('mechanical jerk parameters must be finite');
  if(referenceLengthMm<1000) return 0;
  return (1+massSlope*(payloadMassKg-referenceMassKg))*
    (baseTimeMilliseconds+lengthSlopeMillisecondsPerMm*(armLengthMm-referenceLengthMm))*.001;
}

/**
 * Native FreePlanAdapt transition policy, including configured mechanical time.
 * The natural-period input remains a separate model/oracle responsibility.
 */
export function getS7RapidMoveJerkTiming({naturalPeriodSeconds,armLengthMm=0,payloadMassKg=0,
  rampPercent=50,defaultTimeMilliseconds=50,minimumTimeMilliseconds=8,
  mechanicalParameters=S7_NATIVE_MECHANICAL_JERK_PARAMETERS}) {
  const ramp=getS7RampParameters(rampPercent,defaultTimeMilliseconds,minimumTimeMilliseconds);
  const mechanicalTimeSeconds=getS7MechanicalJerkTimeSeconds(armLengthMm,payloadMassKg,mechanicalParameters);
  const periodSeconds=Math.max(naturalPeriodSeconds,mechanicalTimeSeconds);
  return {...ramp,mechanicalTimeSeconds,
    transitionTimeMilliseconds:getS7FreePlanTransitionMilliseconds(periodSeconds,ramp.jerkLevel,
      Math.fround(1/ramp.localJerkRatioPerMillisecond))};
}
