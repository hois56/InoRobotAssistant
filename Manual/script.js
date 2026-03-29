const manualData = [
    // 1. SCARA Hardware
    {
        id: "scara_s_guide",
        title: "IR-S4&S7&S10 Series User Guide - Manipulator",
        robotType: "scara",
        category: "hardware",
        date: "2025-06-15",
        path: "Hardware_manual/SCARA/IR-S4&S7&S10 Series User Guide - Manipulator.pdf",
        description: "IR-S 시리즈 스카라 로봇의 기구부 사양, 설치 및 유지보수 가이드입니다."
    },
    {
        id: "scara_ts_guide",
        title: "IR-TS Series User Guide - Manipulator",
        robotType: "scara",
        category: "hardware",
        date: "2025-04-20",
        path: "Hardware_manual/SCARA/IR-TS Series User Guide - Manipulator.pdf",
        description: "천장형 스카라 IR-TS 시리즈의 조작 및 하드웨어 가이드입니다."
    },

    // 2. 6-Axis Hardware
    {
        id: "6axis_r4_guide",
        title: "IR-R4&R4H Series User Guide - Manipulator",
        robotType: "6axis",
        category: "hardware",
        date: "2025-08-10",
        path: "Hardware_manual/6-axis/IR-R4&R4H Series User Guide - Manipulator.pdf",
        description: "소형 6축 로봇 IR-R4 시리즈의 기구부 상세 안내서입니다."
    },
    {
        id: "6axis_r7_guide",
        title: "IR-R7H Series User Guide - Manipulator",
        robotType: "6axis",
        category: "hardware",
        date: "2025-11-25",
        path: "Hardware_manual/6-axis/IR-R7H Series User Guide - Manipulator.PDF",
        description: "가반 하중 7kg급 6축 로봇 IR-R7H 모델의 하드웨어 매뉴얼입니다."
    },
    {
        id: "6axis_r10_r11_guide",
        title: "IR-R10-110&R10H&R11 Series User Guide - Manipulator",
        robotType: "6axis",
        category: "hardware",
        date: "2025-09-15",
        path: "Hardware_manual/6-axis/IR-R10-110&R10H&R11 Series User Guide - Manipulator.PDF",
        description: "중형 6축 로봇 라인업(R10, R11)의 기술 사양 및 조작 지침입니다."
    },
    {
        id: "6axis_r10_140_guide",
        title: "IR-R10-140 User Guide - Manipulator",
        robotType: "6axis",
        category: "hardware",
        date: "2025-03-12",
        path: "Hardware_manual/6-axis/IR-R10-140 User Guide - Manipulator.pdf",
        description: "실링 및 도장 특화 모델 IR-R10-140의 하드웨어 전용 가이드입니다."
    },
    {
        id: "6axis_r25_r16_guide",
        title: "IR-R25&R16 Series User Guide - Manipulator",
        robotType: "6axis",
        category: "hardware",
        date: "2026-01-30",
        path: "Hardware_manual/6-axis/IR-R25&R16 Series User Guide - Manipulator.pdf",
        description: "대형 6축 로봇 IR-R25 및 R16 시리즈의 설치 및 유지보수 지침입니다."
    },

    // 3. Controllers
    {
        id: "ctrl_501_guide",
        title: "IRCB501 User Guide",
        robotType: "controller",
        category: "hardware",
        date: "2025-12-05",
        path: "Hardware_manual/Controller/IRCB501 User Guide.pdf",
        description: "범용 로봇 컨트롤러 IRCB501의 하드웨어 구성 및 입출력 배선 가이드입니다."
    },
    {
        id: "ctrl_501_hp_guide",
        title: "IRCB501-High-Protection User Guide",
        robotType: "controller",
        category: "hardware",
        date: "2025-10-20",
        path: "Hardware_manual/Controller/IRCB501-High-Protection User Guide.pdf",
        description: "고방진/고방수(High-Protection) 버전 IRCB501 컨트롤러의 특수 사양 안내서입니다."
    },

    // 4. Software & Operation (Categorized as lab, pendant, comm, api, selection)
    {
        id: "lab_user_guide",
        title: "InoRobotLab User Guide",
        robotType: "all",
        category: "lab",
        date: "2026-03-15",
        path: "Software_manual/InoRobotLab User Guide.pdf",
        description: "PC 전용 프로그래밍 환경 InoRobotLab의 설정, 시뮬레이션 및 디버깅 방법입니다."
    },
    {
        id: "tp_user_guide",
        title: "Teach Pendant User Manual",
        robotType: "all",
        category: "pendant",
        date: "2026-02-28",
        path: "Software_manual/Teach Pendant User Manual.pdf",
        description: "티칭 펜던트를 이용한 실시간 로봇 조작, 포인트 기록 및 설정 메뉴 가이드입니다."
    },
    {
        id: "ins_guide",
        title: "Instructions Guide (Programming & API)",
        robotType: "all",
        category: "api",
        date: "2025-12-10",
        path: "Software_manual/Instructions Guide.pdf",
        description: "INOVANCE 로봇 프로그래밍을 위한 모든 명령어 시스템과 문법 설명서입니다."
    },
    {
        id: "eth_comm_guide",
        title: "Remote Ethernet Control Function User Guide",
        robotType: "controller",
        category: "comm",
        date: "2025-07-20",
        path: "Software_manual/Remote Ethernet Control Function User Guide.pdf",
        description: "Ethernet을 통한 원격 로봇 제어 및 데이터 통신 구현 가이드입니다."
    },
    {
        id: "io_comm_guide",
        title: "Remote IO Control Function User Guide",
        robotType: "controller",
        category: "comm",
        date: "2025-08-05",
        path: "Software_manual/Remote IO Control Function User Guide.pdf",
        description: "I/O 맵핑 및 Remote I/O를 활용한 로봇 제어 설정 안내서입니다."
    },

    // 5. Selection Guides
    {
        id: "sel_guide",
        title: "INOVANCE ROBOT Selection Guide",
        robotType: "all",
        category: "selection",
        date: "2025-11-20",
        path: "Selection_manual/INOVANCE ROBOT Selection Guide.pdf",
        description: "INOVANCE 로봇 전체 라인업의 성능 지표와 외형 도면을 포함한 선정 가이드입니다."
    },
    {
        id: "sel_leaflet",
        title: "INOVANCE ROBOT Selection Leaflet",
        robotType: "all",
        category: "selection",
        date: "2025-10-15",
        path: "Selection_manual/INOVANCE ROBOT Selection Leaflet.pdf",
        description: "주요 사양을 요약한 한 페이지 리플렛 형태의 제품 안내서입니다."
    },
    {
        id: "sel_leaflet_display",
        title: "INOVANCE ROBOT Selection Leaflet - Display Special Robot",
        robotType: "all",
        category: "selection",
        date: "2026-02-10",
        path: "Selection_manual/INOVANCE ROBOT Selection Leaflet_Special Robot of Display.pdf",
        description: "디스플레이 산업 맞춤형 특수 로봇 선정 및 스펙 가이드입니다."
    }
];

