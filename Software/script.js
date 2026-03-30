/**
 * Software Data
 * InoRobotLab, InoRobotTP 두 가지 메인 소프트웨어와 버전을 관리합니다.
 */
const softwareGroups = [
    {
        name: "InoRobotLab",
        fullName: "InoRobotLab (PC SW)",
        id: "InoRobotLab",
        icon: "monitor",
        versions: [
            {
                tagName: "Standard (V4R24C4SPC15)",
                description: "InoRobotLab 소프트웨어 설명서 (설치/무설치)",
                date: "2026-03-20",
                updates: ["시스템 최적화", "환경 설정 지원"],
                downloads: [
                    { label: "Download (Install)", type: "install", size: "450MB", path: "InoRobotLab/InoRobotLabSetUp_V4R24C4SPC15_x64.exe" },
                    { label: "Download (Portable)", type: "portable", size: "380MB", path: "InoRobotLab/InoRobotLab_V4R24C4SPC15_x64.zip" }
                ]
            },
            {
                tagName: "Display Version (Special)",
                description: "Display 공정용 특수 버전 설명서",
                date: "2026-03-20",
                isLocked: true,
                updates: ["Display 모듈 지원"],
                downloads: [
                    { label: "Download (Install)", type: "install", size: "482MB", path: "InoRobotLab/Display/InoRobotLabSetUp_V4R24C4SPC4L9F121_x64.exe" },
                    { label: "Download (Portable)", type: "portable", size: "454MB", path: "InoRobotLab/Display/InoRobotLab_V4R24C4SPC4L9F121_x64.zip" }
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
                tagName: "Standard (V4R24C4SPC15)",
                description: "InoRobotTP 소프트웨어 설명서",
                date: "2026-03-21",
                updates: ["사용자 환경 개선"],
                downloads: [
                    { label: "Download", type: "portable", size: "57MB", path: "InoRobotTP/InoRobotTP_win_x86_V4R24C4SPC15.zip" }
                ]
            },
            {
                tagName: "Display Version (Special)",
                description: "Display 공정용 TP 설명서",
                date: "2026-03-21",
                isLocked: true,
                updates: ["Display 최적화"],
                downloads: [
                    { label: "Download", type: "portable", size: "57MB", path: "InoRobotTP/Display/InoRobotTP_win_x86_V4R24C4SPC4L9F121.zip" }
                ]
            }
        ]
    }
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    init();
});

function init() {
    renderSoftwareList('all');
    setupFilters();
    setupSearch();
    if(window.lucide) lucide.createIcons();
}

/**
 * 소프트웨어 리스트 렌더링
 * @param {string} filterType 'all', 'InoRobotLab', 'InoRobotTP'
 * @param {string} searchTerm 검색어
 */
function renderSoftwareList(filterType = 'all', searchTerm = '') {
    const listContainer = document.getElementById('softwareList');
    listContainer.innerHTML = '';

    let matchCount = 0;

    softwareGroups.forEach(group => {
        // 필터링 적용
        if (filterType !== 'all' && group.id !== filterType) return;

        group.versions.forEach(ver => {
            // 검색 가공
            const isMatch = group.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          ver.tagName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          ver.description.toLowerCase().includes(searchTerm.toLowerCase());
            
            if (!isMatch) return;
            matchCount++;

            const card = document.createElement('div');
            card.className = 'software-card p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start animate-fade-in-up';
            
            // 아이콘 및 헤더
            let verBadgeClass = ver.isLocked ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-blue-600/10 text-blue-400 border-blue-500/20";
            let verIcon = ver.isLocked ? "lock" : "check-circle";

            card.innerHTML = `
                <div class="flex-shrink-0 w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                    <i data-lucide="${group.icon}" class="w-8 h-8"></i>
                </div>
                <div class="flex-grow space-y-4">
                    <div class="flex flex-wrap items-center gap-3">
                        <h3 class="text-2xl font-bold text-white font-outfit">${group.name}</h3>
                        <div class="px-3 py-1 rounded-full border ${verBadgeClass} text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wide">
                            <i data-lucide="${verIcon}" class="w-3 h-3"></i> ${ver.tagName}
                        </div>
                    </div>
                    <p class="text-slate-400 text-sm italic">${ver.description}</p>
                    
                    <div class="flex flex-wrap items-center gap-4 pt-4 border-t border-white/[0.05]">
                        <div class="flex items-center gap-6 text-xs text-slate-500 font-mono">
                            <span class="flex items-center gap-1.5"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${ver.date}</span>
                        </div>
                        <div class="flex flex-wrap gap-3 ml-auto">
                            ${ver.downloads.map(dl => `
                                <button onclick="handleDownload('${dl.path}', ${ver.isLocked})" 
                                        class="px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${ver.isLocked ? 'locked-btn' : 'download-btn'}">
                                    <i data-lucide="${ver.isLocked ? 'key' : 'download'}" class="w-3.5 h-3.5"></i> ${dl.label} (${dl.size})
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    });

    if (matchCount === 0) {
        listContainer.innerHTML = `
            <div class="py-20 text-center text-slate-500">
                <i data-lucide="alert-circle" class="w-12 h-12 mx-auto mb-4 opacity-20"></i>
                <p class="text-lg">해당 조건에 맞는 소프트웨어가 없습니다.</p>
            </div>
        `;
    }

    if(window.lucide) lucide.createIcons();
}

/**
 * 필터 설정
 */
function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderSoftwareList(btn.dataset.type, document.getElementById('softwareSearch').value);
        });
    });
}

/**
 * 검색 설정
 */
function setupSearch() {
    const searchInput = document.getElementById('softwareSearch');
    searchInput.addEventListener('input', (e) => {
        const activeFilter = document.querySelector('.filter-btn.active').dataset.type;
        renderSoftwareList(activeFilter, e.target.value);
    });
}

/**
 * 다운로드 핸들러
 * @param {string} path 파일 경로
 * @param {boolean} isLocked 잠김 여부
 */
function handleDownload(path, isLocked) {
    if (isLocked) {
        const password = prompt("[기능 제한 안내] 이 버전은 전용 배포판입니다. 비밀번호를 입력해 주세요:");
        
        if (password === '2206') {
            downloadFile(path);
        } else if (password !== null) {
            alert("비밀번호가 올바르지 않습니다. 관리자에게 문의하세요.");
        }
    } else {
        downloadFile(path);
    }
}

function downloadFile(path) {
    const lfsUrl = `https://media.githubusercontent.com/media/hois56/InoRobotAssistant/main/Software/${path}`;
    const link = document.createElement('a');
    link.href = lfsUrl;
    link.download = path.split('/').pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
