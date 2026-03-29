const manualData = [
    // 1. SCARA Hardware
    {
        id: "scara_s_guide",
        title: "IR-S4&S7&S10 Series User Guide - Manipulator.pdf",
        robotType: "scara",
        category: "hardware",
        date: "2025-06-15",
        lang: "EN",
        path: "Hardware_manual/SCARA/IR-S4&S7&S10 Series User Guide - Manipulator.pdf",
        description: "User Guide"
    },
    {
        id: "scara_ts_guide",
        title: "IR-TS Series User Guide - Manipulator.pdf",
        robotType: "scara",
        category: "hardware",
        date: "2025-04-20",
        lang: "EN",
        path: "Hardware_manual/SCARA/IR-TS Series User Guide - Manipulator.pdf",
        description: "User Guide"
    },

    // 2. 6-Axis Hardware
    {
        id: "6axis_r4_guide",
        title: "IR-R4&R4H Series User Guide - Manipulator.pdf",
        robotType: "6axis",
        category: "hardware",
        date: "2025-08-10",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R4&R4H Series User Guide - Manipulator.pdf",
        description: "User Guide"
    },
    {
        id: "6axis_r7_guide",
        title: "IR-R7H Series User Guide - Manipulator.PDF",
        robotType: "6axis",
        category: "hardware",
        date: "2025-11-25",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R7H Series User Guide - Manipulator.PDF",
        description: "User Guide"
    },
    {
        id: "6axis_r10_r11_guide",
        title: "IR-R10-110&R10H&R11 Series User Guide - Manipulator.PDF",
        robotType: "6axis",
        category: "hardware",
        date: "2025-09-15",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R10-110&R10H&R11 Series User Guide - Manipulator.PDF",
        description: "User Guide"
    },
    {
        id: "6axis_r10_140_guide",
        title: "IR-R10-140 User Guide - Manipulator.pdf",
        robotType: "6axis",
        category: "hardware",
        date: "2025-03-12",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R10-140 User Guide - Manipulator.pdf",
        description: "User Guide"
    },
    {
        id: "6axis_r25_r16_guide",
        title: "IR-R25&R16 Series User Guide - Manipulator.pdf",
        robotType: "6axis",
        category: "hardware",
        date: "2026-01-30",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R25&R16 Series User Guide - Manipulator.pdf",
        description: "User Guide"
    },

    // 3. Controllers
    {
        id: "ctrl_501_guide",
        title: "IRCB501 User Guide.pdf",
        robotType: "controller",
        category: "hardware",
        date: "2025-12-05",
        lang: "EN",
        path: "Hardware_manual/Controller/IRCB501 User Guide.pdf",
        description: "User Guide"
    },
    {
        id: "ctrl_501_hp_guide",
        title: "IRCB501-High-Protection User Guide.pdf",
        robotType: "controller",
        category: "hardware",
        date: "2025-10-20",
        lang: "EN",
        path: "Hardware_manual/Controller/IRCB501-High-Protection User Guide.pdf",
        description: "User Guide"
    },

    // 4. Software & Operation
    {
        id: "lab_user_guide",
        title: "InoRobotLab User Guide.pdf",
        robotType: "none",
        category: "lab",
        date: "2026-03-15",
        lang: "EN",
        path: "Software_manual/InoRobotLab User Guide.pdf",
        description: "User Guide"
    },
    {
        id: "tp_user_guide",
        title: "Teach Pendant User Manual.pdf",
        robotType: "none",
        category: "pendant",
        date: "2026-02-28",
        lang: "EN",
        path: "Software_manual/Teach Pendant User Manual.pdf",
        description: "User Guide"
    },
    {
        id: "ins_guide",
        title: "Instructions Guide.pdf",
        robotType: "none",
        category: "api",
        date: "2025-12-10",
        lang: "EN",
        path: "Software_manual/Instructions Guide.pdf",
        description: "Instruction Guide"
    },
    {
        id: "api_guide",
        title: "Remote Ethernet Control Function User Guide.pdf",
        robotType: "none",
        category: ["api", "comm"],
        date: "2025-07-20",
        lang: "EN",
        path: "Software_manual/Remote Ethernet Control Function User Guide.pdf",
        description: "API Guide"
    },
    {
        id: "fieldbus_guide",
        title: "Remote IO Control Function User Guide.pdf",
        robotType: "none",
        category: "comm",
        date: "2025-08-05",
        lang: "EN",
        path: "Software_manual/Remote IO Control Function User Guide.pdf",
        description: "Fieldbus Guide"
    },

    // 5. Selection Guides
    {
        id: "sel_guide",
        title: "INOVANCE ROBOT Selection Guide.pdf",
        robotType: "none",
        category: "selection",
        date: "2025-11-20",
        lang: "EN",
        path: "Selection_manual/INOVANCE ROBOT Selection Guide.pdf",
        description: "Selection Guide"
    },
    {
        id: "sel_leaflet",
        title: "INOVANCE ROBOT Selection Leaflet.pdf",
        robotType: "none",
        category: "selection",
        date: "2025-10-15",
        lang: "EN",
        path: "Selection_manual/INOVANCE ROBOT Selection Leaflet.pdf",
        description: "Product Leaflet"
    },
    {
        id: "sel_leaflet_display",
        title: "INOVANCE ROBOT Selection Leaflet_Special Robot of Display.pdf",
        robotType: "none",
        category: "selection",
        date: "2026-02-10",
        lang: "EN",
        path: "Selection_manual/INOVANCE ROBOT Selection Leaflet_Special Robot of Display.pdf",
        description: "Special Robot Leaflet"
    },

    // 6. Education Material
    {
        id: "edu_intro_1",
        title: "1.로봇 소개(INT).pdf",
        robotType: "none",
        category: "entry",
        date: "2026-03-25",
        lang: "KR",
        path: "교육 자료/입문과정/1.로봇 소개(INT).pdf",
        description: "Education Item"
    },
    {
        id: "edu_intro_2",
        title: "2.로봇 기초(INT).pdf",
        robotType: "none",
        category: "entry",
        date: "2026-03-25",
        lang: "KR",
        path: "교육 자료/입문과정/2.로봇 기초(INT).pdf",
        description: "Education Item"
    },
    {
        id: "edu_intro_3",
        title: "3.로봇 구조 및 초기 배선(INT).pdf",
        robotType: "none",
        category: "entry",
        date: "2026-03-25",
        lang: "KR",
        path: "교육 자료/입문과정/3.로봇 구조 및 초기 배선(INT).pdf",
        description: "Education Item"
    },
    {
        id: "edu_intro_4",
        title: "4. 펜던트 기본 조작(INT).pdf",
        robotType: "none",
        category: "entry",
        date: "2026-03-25",
        lang: "KR",
        path: "교육 자료/입문과정/4. 펜던트 기본 조작(INT).pdf",
        description: "Education Item"
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

    const activeTypeBtn = document.querySelector('#typeFilters .active');
    const activeSoftwareBtn = document.querySelector('#catFilters .active');
    const activeEduBtn = document.querySelector('#eduFilters .active');

    const activeType = activeTypeBtn ? activeTypeBtn.dataset.type : 'all';
    const activeSoftware = activeSoftwareBtn ? activeSoftwareBtn.dataset.cat : 'all';
    const activeEdu = activeEduBtn ? activeEduBtn.dataset.cat : 'all';
    
    const searchTerm = document.getElementById('manualSearch').value.toLowerCase();

    const filtered = manualData.filter(man => {
        // Mutual Exclusivity
        if (activeType !== 'all') {
            if (man.robotType !== activeType) return false;
        }

        if (activeSoftware !== 'all') {
            if (Array.isArray(man.category)) {
                if (!man.category.includes(activeSoftware)) return false;
            } else {
                if (man.category !== activeSoftware) return false;
            }
        }

        if (activeEdu !== 'all') {
            if (Array.isArray(man.category)) {
                if (!man.category.includes(activeEdu)) return false;
            } else {
                if (man.category !== activeEdu) return false;
            }
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
        if (man.category.includes('selection')) { iconColor = "text-blue-500"; bgColor = "group-hover:bg-blue-500"; }
        if (man.category.includes('comm')) { iconColor = "text-amber-500"; bgColor = "group-hover:bg-amber-500"; }
        if (man.category.includes('pendant')) { iconColor = "text-indigo-500"; bgColor = "group-hover:bg-indigo-500"; }
        if (man.category.includes('api')) { iconColor = "text-rose-500"; bgColor = "group-hover:bg-rose-500"; }
        if (man.category.includes('entry') || man.category.includes('basic')) { iconColor = "text-fuchsia-500"; bgColor = "group-hover:bg-fuchsia-500"; }

        item.innerHTML = `
            <div class="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center ${iconColor} flex-shrink-0 ${bgColor} group-hover:text-white transition-all">
                <i data-lucide="file-text" class="w-7 h-7"></i>
            </div>
            
            <div class="flex-grow">
                <div class="flex flex-wrap items-center gap-2 mb-2">
                    <div class="flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-md border border-white/10">
                        <span class="text-[12px] font-bold text-slate-300 font-outfit tracking-tighter">${man.lang}</span>
                    </div>
                    <span class="text-[12px] font-bold text-slate-500 bg-white/5 px-2.5 py-1 rounded border border-white/5 font-outfit capitalize">${man.robotType === 'none' ? 'Common' : man.robotType}</span>
                    <span class="text-[11px] text-slate-600 ml-1 opacity-70">${man.date}</span>
                </div>
                <h3 class="text-lg font-bold text-white mb-1 group-hover:text-white transition-colors" style="word-break: break-all;">${man.title}</h3>
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
            parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const groupIds = ['typeFilters', 'catFilters', 'eduFilters'];
            groupIds.forEach(gid => {
                if (gid !== parent.id) {
                    const group = document.getElementById(gid);
                    if (group) {
                        group.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                        const allBtn = group.querySelector('[data-type="all"]') || group.querySelector('[data-cat="all"]');
                        if (allBtn) allBtn.classList.add('active');
                    }
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
