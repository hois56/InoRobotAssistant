import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const runtimeSource = fs.readFileSync(new URL('Language/runtime/i18n.js', root), 'utf8');
const bundleSource = fs.readFileSync(new URL('Language/runtime/locales-data.js', root), 'utf8');

function storage() {
    const values = new Map();
    return {
        getItem: key => (values.has(key) ? values.get(key) : null),
        setItem: (key, value) => values.set(key, String(value))
    };
}

// Loads the runtime without running init(): the document stays in the loading state.
function loadRuntime(pathname = '/2_3DSimulation/', mapLocales = locales => locales) {
    const window = {
        location: { pathname },
        localStorage: storage(),
        sessionStorage: storage(),
        addEventListener() {}
    };
    const document = { readyState: 'loading', addEventListener() {} };
    const context = vm.createContext({ window, document, console });
    vm.runInContext(bundleSource, context);
    window.INOROBOT_LOCALES = mapLocales(window.INOROBOT_LOCALES);
    vm.runInContext(runtimeSource, context);
    return { i18n: window.InoRobotI18n, locales: window.INOROBOT_LOCALES };
}

test('legacy keys that are full sentences ending with a period resolve instead of showing the key', () => {
    const { i18n } = loadRuntime();
    assert.equal(i18n.t('legacy.포인트 레코드가 없습니다.'), '포인트 레코드가 없습니다.');
    assert.equal(i18n.t('legacy.텍스트를 입력하세요.'), '텍스트를 입력하세요.');

    const english = loadRuntime('/2_3DSimulation/', locales => ({ ...locales, ko: locales.en })).i18n;
    assert.equal(english.t('legacy.포인트 레코드가 없습니다.'), 'No point records.');
    assert.equal(english.t('legacy.텍스트를 입력하세요.'), 'Enter text.');
});

test('nested keys, page dictionaries and the shared fallback dictionary keep working', () => {
    const { i18n, locales } = loadRuntime('/2_3DSimulation/', locales => ({ ...locales, ko: locales.en }));
    assert.equal(i18n.t('pages.robot3dViewer.title'), locales.en.pages.robot3dViewer.title);
    assert.equal(i18n.t('missing.key', null, 'fallback'), 'fallback');
    assert.equal(i18n.translate('포인트 레코드가 없습니다.'), 'No point records.');
    // A sentence from another page's dictionary is still translated through the shared fallback.
    const homeSource = Object.keys(locales.en.pageTranslations.home.legacy).find(key => /[가-힣]/.test(key)
        && !Object.prototype.hasOwnProperty.call(locales.en.pageTranslations.robot3dViewer.legacy, key));
    assert.ok(homeSource, 'expected a home-only sentence');
    assert.equal(i18n.translate(homeSource), locales.en.pageTranslations.home.legacy[homeSource]);
    const legacy = i18n.get('legacy', {});
    assert.equal(legacy[homeSource], locales.en.pageTranslations.home.legacy[homeSource]);
});

test('page and shared pattern translations apply repeatedly with the same result', () => {
    const { i18n } = loadRuntime('/1_RobotModelSelect/', locales => ({ ...locales, ko: locales.en }));
    for (let round = 0; round < 3; round += 1) {
        assert.equal(i18n.translate('12주'), '12 weeks');
        assert.equal(i18n.translate('[IR-S4-40Z15S-INT] 제품 상세 및 구성'), '[IR-S4-40Z15S-INT] Product Details and Configuration');
        assert.equal(i18n.translate('RemoteIO 파싱 오류: line 3'), 'Remote I/O parsing error: line 3');
    }
});
