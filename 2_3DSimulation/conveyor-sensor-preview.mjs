import * as THREE from 'three';
import { ConveyorTracking, isConveyorSensorAddress } from './conveyor-tracking-core.mjs?v=20261118-request-capture-1';
import { conveyorLocalBounds } from './conveyor-scene.mjs';

export function normalizeSensorSettings(value) {
    const { capture: _legacyCapture, ...settings } = value;
    const result = { ...settings, channel: Number(value.channel ?? 0), scale: Number(value.scale ?? 1000),
        address: Number(value.address ?? 512), position: Number(value.position ?? 0), width: Number(value.width ?? 2),
        height: value.height == null ? null : Number(value.height), objectType: Number(value.objectType ?? 0) };
    for (const [key, min, max, integer] of [['channel',0,3,true],['scale',.00001,1e9],
        ['position',-1e6,1e6],['width',.1,1000],['objectType',0,15,true]]) {
        if (!Number.isFinite(result[key]) || result[key] < min || result[key] > max || (integer && !Number.isInteger(result[key])))
            throw new Error('센서 설정값을 확인하세요: ' + key);
    }
    if (!isConveyorSensorAddress(result.address)) throw new Error('센서 입력은 IN0~64 또는 IN512~2559를 사용하세요.');
    if (result.height !== null && (!Number.isFinite(result.height) || result.height < .1 || result.height > 500)) throw new Error('센서 높이는 0.1~500mm로 설정하세요.');
    return result;
}

// Both the local preview and K14 connection use this exact sensor volume/frame.
export function conveyorSensorLayout(belt, mapping, settings, mount = null) {
    belt.updateWorldMatrix(true, false);
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    belt.matrixWorld.decompose(position, rotation, scale);
    if (Math.min(scale.x, scale.y, scale.z) <= 0) throw new Error('반전된 컨베이어 모델은 연동할 수 없습니다.');
    if (mapping.conveyorAxis.endsWith('Y')) rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI / 2));
    const frame = new THREE.Object3D(); frame.matrixAutoUpdate = false;
    frame.matrix.compose(position, rotation, new THREE.Vector3(1,1,1)); frame.updateMatrixWorld(true);
    const box = conveyorLocalBounds(belt, frame);
    if (box.isEmpty()) throw new Error('컨베이어 형상을 읽을 수 없습니다.');
    let { position: x, width, height } = settings;
    if (mount) {
        mount.updateWorldMatrix(true,false);
        const center = new THREE.Vector3(0,0,12).applyMatrix4(mount.matrixWorld).applyMatrix4(frame.matrixWorld.clone().invert());
        x = center.x; height = center.z - box.max.z;
    }
    // Missing height retains the old saved sensor's full-height detection area.
    const z = box.max.z + (height ?? 40);
    const sensor = { min: { x: x-width/2, y: box.min.y, z: height === null ? box.max.z-2 : z-width/2 },
        max: { x: x+width/2, y: box.max.y, z: height === null ? box.max.z+500 : z+width/2 } };
    return { frame, box, sensor, z, mount, x, height, scale: mapping.conveyorAxis.endsWith('Y') ? scale.y : scale.x };
}

