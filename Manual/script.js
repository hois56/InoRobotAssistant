const manualData = [
    // 1. SCARA Hardware
    {
        id: "scara_s_guide",
        title: "IR-S 시리즈 하드웨어 매뉴얼",
        robotType: "scara",
        category: "hardware",
        date: "2025-06-15",
        lang: "EN",
        path: "Hardware_manual/SCARA/IR-S4&S7&S10 Series User Guide - Manipulator.pdf",
        description: "SCARA 로봇 입문 및 하드웨어 가이드"
    },
    {
        id: "scara_ts_guide",
        title: "IR-TS 시리즈 하드웨어 매뉴얼",
        robotType: "scara",
        category: "hardware",
        date: "2025-04-20",
        lang: "EN",
        path: "Hardware_manual/SCARA/IR-TS Series User Guide - Manipulator.pdf",
        description: "천장형 SCARA 로봇 하드웨어 가이드"
    },

    // 2. 6-Axis Hardware
    {
        id: "6axis_r4_guide",
        title: "IR-R4 시리즈 하드웨어 매뉴얼",
        robotType: "6axis",
        category: "hardware",
        date: "2025-08-10",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R4&R4H Series User Guide - Manipulator.pdf",
        description: "6축 소형 로봇 하드웨어 가이드"
    },
    {
        id: "6axis_r7_guide",
        title: "IR-R7H 하드웨어 매뉴얼",
        robotType: "6axis",
        category: "hardware",
        date: "2025-11-25",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R7H Series User Guide - Manipulator.PDF",
        description: "IR-R7H 로봇 하드웨어 가이드"
    },
    {
        id: "6axis_r10_r11_guide",
        title: "IR-R10 / R11 하드웨어 매뉴얼",
        robotType: "6axis",
        category: "hardware",
        date: "2025-09-15",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R10-110&R10H&R11 Series User Guide - Manipulator.PDF",
        description: "6축 중형 로봇 하드웨어 가이드"
    },
    {
        id: "6axis_r10_140_guide",
        title: "IR-R10-140 하드웨어 매뉴얼",
        robotType: "6axis",
        category: "hardware",
        date: "2025-03-12",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R10-140 User Guide - Manipulator.pdf",
        description: "IR-R10-140 로봇 하드웨어 가이드"
    },
    {
        id: "6axis_r25_r16_guide",
        title: "IR-R25 / R16 하드웨어 매뉴얼",
        robotType: "6axis",
        category: "hardware",
        date: "2026-01-30",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R25&R16 Series User Guide - Manipulator.pdf",
        description: "6축 대형 로봇 하드웨어 가이드"
    },

    // 3. Controllers
    {
        id: "ctrl_501_guide",
        title: "IRCB501 컨트롤러 매뉴얼",
        robotType: "controller",
        category: "hardware",
        date: "2025-12-05",
        lang: "EN",
        path: "Hardware_manual/Controller/IRCB501 User Guide.pdf",
        description: "범용 컨트롤러 하드웨어 가이드"
    },
    {
        id: "ctrl_501_hp_guide",
        title: "IRCB501 HP 컨트롤러 매뉴얼",
        robotType: "controller",
        category: "hardware",
        date: "2025-10-20",
        lang: "EN",
        path: "Hardware_manual/Controller/IRCB501-High-Protection User Guide.pdf",
        description: "고방진/고방수 컨트롤러 매뉴얼"
    },

    // 4. Software & Operation
    {
        id: "lab_user_guide",
        title: "InoRobotLab 유저 가이드",
        robotType: "none",
        category: "lab",
        date: "2026-03-15",
        lang: "EN",
        path: "Software_manual/InoRobotLab User Guide.pdf",
        description: "InoRobotLab 소프트웨어 설명서"
    },
    {
        id: "tp_user_guide",
        title: "펜던트 유저 가이드",
        robotType: "none",
        category: "pendant",
        date: "2026-02-28",
        lang: "EN",
        path: "Software_manual/Teach Pendant User Manual.pdf",
        description: "티칭 펜던트 조작 설명서"
    },
    {
        id: "ins_guide",
        title: "명령어 가이드",
        robotType: "none",
        category: "api",
        date: "2025-12-10",
        lang: "EN",
        path: "Software_manual/Instructions Guide.pdf",
        description: "로봇 프로그램 명령어 가이드"
    },
    {
        id: "eth_comm_guide",
        title: "Ethernet 통신 가이드",
        robotType: "none",
        category: "comm",
        date: "2025-07-20",
        lang: "EN",
        path: "Software_manual/Remote Ethernet Control Function User Guide.pdf",
        description: "에더넷 통신 제어 가이드"
    },
    {
        id: "io_comm_guide",
        title: "IO 제어 가이드",
        robotType: "none",
        category: "comm",
        date: "2025-08-05",
        lang: "EN",
        path: "Software_manual/Remote IO Control Function User Guide.pdf",
        description: "IO 제어 및 맵핑 가이드"
    },

    // 5. Selection Guides
    {
        id: "sel_guide",
        title: "로봇 선정 가이드",
        robotType: "none",
        category: "selection",
        date: "2025-11-20",
        lang: "EN",
        path: "Selection_manual/INOVANCE ROBOT Selection Guide.pdf",
        description: "전체 모델 선정 가이드"
    },
    {
        id: "sel_leaflet",
        title: "선정 리플렛",
        robotType: "none",
        category: "selection",
        date: "2025-10-15",
        lang: "EN",
        path: "Selection_manual/INOVANCE ROBOT Selection Leaflet.pdf",
        description: "제품 스펙 요약 리플렛"
    },
    {
        id: "sel_leaflet_display",
        title: "특수 로봇 리플렛",
        robotType: "none",
        category: "selection",
        date: "2026-02-10",
        lang: "EN",
        path: "Selection_manual/INOVANCE ROBOT Selection Leaflet_Special Robot of Display.pdf",
        description: "Display 공정용 특수 로봇 리플렛"
    },

    // 6. Education Material
    {
        id: "edu_intro_1",
        title: "로봇 소개 (입문)",
        robotType: "none",
        category: "entry",
        date: "2026-03-25",
        lang: "EN",
        path: "교육 자료/입문과정/1.로봇 소개(INT).pdf",
        description: "입문 과정 로봇 소개"
    },
    {
        id: "edu_intro_2",
        title: "로봇 기초 (입문)",
        robotType: "none",
        category: "entry",
        date: "2026-03-25",
        lang: "EN",
        path: "교육 자료/입문과정/2.로봇 기초(INT).pdf",
        description: "입문 과정 로봇 기초 가이드"
    },
    {
        id: "edu_intro_3",
        title: "로봇 구조 및 초기 배선 (입문)",
        robotType: "none",
        category: "entry",
        date: "2026-03-25",
        lang: "EN",
        path: "교육 자료/입문과정/3.로봇 구조 및 초기 배선(INT).pdf",
        description: "입문 과정 초기 배선 가이드"
    },
    {
        id: "edu_intro_4",
        title: "펜던트 기본 조작 (입문)",
        robotType: "none",
        category: "entry",
        date: "2026-03-25",
        lang: "EN",
        path: "교육 자료/입문과정/4. 펜던트 기본 조작(INT).pdf",
        description: "입문 과정 펜던트 조작 가이드"
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
    // We check both catFilters and eduFilters
    const activeCatBtn = document.querySelector('#catFilters .active') || document.querySelector('#eduFilters .active');
    const activeCat = activeCatBtn ? activeCatBtn.dataset.cat : 'all';
    
    const searchTerm = document.getElementById('manualSearch').value.toLowerCase();

    const filtered = manualData.filter(man => {
        // Hardware filter mutual exclusivity
        if (activeType !== 'all') {
            if (activeType !== man.robotType) return false;
        }

        // Software/Edu filter mutual exclusivity
        if (activeCat !== 'all') {
            if (activeCat !== man.category) return false;
        }

        const matchesSearch = man.title.toLowerCase().includes(searchTerm) || 
                             man.description.toLowerCase().includes(searchTerm);
        return matchesSearch;
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
        if (man.category === 'entry' || man.category === 'basic') { iconColor = "text-fuchsia-500"; bgColor = "group-hover:bg-fuchsia-500"; }

        item.innerHTML = `
            <div class="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center ${iconColor} flex-shrink-0 ${bgColor} group-hover:text-white transition-all">
                <i data-lucide="file-text" class="w-7 h-7"></i>
            </div>
            
            <div class="flex-grow">
                <div class="flex flex-wrap items-center gap-2 mb-2">
                    <div class="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                        <span class="text-[9px] font-bold text-slate-300 font-mono">${man.lang}</span>
                    </div>
                    <span class="text-[10px] font-mono font-bold text-slate-500 bg-white/5 px-2 py-0.5 rounded border border-white/5 uppercase">${man.robotType === 'none' ? 'Common' : man.robotType}</span>
                    <span class="text-[10px] font-mono text-slate-600">${man.date}</span>
                </div>
                <h3 class="text-lg font-bold text-white mb-1 group-hover:text-white transition-colors">${man.title}</h3>
                <p class="text-xs text-slate-500 line-clamp-2 italic">${man.description}</p>
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
            
            // Unset all buttons in all groups first for mutual exclusivity
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            
            // Set clicked button to active
            btn.classList.add('active');

            // Find other groups and reset to "all" if necessary
            // In our case, if any group is clicked, the OTHER groups must have their "all" selected (or just one "all" across all non-hardware?)
            // The request was: Hardware, Software, Edu are all mutually exclusive.
            
            const groupIds = ['typeFilters', 'catFilters', 'eduFilters'];
            groupIds.forEach(gid => {
                const group = document.getElementById(gid);
                if (group !== parent) {
                    const allBtn = group.querySelector('[data-type="all"]') || group.querySelector('[data-cat="all"]');
                    if (allBtn) allBtn.classList.add('active');
                }
            });

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
