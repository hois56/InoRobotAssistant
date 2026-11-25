/**
 * Software Data
 * InoRobotLab, InoRobotTP 및 한글 패치기의 버전과 다운로드를 관리합니다.
 */
const softwareGroups = [
    {
        name: "InoRobotLab",
        fullName: "InoRobotLab (PC SW)",
        id: "InoRobotLab",
        icon: "monitor",
        versions: [
            {
                tagName: "시뮬레이션 버전 (SPC25K14 R5)",
                description: "가상 컨트롤러 시뮬레이션용 InoRobotLab·펜던트 통합 포터블 버전",
                date: "2026-11-23",
                downloads: [
                    { label: "Download Portable", type: "portable", size: "659MB", path: "InoRobotLab/Simulation/InoRobotLab_TP_SPC25K14_20261123_R5.zip", url: "https://github.com/hois56/InoRobotAssistant/releases/download/inorobotlab-simulation-k14-20261123/InoRobotLab_TP_SPC25K14_20261123_R5.zip" }
                ]
            },
            {
                tagName: "Standard (V4R24C4SPC25)",
                description: "InoRobotLab 소프트웨어 (설치/무설치)",
                date: "2026-10-01",
                updates: ["시스템 안정성 개선"],
                downloads: [
                    { label: "Download Install", type: "install", size: "535MB", path: "InoRobotLab/InoRobotLabSetUp_V4R24C4SPC25_x64.zip", url: "https://github.com/hois56/InoRobotAssistant/releases/download/downloads-2026-10-30/InoRobotLabSetUp_V4R24C4SPC25_x64.zip" },
                    { label: "Download Portable", type: "portable", size: "549MB", path: "InoRobotLab/InoRobotLab_V4R24C4SPC25_x64.zip", url: "https://github.com/hois56/InoRobotAssistant/releases/download/downloads-2026-10-30/InoRobotLab_V4R24C4SPC25_x64.zip" }
                ]
            },
            {
                tagName: "Display Version (V4R24C4SPC0L23F121)",
                description: "디스플레이 공정 전용 소프트웨어",
                date: "2026-09-08",
                isLocked: false,
                updates: ["Display 모듈 지원"],
                downloads: [
                    { label: "Download Install", type: "install", size: "514MB", path: "InoRobotLab/Display/InoRobotLabSetUp_V4R24C4SPC0L23F121_x64.exe", url: "https://github.com/hois56/InoRobotAssistant/releases/download/downloads-2026-10-30/InoRobotLabSetUp_V4R24C4SPC0L23F121_x64.exe" },
                    { label: "Download Portable", type: "portable", size: "506MB", path: "InoRobotLab/Display/InoRobotLab_V4R24C4SPC0L23F121_x64.zip", url: "https://github.com/hois56/InoRobotAssistant/releases/download/downloads-2026-10-30/InoRobotLab_V4R24C4SPC0L23F121_x64.zip" }
                ]
            }
        ]
    },
    {
        name: "InoRobotTP",
        fullName: "InoRobotTP (Pendant SW)",
        id: "InoRobotTP",
        icon: "smartphone",
        versions: [
            {
                tagName: "Standard (V4R24C4SPC25)",
                description: "InoRobotTP 소프트웨어",
                date: "2026-10-01",
                updates: ["시스템 안정성 개선"],
                downloads: [
                    { label: "Download Portable", type: "portable", size: "57MB", path: "InoRobotTP/InoRobotTP_win_x86_V4R24C4SPC25.zip", url: "https://github.com/hois56/InoRobotAssistant/releases/download/downloads-2026-10-30/InoRobotTP_win_x86_V4R24C4SPC25.zip" }
                ]
            },
            {
                tagName: "Display Version (V4R24C4SPC0L23F121)",
                description: "디스플레이 공정용 티칭 펜던트 소프트웨어",
                date: "2026-09-08",
                isLocked: false,
                updates: ["Display 최적화"],
                downloads: [
                    { label: "Download Portable", type: "portable", size: "57MB", path: "InoRobotTP/Display/InoRobotTP_win_x86_V4R24C4SPC0L23F121.zip", url: "https://github.com/hois56/InoRobotAssistant/releases/download/downloads-2026-10-30/InoRobotTP_win_x86_V4R24C4SPC0L23F121.zip" }
                ]
            }
        ]
    },
    {
        name: "InoRobotKoreanInstaller",
        fullName: "InoRobotKoreanInstaller",
        id: "InoRobotKoreanInstaller",
        icon: "languages",
        versions: [
            {
                tagName: "V1.0.1",
                description: "InoRobotLab·InoRobotTP R24C4 계열 표준·디스플레이 버전용 한글 패치기",
                date: "2026-11-25",
                downloads: [
                    { label: "Download Install", type: "install", size: "79MB", path: "InoRobotKoreanInstaller/InoRobotKoreanInstaller_V1.0.1.zip", url: "https://github.com/hois56/InoRobotAssistant/releases/download/inorobot-korean-installer-v1.0.1/InoRobotKoreanInstaller_V1.0.1.zip" }
                ]
            }
        ]
    }
];

function translateUiText(value) {
    return window.InoRobotI18n ? window.InoRobotI18n.translate(String(value || '')) : String(value || '');
}

document.addEventListener('DOMContentLoaded', init);

let filterSoftware;
function init() {
    filterSoftware = InoSite.groupFilter(Array.from(document.querySelectorAll('#softwareList .software-group')),
        section => section.dataset.group, section => section.querySelectorAll('.software-card').length);
    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', () => selectSoftwareFilter(button.dataset.type));
    });
    document.getElementById('softwareList').addEventListener('click', event => {
        const button = event.target.closest('button[data-download-key]');
        if (button && button.getAttribute('aria-disabled') !== 'true') {
            downloadFile(decodeURIComponent(button.dataset.downloadKey));
        }
    });
    const updateResults = () => renderSoftwareList(document.querySelector('.filter-btn.active')?.dataset.type || 'all');
    document.addEventListener('inorobot:i18nready', updateResults);
    document.addEventListener('inorobot:languagechange', updateResults);
    updateResults();
}

/** Show product groups without rebuilding Astryx controls or moving keyboard focus. */
function renderSoftwareList(filterType = 'all') {
    const matchCount = filterSoftware(filterType);
    const count = document.getElementById('softwareResultCount');
    const label = matchCount + ' ' + translateUiText('개');
    if (count.textContent !== label) count.textContent = label;
}

function selectSoftwareFilter(type) {
    document.querySelectorAll('.filter-btn').forEach(button => {
        const active = button.dataset.type === type;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    renderSoftwareList(type);
}

function downloadFile(url, fileName = '') {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || url.split('/').pop();
    document.body.appendChild(link);
    link.click();
    link.remove();
}