export function createConveyorSensorVisual(layout, settings) {
    const group = new THREE.Group(); group.name = 'Tracking sensor IN' + settings.address;
    group.matrixAutoUpdate = false; group.matrix.copy(layout.mount ? layout.mount.matrixWorld.clone().invert().multiply(layout.frame.matrixWorld) : layout.frame.matrixWorld);
    const { box, sensor, z } = layout, x = layout.x, span = box.max.y-box.min.y;
    const glow = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: .85, depthWrite: false });
    const body = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: .45, metalness: .4 });
    for (const y of [box.min.y-9, box.max.y+9]) {
        const housing = new THREE.Mesh(new THREE.BoxGeometry(16,16,24), body);housing.position.set(x,y,z);if (!layout.mount || y !== box.min.y-9) group.add(housing); else housing.geometry.dispose();
        const postHeight = Math.max(5,z-box.min.z-12);
        const post = new THREE.Mesh(new THREE.BoxGeometry(6,6,postHeight),body);post.position.set(x,y,box.min.z+postHeight/2);group.add(post);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,span,12),glow);beam.name='Sensor laser';beam.position.set(x,(box.min.y+box.max.y)/2,z);group.add(beam);
    const areaMaterial = new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:.12,depthWrite:false});
    const area = new THREE.Mesh(new THREE.BoxGeometry(settings.width,span,sensor.max.z-sensor.min.z),areaMaterial);
    area.position.set(x,(box.min.y+box.max.y)/2,(sensor.min.z+sensor.max.z)/2);group.add(area);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
    const context=canvas.getContext('2d');context.fillStyle='#0f172a';context.fillRect(0,0,256,64);
    context.fillStyle='#f8fafc';context.font='bold 34px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText('IN'+settings.address,128,32);
    const texture=new THREE.CanvasTexture(canvas),labelMaterial=new THREE.SpriteMaterial({map:texture,depthWrite:false});
    const label=new THREE.Sprite(labelMaterial);label.name='Sensor input label';label.position.set(x,box.min.y-24,z+30);label.scale.set(64,16,1);group.add(label);
    group.traverse(object=>{object.userData.virtualVisionHelper=true;object.raycast=()=>{};});
    return { group, setDetected(value) { const color=value?0x22c55e:0xef4444;glow.color.setHex(color);areaMaterial.color.setHex(color); },
        dispose() { group.removeFromParent();group.traverse(o=>o.geometry?.dispose());body.dispose();glow.dispose();areaMaterial.dispose();texture.dispose();labelMaterial.dispose(); } };
}

export function createConveyorSensorPreview(adapter) {
    const records = new Map();
    function remove(key) { records.get(key)?.visual.dispose();records.delete(key); }
    return {
        before(settings, mappings, candidates, connected) {
            const retained=new Set();
            for(const value of settings) {
                const mapping=mappings.find(m=>m.gripObjectRef===value.belt),belt=mapping&&adapter.resolveBelt(mapping);
                if(!belt)continue;
                try {
                    const config=normalizeSensorSettings(value),layout=conveyorSensorLayout(belt,mapping,config,adapter.resolveSensor?.(config));
                    const signature=JSON.stringify([config,layout.frame.matrixWorld.elements,layout.sensor]);
                    let record=records.get(value.belt);
                    if(record?.signature!==signature) {
                        remove(value.belt);
                        const visual=createConveyorSensorVisual(layout,config);(layout.mount || adapter.scene()).add(visual.group);
                        record={config,layout,visual,signature,mapping,tracker:new ConveyorTracking({conveyor:config.channel,countsPerMm:config.scale,session:crypto.randomUUID(),sensors:[{id:'photo',address:config.address,bounds:layout.sensor}]})};
                        records.set(value.belt,record);
                    }
                    record.visual.group.visible=!connected.has(value.belt)&&belt.visible!==false;
                    record.before=new Map(candidates.filter(adapter.eligible).map(o=>[o,conveyorLocalBounds(o,layout.frame)]).filter(([,b])=>!b.isEmpty()));
                    retained.add(value.belt);
                } catch(error) { remove(value.belt);adapter.report(error.message); }
            }
            for(const key of records.keys())if(!retained.has(key))remove(key);
        },
        after(seconds,active,candidates) {
            for(const record of records.values()) {
                try {
                    const {config,layout,tracker}=record,entries=[];
                    for(const object of candidates.filter(adapter.eligible)) {
                        const old=record.before.get(object),current=conveyorLocalBounds(object,layout.frame);
                        if(!old||current.isEmpty())continue;
                        entries.push({before:old,after:current});
                    }
                    const moving=active.find(m=>m.gripObjectRef===config.belt);
                    const distance=moving?seconds*moving.conveyorSpeed*layout.scale*(moving.conveyorAxis.startsWith('-')?-1:1):0;
                    const frame=tracker.sample({seconds,distance,objects:entries});
                    record.level=frame.sensors[0].value;record.encoder=frame.encoder;record.visual.setDetected(record.level);
                    tracker.acknowledge({session:tracker.session,eventId:tracker.eventId});
                } catch(error) { adapter.report(error.message); }
            }
        },
        summary(key) { const r=records.get(key);return r?{address:r.config.address,level:r.level||0,encoder:r.encoder||'0'}:null; },
        clear() { for(const key of records.keys())remove(key); }
    };
}
