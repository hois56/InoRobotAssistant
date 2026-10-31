// Mounting-face circular openings measured in each P0 STL coordinate frame (mm).
const grid = (xs, ys, z, radius) => xs.flatMap(x => ys.map(y => [x, y, z, radius]));
const s4 = [...grid([-105, -90, 30], [-60, 60], -150, 4.64), [16, 60, -150, 3]];
const s7 = grid([-105, 45], [-75, 75], -155, 4.5);
const s10 = grid([-105, 45], [-75, 75], -155.5, 4.5);
// Ceiling SCARA mounting plate is the upward-facing broad flange, not the
// higher motor housing. The two models share its pattern at different heights.
const ts = z => [
  ...grid([-139, -44, 51], [-80, 80], z, 3.3),
  ...grid([25], [-80, 80], z, 2.5),
  [-139, 0, z, 2.5], [0, -80, z, 3]
];
const s25 = grid([-99, 101], [-100, 100], -357.5, 8.04);
const s35 = z => grid([-99, 101], [-100, 100], z, 8.12);
const s60 = [...grid([-160, -100, 100], [-100, 100], -381, 7.04), [100, 73, -381, 3.04]];
const r4 = [...grid([-69, 69], [-69, 69], 0, 5.5), ...grid([69], [-54, 54], 0, 3)];
const r7 = [...grid([-80, 80], [-80, 80], 0, 5.25), ...grid([67.5], [-90, 90], 0, 3)];
const r10 = [...grid([-82.5, 82.5], [-82.5, 82.5], 0, 5.26), ...grid([82.5], [-97.5, 97.5], 0, 3.5)];
const r15 = [...grid([-120, 120], [-120, 120], 0, 9.06), ...grid([126], [-94, 94], 0, 6.56)];
const rLarge = (radius, extraRadius, offsetX = 159.31) => [
  ...grid([-140, 140], [-145, 145], 0, radius),
  ...grid([-160], [-167.5, 167.5], 0, extraRadius),
  ...grid([175], [-145, 145], 0, extraRadius),
  ...grid([offsetX], [-165, 165], 0, 6)
];
export const ROBOT_MOUNTING_HOLES = Object.freeze({
  'IR-S4-40Z15': s4,
  'IR-S7-50Z20': s7, 'IR-S7-60Z20': s7, 'IR-S7-70Z20': s7,
  'IR-S10-60Z20': s10, 'IR-S10-70Z20': s10, 'IR-S10-80Z20': s10,
  'IR-TS4-35Z15': ts(498.6), 'IR-TS5-55Z15': ts(507.9),
  'IR-S25-80Z42': s25, 'IR-S25-100Z42': s25, 'IR-S25-120Z42': s25,
  'IR-S35-80Z42': s35(-332.5), 'IR-S35-100Z42': s35(-332.5), 'IR-S35-120Z42': s35(-329.5),
  'IR-S60-120Z40': s60, 'IR-GS60-120Z40': s60,
  'IR-R4-56': r4, 'IR-R4H-54': r4,
  'IR-R7H-70': r7, 'IR-R7H-90': r7,
  'IR-R10-110': r10, 'IR-R10H-120': r10, 'IR-R11-90': r10,
  'IR-R15H-145': r15, 'IR-R20H-120': r15,
  // R35 uses open mounting slots; coordinates are the semicircular slot centers.
  'IR-R35-185': grid([-187.5, 187.5], [-120, 120], 0, 10),
  'IR-R50-250': [...grid([-220, 220], [-170, 170], 0, 11), ...grid([-170, 170], [-220, 220], 0, 11),
    ...grid([-218, 218], [-218, 218], 0, 7.5), ...grid([195], [-195, 195], 0, 8)],
  'IR-R10-140': rLarge(9, 6, 160), 'IR-R16-210': rLarge(8.75, 5.5), 'IR-R25-178': rLarge(8.75, 5.5)
});
