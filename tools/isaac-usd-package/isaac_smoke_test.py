"""Run inside Isaac Sim 5.x Python; never connects to a physical robot."""
import argparse
import json
import math
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--asset', type=Path, required=True)
parser.add_argument('--headless', action='store_true')
parser.add_argument('--seconds', type=float, default=8)
args = parser.parse_args()
if not args.asset.is_file() or args.seconds < 2:
    parser.error('Provide an existing single-robot USD and at least two seconds')

from isaacsim import SimulationApp
application = SimulationApp({'headless': args.headless})
try:
    import numpy as np
    import omni.usd
    from isaacsim.core.api import World
    from isaacsim.core.prims import SingleArticulation
    from isaacsim.core.utils.types import ArticulationAction
    from pxr import UsdPhysics

    if not omni.usd.get_context().open_stage(str(args.asset.resolve())):
        raise RuntimeError('Failed to open USD')
    for _ in range(5):
        application.update()
    world = World(stage_units_in_meters=1, physics_dt=1/120, rendering_dt=1/60)
    robot = world.scene.add(SingleArticulation(prim_path='/Robot', name='inorobot'))
    world.reset()
    if robot.num_dof != 6 or set(robot.dof_names) != {f'J{i}' for i in range(1, 7)}:
        raise RuntimeError(f'Unexpected articulation: {robot.dof_names}')
    indices = np.array([robot.get_dof_index(f'J{i}') for i in range(1, 7)])
    stage = omni.usd.get_context().get_stage()
    lower, upper = [], []
    for i in range(1, 7):
        joint = UsdPhysics.RevoluteJoint(stage.GetPrimAtPath(f'/Robot/Joints/J{i}'))
        lower.append(math.radians(joint.GetLowerLimitAttr().Get()))
        upper.append(math.radians(joint.GetUpperLimitAttr().Get()))
    amplitudes = np.deg2rad([8, 5, 5, 8, 5, 10])
    max_motion = np.zeros(6)
    start = None
    samples = 0
    for step in range(round(args.seconds * 120)):
        t = step / 120
        angular_frequency = 2 * math.pi / 8
        # Starts at rest: (1-cos) avoids an initial velocity step.
        targets = amplitudes * (1-math.cos(angular_frequency*t)) / 2
        velocities = amplitudes * angular_frequency * math.sin(angular_frequency*t) / 2
        robot.apply_action(ArticulationAction(joint_positions=targets, joint_velocities=velocities, joint_indices=indices))
        world.step(render=not args.headless)
        q = robot.get_joint_positions()[indices]
        if not np.isfinite(q).all() or (q < np.array(lower)-.03).any() or (q > np.array(upper)+.03).any():
            raise RuntimeError(f'Invalid joint state: {q}')
        if start is None:
            start = q.copy()
        max_motion = np.maximum(max_motion, np.abs(q-start))
        samples += 1
    if not (max_motion > .001).all():
        raise RuntimeError(f'At least one drive did not move: {max_motion}')
    print(json.dumps({'status': 'passed', 'asset': str(args.asset), 'dofNames': robot.dof_names,
                      'samples': samples, 'maxObservedMotionRad': max_motion.tolist()}))
finally:
    application.close()
