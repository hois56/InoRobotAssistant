import { BufferAttribute, BufferGeometry, FileLoader, Loader } from 'three';
import { parseStl } from './stl-core.mjs';

export class STLLoader extends Loader {
    load(url, onLoad, onProgress, onError) {
        const loader = new FileLoader(this.manager);
        loader.setPath(this.path).setResponseType('arraybuffer');
        loader.setRequestHeader(this.requestHeader).setWithCredentials(this.withCredentials);
        loader.load(url, bytes => {
            try { onLoad(this.parse(bytes)); }
            catch (error) { onError?.(error); this.manager.itemError(url); }
        }, onProgress, onError);
    }

    parse(data) {
        const bytes = typeof data === 'string' ? Uint8Array.from(data, c => c.charCodeAt(0)) : data;
        const { geometry, groups, alpha } = parseStl(bytes);
        const mesh = new BufferGeometry();
        for (const [name, { array, itemSize }] of Object.entries(geometry.attributes)) {
            mesh.setAttribute(name, new BufferAttribute(array, itemSize));
        }
        if (groups.length) {
            mesh.userData.groupNames = groups.map(group => group.name);
            groups.forEach(({ start, count }, index) => mesh.addGroup(start, count, index));
        }
        if (alpha >= 0) { mesh.hasColors = true; mesh.alpha = alpha; }
        return mesh;
    }
}