function init() {
    renderManuals();
    setupFilters();
    setupSearch();
    if(window.lucide) lucide.createIcons();
}

function renderManuals() {
    const list = document.getElementById('manualList');
    list.innerHTML = '';

    const activeType = document.querySelector('#typeFilters .active').dataset.type;
    const activeCat = document.querySelector('#catFilters .active').dataset.cat;
    const searchTerm = document.getElementById('manualSearch').value.toLowerCase();

    const filtered = manualData.filter(man => {
        // Hardware Manual Filter (robotType)
        const matchesType = (activeType === 'all' || man.robotType === activeType || man.robotType === 'all');
        // Software Manual Filter (category)
        const matchesCat = (activeCat === 'all' || man.category === activeCat);
        
        const matchesSearch = man.title.toLowerCase().includes(searchTerm) || 
                             man.description.toLowerCase().includes(searchTerm);
        return matchesType && matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="py-20 text-center text-slate-500">
                <i data-lucide="file-x" class="w-12 h-12 mx-auto mb-4 opacity-20"></i>
                <p>매뉴얼을 찾을 수 없습니다.</p>
            </div>
        `;
        if(window.lucide) lucide.createIcons();
        return;
    }

    filtered.forEach(man => {
        const item = document.createElement('div');
        item.className = 'manual-item p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center gap-6 group';
        
        let iconColor = "text-emerald-500";
        let bgColor = "group-hover:bg-emerald-500";
        if (man.category === 'selection') { iconColor = "text-blue-500"; bgColor = "group-hover:bg-blue-500"; }
        if (man.category === 'comm') { iconColor = "text-amber-500"; bgColor = "group-hover:bg-amber-500"; }
        if (man.category === 'pendant') { iconColor = "text-indigo-500"; bgColor = "group-hover:bg-indigo-500"; }
        if (man.category === 'api') { iconColor = "text-rose-500"; bgColor = "group-hover:bg-rose-500"; }

        item.innerHTML = `
            <div class="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center ${iconColor} flex-shrink-0 ${bgColor} group-hover:text-white transition-all">
                <i data-lucide="file-text" class="w-7 h-7"></i>
            </div>
            
            <div class="flex-grow">
                <div class="flex flex-wrap items-center gap-2 mb-2">
                    <span class="text-[10px] font-mono font-bold text-slate-500 bg-white/5 px-2 py-0.5 rounded border border-white/5 uppercase">${man.robotType === 'all' ? 'Universal' : man.robotType}</span>
                    <span class="text-[10px] font-mono text-slate-600">Released: ${man.date}</span>
                </div>
                <h3 class="text-lg font-bold text-white mb-1 group-hover:text-white transition-colors">${man.title}</h3>
                <p class="text-sm text-slate-400 line-clamp-2">${man.description}</p>
            </div>
            
            <div class="flex items-center gap-2 pt-4 md:pt-0 shrink-0 w-full md:w-auto">
                <div class="flex gap-2 ml-auto">
                    <button onclick="handleView('${man.id}')" 
                            class="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-white text-xs font-bold transition-all flex items-center gap-2 min-w-[100px] justify-center">
                        <i data-lucide="eye" class="w-4 h-4"></i> View
                    </button>
                    <button onclick="handleDownload('${man.id}')" 
                            class="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-blue-600 text-white text-xs font-bold transition-all flex items-center gap-2 min-w-[100px] justify-center">
                        <i data-lucide="download" class="w-4 h-4"></i> Download
                    </button>
                </div>
            </div>
        `;
        list.appendChild(item);
    });

    if(window.lucide) lucide.createIcons();
}

function setupFilters() {
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const parent = btn.parentElement;
            const otherParentId = (parent.id === 'typeFilters') ? 'catFilters' : 'typeFilters';
            const otherParent = document.getElementById(otherParentId);

            // Same group: Activate clicked button and deactivate others
            parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Mutual Exclusivity: If a specific filter is chosen in one group, reset the other group to 'all'
            // We also do this even if 'all' is clicked in the current group, to maintain high exclusivity if desired.
            // Or only if it's NOT 'all'. Let's do it if it's a specific filter:
            const isAll = (btn.dataset.type === 'all' || btn.dataset.cat === 'all');
            
            // Any click in one group resets the other group to "all" (Mutual Exclusivity)
            // This ensures we are viewing EITHER Hardware Manuals OR Software Manuals.
            if (otherParent) {
                otherParent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                const allBtn = otherParent.querySelector('[data-type="all"]') || otherParent.querySelector('[data-cat="all"]');
                if (allBtn) allBtn.classList.add('active');
            }

            renderManuals();
        });
    });
}

function setupSearch() {
    const input = document.getElementById('manualSearch');
    input.addEventListener('input', renderManuals);
}

function handleView(id) {
    const man = manualData.find(m => m.id === id);
    if (man && man.path) {
        window.open(man.path, '_blank');
    }
}

function handleDownload(id) {
    const man = manualData.find(m => m.id === id);
    if (man && man.path) {
        const link = document.createElement('a');
        link.href = man.path;
        link.download = man.path.split('/').pop();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

document.addEventListener('DOMContentLoaded', init);
