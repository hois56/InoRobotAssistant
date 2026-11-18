#!/usr/bin/env python3
"""Extract catalog USD/URDF source records, without running firmware code.

Uses only the Python standard library. Keep the installer and binaries outside
the repository; the generated JSON records hashes and exact archive paths.
"""
import argparse
import bz2
import hashlib
import io
import json
import subprocess
from pathlib import Path
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def catalog_sources():
    # Read the existing explicit model-to-firmware mapping, not a family-name
    # guess. Families without an INT default export each actual source variant.
    code = """import {pathToFileURL} from 'node:url';
const {RAPID_MODEL_DATA:d}=await import(pathToFileURL(process.argv[1]));
console.log(JSON.stringify(Object.values(d.models).flatMap(m=>(m.defaultVariantId
?[m.defaultVariantId]:m.variantIds).map(id=>({id,folder:m.catalogFolder,
robotType:m.robotType,kinematicVariant:m.kinematicVariant,axisCount:m.axisCount,
sourceSelectionRequired:m.sourceSelectionRequired===true,sourcePath:d.variants[id].source.path})))));"""
    result = subprocess.run(['node', '--input-type=module', '-e', code,
                             str(ROOT / '2_3DSimulation/rapid-model-data.mjs')],
                            check=True, capture_output=True, encoding='utf-8')
    return json.loads(result.stdout)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def extract(archive):
    records = {}
    with zipfile.ZipFile(archive) as outer:
        params_path = next(n for n in outer.namelist() if n.endswith('/params_package.zip'))
        params_bytes = outer.read(params_path)
        with zipfile.ZipFile(io.BytesIO(params_bytes)) as params:
            for selection in catalog_sources():
                name = selection['id']
                member = selection['sourcePath']
                data = params.read(member)
                source = json.loads(data)
                axes = selection['axisCount']
                records[name] = {
                    **{k: v for k, v in selection.items() if k not in ('id', 'sourcePath')},
                    'sourcePath': member, 'sourceSha256': sha256(data),
                    'links': source['stRobotBody']['stDynamics']['stLink'][:axes],
                    'torqueLimit': source['stJoint']['stTorqueLimit'],
                    'jointLimits': {k: source['stJoint'][k][:axes]
                                    for k in ['dPosLimit', 'dNegLimit', 'dMaxVelLimit']},
                    'playback': {k: source['stMotion']['stPlayback'][k]
                                 for k in ['stJoint', 'stJointLimit', 'stCartesian']},
                    'kinematicStructure': source['stRobotBody']['stKinematics']['dRobotStructureParam'],
                    'rapidDefaults': source['stRobotBody']['stBest'],
                }
        image_path = next(n for n in outer.namelist() if n.endswith('/robotsys.img.ud'))
        with tarfile.open(fileobj=io.BytesIO(bz2.decompress(outer.read(image_path)))) as system:
            library_bytes = system.extractfile('robotsys/robotlib.tar.bz2').read()
        with tarfile.open(fileobj=io.BytesIO(library_bytes)) as libraries:
            hashes = {name: sha256(libraries.extractfile(f'robotlib/{name}').read())
                      for name in ['MC_ArticulatedArm_A', 'libDyncLib_Six.so', 'libDyncLib_Scara.so']}
    with archive.open('rb') as source:
        archive_hash = hashlib.file_digest(source, 'sha256').hexdigest()
    return {
        'archive': archive.name, 'archiveSha256': archive_hash,
        'parameterArchivePath': params_path, 'parameterArchiveSha256': sha256(params_bytes),
        'binarySha256': hashes,
        'semantics': {
            'units': 'kg, m, kg*m^2, motor-shaft N*m; no magnitude-based conversion',
            'initialization': 'SetDyncLinkPrm copies 19 doubles; SetDyncArmLoad clears cross inertia terms, including zero arm loads',
            'nominalJointTorque': 'abs(ratedTrq * ratio); SetDyncPlanRatedTq applies a separate planning multiplier',
            'uiInertiaLabel': '重力模型',
        },
        'models': records,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]
                        / '2_3DSimulation/urdf/firmware-spc25.json')
    args = parser.parse_args()
    result = extract(args.archive)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Extracted {len(result["models"])} models to {args.output}')


if __name__ == '__main__':
    main()
