#!/usr/bin/env python3
"""Build four self-contained Isaac Sim robot USDs from the checked URDFs.

Requires numpy and pxr (Isaac Sim Python, or usd-core==24.11). No firmware,
simulator, or arbitrary scripts are executed by this converter.
Full material compliance also requires standard USD shader resources; some
standalone usd-core wheels omit them. Isaac Sim/full SDKs include the registry.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import sys
import xml.etree.ElementTree as ET
import zipfile

os.environ.setdefault('USD_WRITE_NEW_USDC_FILES_AS_VERSION', '0.8.0')
ROOT = Path(__file__).resolve().parents[1]
SELECTED = {
    'IR-R4H-54': 'IR-R4H-54S5-C1H-INT_01741031',
    'IR-R7H-70': 'IR-R7H-70S5-C2H-INT_01741199',
    'IR-R7H-90': 'IR-R7H-90S5-C2H-INT_01741200',
    'IR-R10H-120': 'IR-R10H-120S5-C2H-INT_01741201',
}


def load_dependencies(extra_path):
    if extra_path:
        sys.path.insert(0, str(extra_path))
    global np, Usd, UsdGeom, UsdPhysics, UsdShade, UsdLux, UsdUtils, Gf, Sdf, Vt, Kind
    import numpy as np
    from pxr import Usd, UsdGeom, UsdPhysics, UsdShade, UsdLux, UsdUtils, Gf, Sdf, Vt, Kind


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(file):
    with Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def numbers(text, fallback=(0, 0, 0)):
    return np.array([float(x) for x in text.split()] if text else fallback, dtype=float)


def rotation(rpy):
    r, p, y = rpy
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    return np.array([[cy*cp, cy*sp*sr-sy*cr, cy*sp*cr+sy*sr],
                     [sy*cp, sy*sp*sr+cy*cr, sy*sp*cr-cy*sr], [-sp, cp*sr, cp*cr]])


def transform(xyz=(0, 0, 0), r=None):
    m = np.eye(4)
    m[:3, 3] = xyz
    if r is not None:
        m[:3, :3] = r
    return m


def origin(element):
    return transform(numbers(element.get('xyz')), rotation(numbers(element.get('rpy')))) if element is not None else np.eye(4)


def gf_matrix(column_matrix):
    return Gf.Matrix4d(*column_matrix.T.ravel().tolist())


def quaternion(r):
    return gf_matrix(transform(r=r)).ExtractRotationQuat()


def put_pose(xform, matrix):
    xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble).Set(Gf.Vec3d(*matrix[:3, 3].tolist()))
    xform.AddOrientOp(UsdGeom.XformOp.PrecisionDouble).Set(quaternion(matrix[:3, :3]))


def physx(prim, schema, attributes):
    # Author NVIDIA schema tokens without requiring a Kit/PhysX installation.
    # Isaac Sim registers these schemas when opening the asset.
    prim.AddAppliedSchema(schema)
    for name, (kind, value) in attributes.items():
        prim.CreateAttribute(name, kind, custom=False).Set(value)


def read_robot(file):
    robot = ET.parse(file).getroot()
    links = {link.get('name'): link for link in robot.findall('link')}
    joints = robot.findall('joint')
    poses = {'base_link': np.eye(4)}
    for joint in joints:
        parent, child = joint.find('parent').get('link'), joint.find('child').get('link')
        require(parent in poses, f'Non-topological URDF joint: {joint.get("name")}')
        poses[child] = poses[parent] @ origin(joint.find('origin'))
    require(len(links) == 8 and len(joints) == 7, 'Expected six axes and a tool frame')
    return links, joints, poses


def stl_triangles(file):
    raw = file.read_bytes()
    require(len(raw) >= 84, f'STL too short: {file}')
    count = int.from_bytes(raw[80:84], 'little')
    if len(raw) == 84 + count * 50:
        dtype = np.dtype([('normal', '<f4', 3), ('vertices', '<f4', (3, 3)), ('attr', '<u2')])
        triangles = np.frombuffer(raw, dtype=dtype, offset=84, count=count)['vertices'].astype(float)
    else:
        import re
        coords = re.findall(r'vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)', raw.decode('utf-8'))
        triangles = np.array(coords, dtype=float).reshape(-1, 3, 3)
    require(np.isfinite(triangles).all(), f'Nonfinite mesh: {file}')
    return triangles


def material(stage, name, rgba):
    mat = UsdShade.Material.Define(stage, f'/Robot/Materials/{name}')
    shader = UsdShade.Shader.Define(stage, f'{mat.GetPath()}/PreviewSurface')
    shader.CreateIdAttr('UsdPreviewSurface')
    shader.CreateInput('diffuseColor', Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*rgba[:3]))
    shader.CreateInput('roughness', Sdf.ValueTypeNames.Float).Set(.45)
    shader.CreateInput('metallic', Sdf.ValueTypeNames.Float).Set(.05)
    mat.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), 'surface')
    return mat


def add_mesh(stage, link_path, visual, urdf_file, report):
    source = (urdf_file.parent / visual.find('geometry/mesh').get('filename')).resolve()
    scale = numbers(visual.find('geometry/mesh').get('scale'), (1, 1, 1))
    triangles = stl_triangles(source) * scale
    local = origin(visual.find('origin'))
    triangles = triangles @ local[:3, :3].T + local[:3, 3]
    cross = np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0])
    lengths = np.linalg.norm(cross, axis=1)
    keep = lengths > 1e-15
    removed = int((~keep).sum())
    triangles, cross, lengths = triangles[keep], cross[keep], lengths[keep]
    require(len(triangles) > 0, f'Empty mesh after removing zero-area faces: {source}')
    points, indices = np.unique(triangles.reshape(-1, 3).astype(np.float32), axis=0, return_inverse=True)
    mesh = UsdGeom.Mesh.Define(stage, f'{link_path}/geometry')
    mesh.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(points))
    mesh.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(np.full(len(triangles), 3, dtype=np.int32)))
    mesh.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(indices.astype(np.int32)))
    mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
    mesh.CreateOrientationAttr(UsdGeom.Tokens.rightHanded)
    normals = np.repeat((cross / lengths[:, None]).astype(np.float32), 3, axis=0)
    mesh.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(normals))
    mesh.SetNormalsInterpolation(UsdGeom.Tokens.faceVarying)
    mesh.CreateExtentAttr([Gf.Vec3f(*points.min(axis=0).tolist()), Gf.Vec3f(*points.max(axis=0).tolist())])
    rgba = numbers(visual.find('material/color').get('rgba'), (0.8, 0.8, 0.8, 1)).tolist()
    mesh.CreateDisplayColorAttr([Gf.Vec3f(*rgba[:3])])
    UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(material(stage, str(link_path).split('/')[-1], rgba))
    UsdPhysics.CollisionAPI.Apply(mesh.GetPrim()).CreateCollisionEnabledAttr(True)
    UsdPhysics.MeshCollisionAPI.Apply(mesh.GetPrim()).CreateApproximationAttr(UsdPhysics.Tokens.convexHull)
    physx(mesh.GetPrim(), 'PhysxCollisionAPI', {
        'physxCollision:contactOffset': (Sdf.ValueTypeNames.Float, .002),
        'physxCollision:restOffset': (Sdf.ValueTypeNames.Float, 0.),
    })
    report.append({'source': source.name, 'sha256': sha256(source), 'triangles': len(triangles),
                   'removedDegenerateTriangles': removed, 'uniquePoints': len(points), 'prim': str(mesh.GetPath())})


def inertial_data(link):
    inertial = link.find('inertial')
    if inertial is None:
        return None
    mass = float(inertial.find('mass').get('value'))
    i = inertial.find('inertia').attrib
    tensor = np.array([[float(i['ixx']), float(i['ixy']), float(i['ixz'])],
                       [float(i['ixy']), float(i['iyy']), float(i['iyz'])],
                       [float(i['ixz']), float(i['iyz']), float(i['izz'])]])
    frame = origin(inertial.find('origin'))
    tensor = frame[:3, :3] @ tensor @ frame[:3, :3].T
    if np.allclose(tensor, np.diag(np.diag(tensor)), atol=1e-14, rtol=0):
        # Principal moments need not be sorted. Keeping an already diagonal
        # tensor avoids unnecessary float-quaternion rounding at 90 degrees.
        principal, axes = np.diag(tensor).copy(), np.eye(3)
    else:
        principal, axes = np.linalg.eigh(tensor)
    require(mass > 0 and principal.min() > 0 and 2*principal.max() <= principal.sum()+1e-10, 'Invalid mass properties')
    if np.linalg.det(axes) < 0:
        axes[:, -1] *= -1
    return {'mass': mass, 'cog': frame[:3, 3], 'tensor': tensor, 'principal': principal, 'axes': axes}


def add_environment(stage, overview=False):
    scene = UsdPhysics.Scene.Define(stage, '/PhysicsScene')
    scene.CreateGravityDirectionAttr(Gf.Vec3f(0, 0, -1))
    scene.CreateGravityMagnitudeAttr(9.81)
    physx(scene.GetPrim(), 'PhysxSceneAPI', {
        'physxScene:timeStepsPerSecond': (Sdf.ValueTypeNames.UInt, 120),
        'physxScene:solverType': (Sdf.ValueTypeNames.Token, 'TGS'),
    })
    UsdGeom.Xform.Define(stage, '/Environment')
    ground = UsdGeom.Cube.Define(stage, '/Environment/Ground')
    ground.CreateSizeAttr(1)
    ground.AddTranslateOp().Set(Gf.Vec3d(0, 0, -.05))
    ground.AddScaleOp().Set(Gf.Vec3f(10 if overview else 6, 8 if overview else 6, .1))
    ground.CreateDisplayColorAttr([Gf.Vec3f(.15, .17, .2)])
    UsdPhysics.CollisionAPI.Apply(ground.GetPrim())
    dome = UsdLux.DomeLight.Define(stage, '/Environment/DomeLight')
    dome.CreateIntensityAttr(650)
    sun = UsdLux.DistantLight.Define(stage, '/Environment/KeyLight')
    sun.CreateIntensityAttr(2200)
    sun.AddRotateXYZOp().Set(Gf.Vec3f(-40, -25, 20))
    camera = UsdGeom.Camera.Define(stage, '/Environment/Camera')
    eye = Gf.Vec3d(5.5, -7, 5) if overview else Gf.Vec3d(2.2, -2.2, 1.7)
    target = Gf.Vec3d(0, 0, .6) if overview else Gf.Vec3d(.25, 0, .55)
    camera.AddTransformOp().Set(Gf.Matrix4d().SetLookAt(eye, target, Gf.Vec3d(0, 0, 1)).GetInverse())
    camera.CreateClippingRangeAttr(Gf.Vec2f(.01, 1000))


def initialize_stage(stage):
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z)
    UsdGeom.SetStageMetersPerUnit(stage, 1)
    UsdPhysics.SetStageKilogramsPerUnit(stage, 1)
    stage.SetTimeCodesPerSecond(120)
    stage.SetFramesPerSecond(120)
    stage.SetStartTimeCode(0)
    stage.SetEndTimeCode(12000)


def build_robot(short_name, source_name, output, audits, firmware):
    file = ROOT / '2_3DSimulation/urdf' / f'{source_name}.urdf'
    links, joints, poses = read_robot(file)
    destination = output / f'{short_name}.usd'
    # An anonymous layer avoids reusing mmap-backed files while regenerating.
    stage = Usd.Stage.CreateInMemory()
    initialize_stage(stage)
    robot = UsdGeom.Xform.Define(stage, '/Robot')
    stage.SetDefaultPrim(robot.GetPrim())
    Usd.ModelAPI(robot).SetKind(Kind.Tokens.component)
    Usd.ModelAPI(robot).SetAssetName(short_name)
    UsdPhysics.ArticulationRootAPI.Apply(robot.GetPrim())
    physx(robot.GetPrim(), 'PhysxArticulationAPI', {
        'physxArticulation:enabledSelfCollisions': (Sdf.ValueTypeNames.Bool, False),
        'physxArticulation:solverPositionIterationCount': (Sdf.ValueTypeNames.Int, 32),
        'physxArticulation:solverVelocityIterationCount': (Sdf.ValueTypeNames.Int, 8),
    })
    robot.GetPrim().CreateAttribute('inorobot:sourceModel', Sdf.ValueTypeNames.String).Set(source_name)
    robot.GetPrim().CreateAttribute('inorobot:jointNames', Sdf.ValueTypeNames.StringArray).Set([f'J{i}' for i in range(1, 7)])
    mesh_report, mass_data = [], {}
    for name, link in links.items():
        if name == 'tool0':
            continue
        body = UsdGeom.Xform.Define(stage, f'/Robot/{name}')
        put_pose(body, poses[name])
        UsdPhysics.RigidBodyAPI.Apply(body.GetPrim()).CreateRigidBodyEnabledAttr(True)
        info = inertial_data(link)
        if info:
            mass_data[name] = info
            mass = UsdPhysics.MassAPI.Apply(body.GetPrim())
            mass.CreateMassAttr(info['mass'])
            mass.CreateCenterOfMassAttr(Gf.Vec3f(*info['cog'].tolist()))
            mass.CreateDiagonalInertiaAttr(Gf.Vec3f(*info['principal'].tolist()))
            mass.CreatePrincipalAxesAttr(Gf.Quatf(quaternion(info['axes'])))
            audit = next(r for r in audits if r['link'] == name)
            body.GetPrim().CreateAttribute('inorobot:inertiaSource', Sdf.ValueTypeNames.String).Set(audit['source'])
        visual = link.find('visual')
        require(visual is not None, f'Missing mesh for {name}')
        collision = link.find('collision')
        require(collision is not None and
                collision.find('geometry/mesh').attrib == visual.find('geometry/mesh').attrib and
                np.allclose(origin(collision.find('origin')), origin(visual.find('origin'))), 'Separate collision authoring required')
        add_mesh(stage, body.GetPath(), visual, file, mesh_report)
    UsdGeom.Scope.Define(stage, '/Robot/Joints')
    fixed = UsdPhysics.FixedJoint.Define(stage, '/Robot/Joints/root_joint')
    fixed.CreateBody1Rel().SetTargets(['/Robot/base_link'])
    fixed.CreateLocalPos0Attr(Gf.Vec3f(0))
    fixed.CreateLocalPos1Attr(Gf.Vec3f(0))
    fixed.CreateLocalRot0Attr(Gf.Quatf(1))
    fixed.CreateLocalRot1Attr(Gf.Quatf(1))
    joint_report = []
    for index, source in enumerate(joints[:6]):
        name, parent, child = source.get('name'), source.find('parent').get('link'), source.find('child').get('link')
        frame = origin(source.find('origin'))
        axis = numbers(source.find('axis').get('xyz'))
        axis /= np.linalg.norm(axis)
        alignment = Gf.Rotation(Gf.Vec3d(1, 0, 0), Gf.Vec3d(*axis.tolist()))
        align_r = np.array(Gf.Matrix3d(alignment)).T
        joint = UsdPhysics.RevoluteJoint.Define(stage, f'/Robot/Joints/{name}')
        joint.CreateBody0Rel().SetTargets([f'/Robot/{parent}'])
        joint.CreateBody1Rel().SetTargets([f'/Robot/{child}'])
        joint.CreateAxisAttr(UsdPhysics.Tokens.x)
        joint.CreateLocalPos0Attr(Gf.Vec3f(*frame[:3, 3].tolist()))
        joint.CreateLocalPos1Attr(Gf.Vec3f(0))
        joint.CreateLocalRot0Attr(Gf.Quatf(quaternion(frame[:3, :3] @ align_r)))
        joint.CreateLocalRot1Attr(Gf.Quatf(alignment.GetQuat()))
        joint.CreateCollisionEnabledAttr(False)
        limits = source.find('limit')
        low, high = [math.degrees(float(limits.get(k))) for k in ('lower', 'upper')]
        effort, velocity = float(limits.get('effort')), math.degrees(float(limits.get('velocity')))
        joint.CreateLowerLimitAttr(low)
        joint.CreateUpperLimitAttr(high)
        source_link = firmware['links'][index]
        armature = source_link['motorInertia'] * source_link['ratio'] ** 2
        physx(joint.GetPrim(), 'PhysxJointAPI', {
            'physxJoint:maxJointVelocity': (Sdf.ValueTypeNames.Float, velocity),
            'physxJoint:armature': (Sdf.ValueTypeNames.Float, armature),
        })
        effective_inertia = armature
        world_axis = poses[parent][:3, :3] @ frame[:3, :3] @ axis
        pivot = poses[child][:3, 3]
        for k in range(index + 1, 7):
            body_name = f'link_{k}'
            data, pose = mass_data[body_name], poses[body_name]
            lever = (pose @ np.append(data['cog'], 1))[:3] - pivot
            inertia = pose[:3, :3] @ data['tensor'] @ pose[:3, :3].T
            effective_inertia += float(world_axis @ inertia @ world_axis + data['mass'] *
                                       (lever @ lever - (world_axis @ lever) ** 2))
        # Generic force-drive gains at 10 Hz, critical damping. USD angular
        # gains are per degree, so convert gains derived per radian by pi/180.
        omega = 2 * math.pi * 10
        stiffness = effective_inertia * omega ** 2 * math.pi / 180
        damping = 2 * effective_inertia * omega * math.pi / 180
        drive = UsdPhysics.DriveAPI.Apply(joint.GetPrim(), 'angular')
        drive.CreateTypeAttr(UsdPhysics.Tokens.force)
        drive.CreateStiffnessAttr(stiffness)
        drive.CreateDampingAttr(damping)
        drive.CreateMaxForceAttr(effort)
        drive.CreateTargetPositionAttr(0)
        drive.CreateTargetVelocityAttr(0)
        joint_report.append({'name': name, 'lowerDeg': low, 'upperDeg': high, 'maxVelocityDegPerSec': velocity,
                             'nominalMaxTorqueNm': effort, 'reflectedMotorInertiaKgM2': armature,
                             'stiffnessPerDegree': stiffness, 'dampingPerDegree': damping})
    tool_joint = joints[-1]
    tool = UsdGeom.Xform.Define(stage, '/Robot/link_6/tool0')
    put_pose(tool, origin(tool_joint.find('origin')))
    add_environment(stage)
    require(stage.GetRootLayer().Export(str(destination), args={'format': 'usdc'}), 'USD export failed')
    return {'name': short_name, 'file': destination.name, 'sourceModel': source_name, 'sourceUrdfSha256': sha256(file),
            'articulationRoot': '/Robot', 'toolFrame': '/Robot/link_6/tool0', 'fixedBase': True,
            'approximateInertiaLinks': [r['link'] for r in audits if r.get('reason')],
            'meshes': mesh_report, 'joints': joint_report, 'sha256': sha256(destination),
            'bytes': destination.stat().st_size}


def build_overview(output, models):
    destination = str(output / 'demo_all.usd')
    layer = Sdf.Layer.FindOrOpen(destination) if Path(destination).exists() else None
    if layer:
        layer.Clear()
        stage = Usd.Stage.Open(layer)
    else:
        stage = Usd.Stage.CreateNew(destination)
    initialize_stage(stage)
    world = UsdGeom.Xform.Define(stage, '/World')
    stage.SetDefaultPrim(world.GetPrim())
    for model, xy in zip(models, [(-1.5, -1.2), (1.5, -1.2), (-1.5, 1.3), (1.5, 1.3)]):
        robot = UsdGeom.Xform.Define(stage, '/World/' + model['name'].replace('-', '_'))
        robot.GetPrim().GetReferences().AddReference('./' + model['file'], '/Robot')
        robot.AddTranslateOp().Set(Gf.Vec3d(*xy, 0))
    add_environment(stage, True)
    stage.GetRootLayer().Save()


def quat_rotation(q):
    return np.array(Gf.Matrix3d(Gf.Rotation(Gf.Quatd(q)))).T


def pose_attrs(joint, side):
    return transform(np.array(joint.GetPrim().GetAttribute(f'physics:localPos{side}').Get()),
                     quat_rotation(joint.GetPrim().GetAttribute(f'physics:localRot{side}').Get()))


def axis_rotation(axis, angle):
    x, y, z = axis / np.linalg.norm(axis)
    skew = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    return np.eye(3) + math.sin(angle) * skew + (1 - math.cos(angle)) * (skew @ skew)


def validate_assets(output, models):
    rows = []
    for model in models:
        file = output / model['file']
        stage = Usd.Stage.Open(str(file))
        require(stage and stage.GetDefaultPrim().GetPath() == Sdf.Path('/Robot'), 'Missing default robot prim')
        require(UsdGeom.GetStageUpAxis(stage) == 'Z' and UsdGeom.GetStageMetersPerUnit(stage) == 1, 'Wrong stage units')
        require(stage.GetEndTimeCode() > stage.GetStartTimeCode(), 'Empty playback range')
        require(stage.GetPrimAtPath('/Robot').HasAPI(UsdPhysics.ArticulationRootAPI), 'Missing articulation root')
        require(len([p for p in stage.Traverse() if p.IsA(UsdPhysics.RevoluteJoint)]) == 6, 'Wrong DOF count')
        require(len([p for p in stage.Traverse() if p.HasAPI(UsdPhysics.RigidBodyAPI)]) == 7, 'Wrong rigid body count')
        links, sources, source_poses = read_robot(ROOT/'2_3DSimulation/urdf'/f'{model["sourceModel"]}.urdf')
        for index in range(1, 7):
            prim = stage.GetPrimAtPath(f'/Robot/link_{index}')
            actual = UsdPhysics.MassAPI(prim)
            expected = inertial_data(links[f'link_{index}'])
            require(math.isclose(actual.GetMassAttr().Get(), expected['mass'], rel_tol=1e-6), 'Mass changed')
            require(np.allclose(actual.GetCenterOfMassAttr().Get(), expected['cog'], atol=1e-7), 'Wrong CoM frame')
            r = quat_rotation(actual.GetPrincipalAxesAttr().Get())
            tensor = r @ np.diag(actual.GetDiagonalInertiaAttr().Get()) @ r.T
            require(np.allclose(tensor, expected['tensor'], rtol=1e-5, atol=1e-9), 'Inertia frame changed')
        cache = UsdGeom.XformCache()
        for mesh_data in model['meshes']:
            mesh = UsdGeom.Mesh(stage.GetPrimAtPath(mesh_data['prim']))
            points = np.array(mesh.GetPointsAttr().Get())
            require(np.isfinite(points).all() and points.shape[0] == mesh_data['uniquePoints'], 'Invalid embedded points')
            require(len(mesh.GetFaceVertexIndicesAttr().Get()) == mesh_data['triangles'] * 3, 'Invalid triangles')
            require(UsdPhysics.MeshCollisionAPI(mesh.GetPrim()).GetApproximationAttr().Get() == 'convexHull', 'Wrong collider')
            # At zero pose, all embedded meshes must line up with source CAD.
            link_name = mesh_data['prim'].split('/')[2]
            original = stl_triangles(ROOT/'2_3DSimulation/models'/model['name']/mesh_data['source']) * .001
            m = np.array(cache.GetLocalToWorldTransform(mesh.GetPrim())).T
            world_points = points @ m[:3, :3].T + m[:3, 3]
            require(np.allclose(world_points.min(axis=0), original.min(axis=(0, 1)), atol=2e-6) and
                    np.allclose(world_points.max(axis=0), original.max(axis=(0, 1)), atol=2e-6), f'Mesh misplaced: {link_name}')
        max_pose_error = 0
        for angles in [(0, 0, 0, 0, 0, 0), (20, -25, 45, 30, -20, 50), (-35, 15, -20, -40, 25, -60)]:
            urdf_pose, usd_pose = np.eye(4), np.eye(4)
            for index, angle in enumerate(angles):
                source = sources[index]
                joint = UsdPhysics.RevoluteJoint(stage.GetPrimAtPath(f'/Robot/Joints/J{index + 1}'))
                axis = numbers(source.find('axis').get('xyz'))
                urdf_pose = urdf_pose @ origin(source.find('origin')) @ transform(r=axis_rotation(axis, math.radians(angle)))
                usd_pose = usd_pose @ pose_attrs(joint, 0) @ transform(r=axis_rotation(np.array([1, 0, 0]), math.radians(angle))) @ np.linalg.inv(pose_attrs(joint, 1))
                require(np.allclose(urdf_pose, usd_pose, atol=3e-7), f'Joint frame/sign mismatch: J{index + 1}')
                max_pose_error = max(max_pose_error, float(np.max(np.abs(urdf_pose - usd_pose))))
            tool_local = np.array(UsdGeom.Xformable(stage.GetPrimAtPath(model['toolFrame'])).GetLocalTransformation()).T
            require(np.allclose(usd_pose @ tool_local, urdf_pose @ origin(sources[-1].find('origin')), atol=4e-7), 'TCP frame mismatch')
        for expected in model['joints']:
            prim = stage.GetPrimAtPath('/Robot/Joints/' + expected['name'])
            drive = UsdPhysics.DriveAPI(prim, 'angular')
            require(drive and drive.GetStiffnessAttr().Get() > 0 and drive.GetDampingAttr().Get() > 0, 'Inactive drive')
            require(math.isclose(drive.GetMaxForceAttr().Get(), expected['nominalMaxTorqueNm'], rel_tol=1e-6), 'Wrong torque cap')
            require(math.isclose(prim.GetAttribute('physxJoint:maxJointVelocity').Get(), expected['maxVelocityDegPerSec'], rel_tol=1e-6), 'Wrong velocity cap')
        layers, assets, unresolved = UsdUtils.ComputeAllDependencies(Sdf.AssetPath(str(file)))
        require(not assets and not unresolved and len(layers) == 1, 'Robot USD has external dependencies')
        checker = UsdUtils.ComplianceChecker(arkit=False, skipARKitRootLayerCheck=True)
        checker.CheckCompliance(str(file))
        require(not checker.GetErrors() and not checker.GetFailedChecks(), 'USD compliance failed: ' +
                str(checker.GetErrors() + checker.GetFailedChecks()))
        rows.append({'file': model['file'], 'status': 'passed', 'rigidBodies': 7, 'revoluteJoints': 6,
                     'embeddedMeshes': 7, 'externalDependencies': 0, 'jointPoseSamples': 3,
                     'maxKinematicMatrixError': max_pose_error, 'complianceWarnings': checker.GetWarnings()})
    overview = output / 'demo_all.usd'
    _, _, unresolved = UsdUtils.ComputeAllDependencies(Sdf.AssetPath(str(overview)))
    require(not unresolved, 'Overview has missing asset references')
    demo = Usd.Stage.Open(str(overview))
    require(len([p for p in demo.Traverse() if p.HasAPI(UsdPhysics.ArticulationRootAPI)]) == 4, 'Overview must contain four robots')
    return {'openUsdVersion': list(Usd.GetVersion()), 'isaacSimRuntimeTested': False,
            'models': rows, 'overview': 'passed; all four references resolve'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--usd-python-path', type=Path)
    parser.add_argument('--output-dir', type=Path, default=ROOT/'2_3DSimulation/usd')
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    load_dependencies(args.usd_python_path)
    output = args.output_dir.resolve()
    if args.validate_only:
        manifest = json.loads((output/'asset-manifest.json').read_text(encoding='utf-8'))
        validation = validate_assets(output, manifest['models'])
    else:
        output.mkdir(parents=True, exist_ok=True)
        source_dir = ROOT/'2_3DSimulation/urdf'
        firmware = json.loads((source_dir/'firmware-spc25.json').read_text(encoding='utf-8'))
        audits = json.loads((source_dir/'physics-audit.json').read_text(encoding='utf-8'))['models']
        models = []
        for short_name, source_name in SELECTED.items():
            audit = next(row for row in audits if row['outputFile'] == source_name+'.urdf')
            models.append(build_robot(short_name, source_name, output, audit['links'], firmware['models'][source_name]))
            print(f'Built {short_name}.usd ({models[-1]["bytes"] / 1024**2:.2f} MiB)', flush=True)
        build_overview(output, models)
        manifest = {'format': 'binary USD crate 0.8.0; Z-up, metres, kilograms', 'models': models,
                    'drivePolicy': 'Generic 10Hz critically damped force drives, gains converted per radian to per degree; nominal torque caps',
                    'collisionPolicy': 'Convex hull per link; self-collision disabled; contact offset 2mm',
                    'baseMassPolicy': 'Fixed root; base mass is inferred by the runtime from collision geometry, not a fabricated source mass',
                    'firmwareArchiveSha256': firmware['archiveSha256'], 'isaacSimRuntimeTested': False}
        (output/'asset-manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
        validation = validate_assets(output, models)
        for source in ['README_KO.md', 'isaac_smoke_test.py']:
            shutil.copyfile(ROOT/'tools/isaac-usd-package'/source, output/source)
    (output/'validation.json').write_text(json.dumps(validation, indent=2)+'\n', encoding='utf-8')
    if not args.validate_only:
        names = [m['file'] for m in manifest['models']] + ['demo_all.usd', 'asset-manifest.json', 'validation.json', 'README_KO.md', 'isaac_smoke_test.py']
        with zipfile.ZipFile(output/'InoRobot_IsaacSim_4Models.zip', 'w', compression=zipfile.ZIP_DEFLATED) as package:
            for name in names:
                package.write(output/name, name)
    print(json.dumps({'validated': len(validation['models']), 'output': str(output), 'isaacSimRuntimeTested': False}), flush=True)


if __name__ == '__main__':
    main()
