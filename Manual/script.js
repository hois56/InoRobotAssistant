const manualData = [
    {
        id: "scara_op_kr",
        title: "SCARA 로봇 모델 운영 매뉴얼 (KR)",
        robotType: "scara",
        category: "operation",
        version: "V2.2",
        date: "2026-02-10",
        format: "PDF",
        size: "18.5MB",
        description: "IR-S, IR-CS 시리즈 스카라 로봇의 기초 조작 및 프로그래밍 안내서입니다."
    },
    {
        id: "6axis_hw_kr",
        title: "6축 다관절 로봇 하드웨어 설치 가이드",
        robotType: "6axis",
        category: "hardware",
        version: "V1.8",
        date: "2026-03-05",
        format: "PDF",
        size: "24.2MB",
        description: "IR-R 시리즈 로봇의 기구부 설치, 배선 및 유지보수 지침을 포함합니다."
    },
    {
        id: "studio4_user_kr",
        title: "InoRobot Studio V4 사용자 매뉴얼",
        robotType: "controller",
        category: "operation",
        version: "V4.1",
        date: "2026-01-20",
        format: "PDF",
        size: "32.0MB",
        description: "스튜디오 소프트웨어의 주요 기능 및 고급 설정에 대한 상세 설명서입니다."
    },
    {
        id: "eth_comm_spec",
        title: "Ethernet/IP 통신 설정 사양서",
        robotType: "controller",
        category: "comm",
        version: "V1.0",
        date: "2025-12-15",
        format: "PDF",
        size: "8.4MB",
        description: "외부 PLC와의 Ethernet/IP 통신 매핑 및 설정 방법을 안내합니다."
    },
    {
        id: "modbus_tcp_spec",
        title: "Modbus TCP 통신 사양서",
        robotType: "controller",
        category: "comm",
        version: "V1.2",
        date: "2025-10-30",
        format: "PDF",
        size: "5.2MB",
        description: "Modbus TCP 프로토콜을 이용한 데이터 교환 상세 주소표입니다."
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
        const matchesType = (activeType === 'all' || man.robotType === activeType);
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
        item.innerHTML = `
            <div class="w-14 h-14 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 flex-shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                <i data-lucide="file-text" class="w-7 h-7"></i>
            </div>
            
            <div class="flex-grow">
                <div class="flex flex-wrap items-center gap-2 mb-2">
                    <span class="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase">${man.robotType}</span>
                    <span class="text-[10px] font-mono text-slate-500">Released: ${man.date}</span>
                </div>
                <h3 class="text-lg font-bold text-white mb-1 group-hover:text-emerald-400 transition-colors">${man.title}</h3>
                <p class="text-sm text-slate-400 line-clamp-2">${man.description}</p>
            </div>
            
            <div class="flex items-center gap-4 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6 shrink-0 w-full md:w-auto">
                <div class="text-right flex-grow md:flex-grow-0">
                    <span class="block text-xs font-bold text-slate-300">${man.format} | ${man.size}</span>
                    <span class="block text-[10px] text-slate-500">Ver ${man.version}</span>
                </div>
                <button onclick="handleDownload('${man.id}')" 
                        class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-emerald-600 text-white text-sm font-medium transition-all group-hover:shadow-lg group-hover:shadow-emerald-600/20">
                    <i data-lucide="eye" class="w-4 h-4 inline-block mr-1"></i> View
                </button>
            </div>
        `;
        list.appendChild(item);
    });

    if(window.lucide) lucide.createIcons();
}

function setupFilters() {
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const parent = btn.parentElement;
            parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderManuals();
        });
    });
}

function setupSearch() {
    const input = document.getElementById('manualSearch');
    input.addEventListener('input', renderManuals);
}

function handleDownload(id) {
    const man = manualData.find(m => m.id === id);
    alert(`[${man.title}] 매뉴얼 보기를 시작합니다.\n(실제 환경에서는 PDF URL로 연결됩니다.)`);
}

document.addEventListener('DOMContentLoaded', init);
