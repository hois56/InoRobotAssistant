/* Shared model identity and asset paths for static pages and the configurator. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.InoRobotModelPages = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    const catalogPath = '/1_RobotModelSelect/';
    const routePrefix = catalogPath + 'models/';

    function isHiddenProduct(product) {
        return product?.specs?.Type === 'SCARA' && String(product.name || '').toUpperCase().startsWith('IR-CS');
    }

    function modelPath(id) {
        const slug = String(id || '').toUpperCase();
        if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(slug)) throw new Error('Invalid robot model ID');
        return routePrefix + slug + '/';
    }

    function productFromUrl(input, products) {
        let url;
        try { url = new URL(input, 'https://inovancerobot.com'); } catch { return null; }
        const match = url.pathname.match(/^\/1_RobotModelSelect\/models\/([^/]+)(?:\/(?:index\.html)?)?$/i);
        let id = url.searchParams.get('model');
        if (match) {
            try { id = decodeURIComponent(match[1]); } catch { return null; }
        }
        if (!id) return null;
        return products.find(product => !isHiddenProduct(product) && product.id.toLowerCase() === id.toLowerCase()) || null;
    }

    function displayName(product) {
        let name = String(product.name || product.id);
        if (product.specs?.Type === 'SCARA' && product.specs['Clean Type'] === 'Yes') {
            name = name.replace(/\s*\(Clean Type\)\s*/gi, '');
            name = name.replace(/Z(\d+)(S)/gi, (_, value) => 'Z' + (Number.parseInt(value, 10) - 3) + 'C');
        }
        return name;
    }

    function imagePath(product) {
        const name = product.name.toUpperCase();
        const clean = product.specs['Clean Type'] === 'Yes';
        let image = 'robot.png';
        if (product.specs.Type === 'SCARA') {
            if (name.includes('TS4')) image = 'IR-TS4.png';
            else if (name.includes('TS5')) image = 'IR-TS5.png';
            else if (name.includes('S4')) image = clean ? 'IR-S4_Clean.png' : 'IR-S4.png';
            else if (name.includes('S7')) {
                if (clean && name.includes('-50')) image = 'IR-S7-50_Clean.png';
                else if (clean && name.includes('-60')) image = 'IR-S7-60_Clean.png';
                else if (clean && name.includes('-70')) image = 'IR-S7-70_Clean.png';
                else image = 'IR-S7.png';
            } else if (name.includes('S10')) {
                if (clean && name.includes('-60')) image = 'IR-S10-60_Clean.png';
                else if (clean && name.includes('-70')) image = 'IR-S10-70_Clean.png';
                else if (clean && name.includes('-80')) image = 'IR-S10-80_Clean.png';
                else image = 'IR-S10.png';
            } else if (name.includes('S25')) image = clean ? 'IR-S25-Clean.png' : 'IR-S25.png';
            else if (name.includes('S35')) {
                if (name.includes('-80')) image = clean ? 'IR-S35-80_Clean.png' : 'IR-S35-80.png';
                else image = clean ? 'IR-S35-100_Clean.png' : 'IR-S35-100.png';
            } else if (name.includes('S60')) image = 'IR-S60.png';
            else image = 'scara_std.png';
        } else {
            const matches = [
                ['IR-R4H','IR-R4H.png'],['IR-R4','IR-R4.png'],['IR-R7H','IR-R7H.png'],
                ['IR-R10-110','IR-R10-110.png'],['IR-R10-140','IR-R10-140.png'],
                ['IR-R10H-120','IR-R10H-120.png'],['IR-R11','IR-R11.png'],['IR-R15H','IR-R15H.png'],
                ['IR-R16','IR-R16.png'],['IR-R20H','IR-R20H.png'],['IR-R25','IR-R25.png']
            ];
            image = matches.find(([prefix]) => name.includes(prefix))?.[1] || 'axis6_std.png';
        }
        return 'Model_image/' + image;
    }

    return Object.freeze({catalogPath, routePrefix, modelPath, productFromUrl, displayName, imagePath, isHiddenProduct});
});
