/** Standard six-axis rigid flange geometry in controller BASE coordinates.
 * q is the user's joint angle in radians. The original FK applies its +pi/2
 * J2 DH offset internally; it is not an offset on the simulator joint value.
 * Matches SPC25 ForwardCalFullPara_Six with zero Tool and zero elastic angle
 * correction. Mount/world transforms are intentionally outside this geometry.
 */
export function nativeSixFlangePositionMm(q,structure) {
    if(!Array.isArray(q)||q.length!==6||!q.every(Number.isFinite))throw new TypeError('q must contain six finite radians');
    if(!Array.isArray(structure)||structure.length<6||!structure.every(Number.isFinite))throw new TypeError('structure must contain six finite mm dimensions');
    const [a1,a2,a3,d4,d6,baseH]=structure;
    const [j1,j2,j3,j4,j5]=q,combined=j2+j3;
    const c=Math.cos(combined),s=Math.sin(combined),c4=Math.cos(j4),s4=Math.sin(j4),c5=Math.cos(j5),s5=Math.sin(j5);
    const x=a1-a2*Math.sin(j2)-a3*s+d4*c+d6*(c*c5-s*c4*s5);
    const y=-d6*s4*s5;
    const z=baseH+a2*Math.cos(j2)+a3*c+d4*s+d6*(s*c5+c*c4*s5);
    return [Math.cos(j1)*x-Math.sin(j1)*y,Math.sin(j1)*x+Math.cos(j1)*y,z];
}

/** Row-major flange orientation in controller BASE, original standard6 DH. */
export function nativeSixFlangeRotation(q) {
    if(!Array.isArray(q)||q.length!==6||!q.every(Number.isFinite))throw new TypeError('q must contain six finite radians');
    const multiply=(a,b)=>Array.from({length:9},(_,index)=>{
        const row=Math.floor(index/3),column=index%3;
        return a[row*3]*b[column]+a[row*3+1]*b[3+column]+a[row*3+2]*b[6+column];
    });
    const rx=t=>{const c=Math.cos(t),s=Math.sin(t);return [1,0,0,0,c,-s,0,s,c];};
    const ry=t=>{const c=Math.cos(t),s=Math.sin(t);return [c,0,s,0,1,0,-s,0,c];};
    const c=Math.cos(q[0]),s=Math.sin(q[0]);
    let rotation=[c,-s,0,s,c,0,0,0,1];
    for(const step of [ry(-q[1]-q[2]),rx(q[3]),ry(-q[4]),rx(q[5]),[0,0,1,0,-1,0,1,0,0]])rotation=multiply(rotation,step);
    return rotation;
}

/** Native mechanical planning measures the active TCP origin, in mm. */
export function nativeSixTcpPositionMm(q,structure,toolTranslationMm=[0,0,0]) {
    if(!Array.isArray(toolTranslationMm)||toolTranslationMm.length!==3||!toolTranslationMm.every(Number.isFinite))
        throw new TypeError('Tool translation must contain three finite mm values');
    const flange=nativeSixFlangePositionMm(q,structure),rotation=nativeSixFlangeRotation(q);
    return flange.map((value,i)=>value+rotation[i*3]*toolTranslationMm[0]+rotation[i*3+1]*toolTranslationMm[1]+rotation[i*3+2]*toolTranslationMm[2]);
}
