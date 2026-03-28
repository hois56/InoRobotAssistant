const softwareData = [
    {
        id: "ino_studio_v4",
        name: "InoRobot Studio (V4)",
        category: "controller",
        version: "4.2.1.0",
        date: "2026-03-20",
        description: "INOVANCE 로봇 컨트롤러 프로그래밍 및 설정을 위한 통합 개발 환경입니다.",
        size: "450MB",
        icon: "monitor"
    },
    {
        id: "ino_studio_v3",
        name: "InoRobot Studio (V3)",
        category: "controller",
        version: "3.8.5.2",
        date: "2025-11-12",
        description: "구형 컨트롤러(S/M 시리즈)를 위한 레거시 프로그래밍 도구입니다.",
        size: "380MB",
        icon: "monitor"
    },
    {
        id: "tool_config_util",
        name: "Tool Configuration Utility",
        category: "tool",
        version: "1.0.5",
        date: "2026-02-15",
        description: "비전 시스템 및 그리퍼 연결 설정을 위한 전용 유틸리티입니다.",
        size: "85MB",
        icon: "wrench"
    },
    {
        id: "usb_driver_pkg",
        name: "USB Communication Driver",
        category: "driver",
        version: "2.1.0",
        date: "2026-01-05",
        description: "PC와 로봇 컨트롤러 간의 USB 연결을 위한 통합 드라이버 패키지입니다.",
        size: "12MB",
        icon: "cpu"
    },
    {
        id: "firmware_update_tool",
        name: "Firmware Update Tool",
        category: "patch",
        version: "5.0.1",
        date: "2026-03-10",
        description: "최신 펌웨어 업데이트 및 시스템 복구를 위한 도구입니다.",
        size: "45MB",
        icon: "refresh-cw"
    }
];

function init() {
    renderSoftware('all');
    setupFilters();
    setupSearch();
    if(window.lucide) lucide.createIcons();
}

function renderSoftware(category, searchTerm = '') {
    const grid = document.getElementById('swGrid');
    grid.innerHTML = '';

    const filtered = softwareData.filter(sw => {
        const matchesCat = (category === 'all' || sw.category === category);
        const matchesSearch = sw.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             sw.description.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-20 text-center text-slate-500">
                <i data-lucide="info" class="w-12 h-12 mx-auto mb-4 opacity-20"></i>
                <p>검색 결과가 없습니다.</p>
            </div>
        `;
        if(window.lucide) lucide.createIcons();
        return;
    }

    filtered.forEach(sw => {
        const card = document.createElement('div');
        card.className = 'glass-card p-6 rounded-2xl flex flex-col h-full group';
        card.innerHTML = `
            <div class="flex items-start justify-between mb-6">
                <div class="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                    <i data-lucide="${sw.icon}" class="w-6 h-6"></i>
                </div>
                <div class="text-right">
                    <span class="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-1">Version</span>
                    <span class="text-xs font-bold text-slate-300 bg-slate-800 px-2 py-1 rounded-md border border-white/5">${sw.version}</span>
                </div>
            </div>
            
            <h3 class="text-xl font-bold text-white mb-2">${sw.name}</h3>
            <p class="text-slate-400 text-sm leading-relaxed mb-6 flex-grow">${sw.description}</p>
            
            <div class="flex items-center justify-between pt-6 border-t border-white/5 mt-auto">
                <div class="flex flex-col">
                    <span class="text-[10px] text-slate-500 font-mono tracking-tight">${sw.date}</span>
                    <span class="text-xs text-slate-400">${sw.size}</span>
                </div>
                <button onclick="handleDownload('${sw.id}')" 
                        class="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl font-medium text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2">
                    <i data-lucide="download" class="w-4 h-4"></i> Download
                </button>
            </div>
        `;
        grid.appendChild(card);
    });

    if(window.lucide) lucide.createIcons();
}

function setupFilters() {
    const btns = document.querySelectorAll('.cat-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderSoftware(btn.dataset.category, document.getElementById('swSearch').value);
        });
    });
}

function setupSearch() {
    const input = document.getElementById('swSearch');
    input.addEventListener('input', (e) => {
        const activeCat = document.querySelector('.cat-btn.active').dataset.category;
        renderSoftware(activeCat, e.target.value);
    });
}

function handleDownload(id) {
    const sw = softwareData.find(s => s.id === id);
    alert(`[${sw.name}] 다운로드를 시작합니다.\n(실제 환경에서는 파일 링크로 연결됩니다.)`);
}

document.addEventListener('DOMContentLoaded', init);
