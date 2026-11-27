(() => {
  'use strict';
  const localPreview=location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname);
  const endpoint=localPreview?'/__preview/luna-chat':'https://inorobot-web-assistant.hois56.workers.dev/v1/chat';
  const chatName='AI Chatbot Assistant';
  const words={
    ko:['로봇 모델, CAD, 매뉴얼 등을 물어보세요.','질문 보내기','닫기','자료를 확인하고 있어요…','지금 답변할 수 없어요. 잠시 후 다시 시도해 주세요.','AI 사용량 한도에 도달했어요. 나중에 다시 시도해 주세요.','참고 자료'],
    en:['Ask about robot models, CAD or manuals.','Send','Close','Checking sources…','The assistant is unavailable. Please try again later.','The AI usage limit has been reached. Try again later.','Sources'],
    'zh-CN':['可询问机器人型号、CAD 图纸或手册。','发送','关闭','正在查找资料…','暂时无法回答，请稍后重试。','已达到 AI 使用上限，请稍后重试。','参考资料'],
    vi:['Hỏi về mẫu robot, bản vẽ CAD hoặc tài liệu.','Gửi','Đóng','Đang kiểm tra tài liệu…','Hiện không thể trả lời. Vui lòng thử lại sau.','Đã đạt giới hạn sử dụng AI. Hãy thử lại sau.','Nguồn'],
    tr:['Robot modelleri, CAD çizimleri veya kılavuzları sorun.','Gönder','Kapat','Kaynaklar kontrol ediliyor…','Şu anda yanıt verilemiyor. Lütfen daha sonra tekrar deneyin.','AI kullanım sınırına ulaşıldı. Daha sonra tekrar deneyin.','Kaynaklar'],
    ru:['Спросите о моделях, CAD или руководствах.','Отправить','Закрыть','Проверяем источники…','Сервис недоступен. Попробуйте позже.','Лимит использования ИИ исчерпан. Попробуйте позже.','Источники']
  };
  const rateMessages={
    ko:['요청이 너무 잦아요. 1분 정도 기다렸다가 다시 보내 주세요.','이번 달 AI 답변 예산 한도에 도달했어요.','AI 서버가 잠시 요청을 받지 못하고 있어요. 잠시 후 다시 시도해 주세요.'],
    en:['Too many requests. Please wait about a minute and try again.','The monthly AI answer budget has been reached.','The AI provider is temporarily unavailable. Please try again later.'],
    'zh-CN':['请求过于频繁，请约一分钟后重试。','已达到本站每月的 AI 回答预算上限。','AI 服务暂时无法接收请求，请稍后重试。'],
    vi:['Bạn gửi quá nhiều yêu cầu. Hãy đợi khoảng một phút rồi thử lại.','Đã đạt giới hạn ngân sách trả lời AI tháng này.','Dịch vụ AI tạm thời không nhận yêu cầu. Hãy thử lại sau.'],
    tr:['Çok fazla istek gönderdiniz. Yaklaşık bir dakika bekleyip tekrar deneyin.','Bu ayın AI yanıt bütçesi sınırına ulaşıldı.','AI hizmeti geçici olarak istek alamıyor. Lütfen sonra tekrar deneyin.'],
    ru:['Слишком много запросов. Подождите около минуты и попробуйте снова.','Достигнут месячный лимит бюджета на ответы ИИ.','Сервис ИИ временно не принимает запросы. Попробуйте позже.']
  };
  const rateCodes=['visitor_rate','site_ai_budget','provider_busy'];
  const locale=()=>{
    const l=document.documentElement.lang;
    return /^zh/i.test(l)?'zh-CN':/^kr/i.test(l)?'ko':(l||'en').split('-')[0];
  };
  const el=(tag,parent,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;parent.append(n);return n;};
  const icons={
    chat:'M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 2v-4.4A7.5 7.5 0 0 1 9.5 4h3a7.5 7.5 0 0 1 7.5 7.5ZM8 11.5h8M8 15h5',
    launcher:'M21 11.2a7.4 7.4 0 0 1-7.4 7.4H8.2L3.1 21v-6A7.4 7.4 0 0 1 9.5 3.8h4.1a7.4 7.4 0 0 1 7.4 7.4Z',
    close:'m6 6 12 12M18 6 6 18',
    send:'M12 19V5m-6 6 6-6 6 6'
  };
  function icon(parent,name,cls){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),p=document.createElementNS(ns,'path');
    if(cls)svg.setAttribute('class',cls);
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    p.setAttribute('d',icons[name]);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');
    p.setAttribute('stroke-width','1.8');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');
    svg.append(p);parent.append(svg);
  }
  const button=el('button',document.body,'ino-chat-launch');
  button.type='button';button.setAttribute('data-i18n-skip','');
  button.setAttribute('aria-controls','ino-chat-panel');button.setAttribute('aria-expanded','false');
  icon(button,'launcher','ino-chat-open-icon');icon(button,'close','ino-chat-hide-icon');
  const launchMark=button.querySelector('.ino-chat-open-icon');
  const aiMark=document.createElementNS('http://www.w3.org/2000/svg','text');
  aiMark.setAttribute('x','12');
  aiMark.setAttribute('y','14.7');
  aiMark.setAttribute('text-anchor','middle');
  aiMark.setAttribute('fill','currentColor');
  aiMark.setAttribute('font-size','8.8');
  aiMark.setAttribute('font-weight','800');
  aiMark.textContent='AI';
  launchMark.append(aiMark);

  const dialog=el('dialog',document.body,'ino-chat');
  dialog.id='ino-chat-panel';dialog.setAttribute('data-i18n-skip','');
  dialog.setAttribute('aria-labelledby','ino-chat-title');
  const siteHeader=document.getElementById('home-header');
  let headerBottom=-1;
  const syncHeaderClearance=()=>{
    const bottom=Math.max(0,Math.ceil(siteHeader?.getBoundingClientRect().bottom||0));
    if(bottom===headerBottom)return;
    headerBottom=bottom;
    dialog.style.setProperty('--chat-top-clearance',(bottom+8)+'px');
  };
  if(siteHeader){
    new ResizeObserver(syncHeaderClearance).observe(siteHeader);
    window.addEventListener('scroll',()=>{if(dialog.open)syncHeaderClearance();},{passive:true});
    window.addEventListener('resize',syncHeaderClearance,{passive:true});
  }

  const head=el('header',dialog,'ino-chat-head');
  icon(el('span',head,'ino-chat-badge'),'chat');
  const title=el('h2',head);
  title.id='ino-chat-title';
  const close=el('button',head,'ino-chat-close'); close.type='button';icon(close,'close');
  const log=el('div',dialog,'ino-chat-log');log.setAttribute('role','log');
  const welcome=el('div',log,'ino-chat-welcome');icon(el('span',welcome,'ino-chat-welcome-mark'),'chat');
  const welcomeText=el('p',welcome);
  const suggestions=el('div',welcome,'ino-chat-suggestions');
  const examples={"ko":["7kg 스카라 로봇 모델 라인업 알려줘.","0x282A 알람이 뭐야?","CAD 파일은 어디서 다운로드 받을 수 있어?"],"en":["What is the 7 kg SCARA robot lineup?","What does alarm 0x282A mean?","Where can I download CAD files?"],"zh-CN":["有哪些负载为 7 kg 的 SCARA 机器人型号？","0x282A 报警是什么意思？","在哪里可以下载 CAD 文件？"],"vi":["Có những mẫu robot SCARA tải trọng 7 kg nào?","Cảnh báo 0x282A có nghĩa là gì?","Tôi có thể tải tệp CAD ở đâu?"],"tr":["7 kg taşıma kapasiteli SCARA robot modelleri hangileri?","0x282A alarmı ne anlama geliyor?","CAD dosyalarını nereden indirebilirim?"],"ru":["Какие есть модели роботов SCARA с грузоподъёмностью 7 кг?","Что означает аварийный код 0x282A?","Где скачать файлы CAD?"]};
  const chips=Array.from({length:3},()=>{const chip=el('button',suggestions,'ino-chat-suggestion');chip.type='button';chip.addEventListener('click',()=>{input.value=chip.textContent;updateInput();input.focus();});return chip;});
  const form=el('form',dialog,'ino-chat-form');
  const status=el('p',form,'ino-chat-status');status.setAttribute('role','status');
  const row=el('div',form,'ino-chat-row');
  const input=el('textarea',row);input.rows=2;input.required=true;input.maxLength=650;
  const submit=el('button',row,'ino-chat-send');submit.type='submit';icon(submit,'send');

  const resize=el('button',dialog,'ino-chat-resize');
  resize.type='button';
  const resizeLabels={ko:'채팅창 크기 조절',en:'Resize chat window','zh-CN':'调整聊天窗口大小',vi:'Đổi kích thước cửa sổ trò chuyện',tr:'Sohbet penceresini boyutlandır',ru:'Изменить размер окна чата'};
  let drag;
  const resizeTo=(width,height)=>{
    dialog.style.setProperty('--chat-width',Math.max(0,width)+'px');
    dialog.style.setProperty('--chat-height',Math.max(0,height)+'px');
  };
  resize.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0)return;
    const box=dialog.getBoundingClientRect();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,width:box.width,height:box.height};
    resize.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  resize.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId)return;
    resizeTo(drag.width+drag.x-event.clientX,drag.height+drag.y-event.clientY);
  });
  const finishResize=event=>{
    if(drag?.id!==event.pointerId)return;
    const box=dialog.getBoundingClientRect();
    resizeTo(box.width,box.height);
    drag=undefined;
  };
  resize.addEventListener('pointerup',finishResize);
  resize.addEventListener('pointercancel',finishResize);
  resize.addEventListener('lostpointercapture',finishResize);
  resize.addEventListener('keydown',event=>{
    const delta={ArrowLeft:[1,0],ArrowRight:[-1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
    if(!delta)return;
    event.preventDefault();
    const box=dialog.getBoundingClientRect();
    resizeTo(box.width+24*delta[0],box.height+24*delta[1]);
  });
  let previous='',loading=false;
  const labels=()=>words[locale()]||words.en;
  const i18n=()=>{
    const w=labels();
    title.textContent=chatName;welcomeText.textContent=w[0];
    (examples[locale()]||examples.en).forEach((example,i)=>{chips[i].textContent=example;});
    button.title=chatName;button.setAttribute('aria-label',chatName);
    const prompts={"ko":"질문을 입력하세요","en":"Type your question","zh-CN":"请输入问题","vi":"Nhập câu hỏi","tr":"Sorunuzu yazın","ru":"Введите вопрос"};
    input.placeholder=prompts[locale()]||prompts.en;input.setAttribute('aria-label',input.placeholder);
    submit.title=w[1];submit.setAttribute('aria-label',w[1]);close.setAttribute('aria-label',w[2]);resize.setAttribute('aria-label',resizeLabels[locale()]||resizeLabels.en);resize.title=resize.getAttribute('aria-label');
  };
  new MutationObserver(i18n).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  i18n();
  button.addEventListener('click',()=>{
    if(dialog.open){dialog.close();return;}
    syncHeaderClearance();dialog.show();button.setAttribute('aria-expanded','true');
    if(matchMedia('(pointer:fine)').matches)input.focus();
  });
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{button.setAttribute('aria-expanded','false');button.focus();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dialog.open){event.preventDefault();dialog.close();}});
  const updateInput=()=>{input.style.height='32px';input.style.height=Math.min(100,Math.max(32,input.scrollHeight))+'px';submit.disabled=loading||!input.value.trim();};
  input.addEventListener('input',updateInput);updateInput();
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229&&matchMedia('(pointer:fine)').matches){event.preventDefault();if(!submit.disabled)form.requestSubmit();}
  });
  function message(content,side){
    const p=el('div',log,'ino-chat-message '+side);
    if(side==='assistant'){
      for(const [i,part] of content.split(/\*\*([^*\n]+)\*\*/g).entries()){
        if(i%2)el('strong',p).textContent=part;else p.append(document.createTextNode(part));
      }
    }else p.textContent=content;
    while(log.children.length>24)log.firstElementChild.remove();
    log.scrollTop=log.scrollHeight;
    return p;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const question=input.value.trim();
    if(!question||loading)return;
    const w=labels();
    input.value='';loading=true;updateInput();welcome.remove();
    message(question,'user');status.textContent=w[3];
    try {
      const resp=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,previousQuestion:previous,lang:locale()}),signal:AbortSignal.timeout(22000)});
      if(!resp.ok){
        const error=resp.status===429?await resp.json().catch(()=>null):null;
        const ix=rateCodes.indexOf(error?.code);
        message((rateMessages[locale()]||rateMessages.en)[ix]||w[4],'assistant');
        return;
      }
      const payload=await resp.json();
      if(typeof payload.answer!=='string'||!payload.answer.trim())throw Error();
      const reply=message(payload.answer,'assistant');
      if(Array.isArray(payload.sources)&&payload.sources.length){
        const officialContacts=["https://www.inovance.com/global/index.html","https://www.inovance.com/global/contact-us/index.html","https://www.inovance.com/global/support/download-documentation.html","https://www.inovance.com/global/about/index.html","https://www.inovance.com/global/product/overview.html?fid=100056&isxl=1&pid=0","https://www.inovance.com/global/content/details_816_556034.html","https://www.inovance.com/global/content/details_816_555596.html","https://www.inovance.com/global/contact-us/form.html","https://www.inovance.com/global/support/tech-support.html"];
        const uiLabels={"ko":["관련 페이지","툴 선택기 열기","모드 D 바로 열기"],"en":["Related pages","Open Tool Selector","Open Mode D"],"zh-CN":["相关页面","打开工具选型器","打开模式 D"],"vi":["Trang liên quan","Mở công cụ chọn tải","Mở chế độ D"],"tr":["İlgili sayfalar","Takım seçiciyi aç","D modunu aç"],"ru":["Связанные страницы","Открыть подбор инструмента","Открыть режим D"]};
        const nav=uiLabels[locale()]||uiLabels.en;
        const groups=[[],[]];
        for(const source of payload.sources.slice(0,5)){
          let link;try{link=new URL(source.url);}catch{continue;}
          if(link.username||link.password||(link.origin!=='https://inovancerobot.com'&&!officialContacts.includes(link.href)))continue;
          const toolLanding=link.origin==='https://inovancerobot.com'&&/^\/3_ToolSelector\/?(?:index\.html)?$/i.test(link.pathname)&&!link.hash&&!link.search;
          const navigation=toolLanding||source.kind==='navigation'||officialContacts.includes(link.href);
          let title=String(source.title||link.pathname);
          if(toolLanding){
            const cad=/(?:\bmode[\s-]*d\b|\uBAA8\uB4DC\s*d\b|\bSTEP\s*CAD\b|\bSTEP\b.*\uBB3C\uC131)/iu.test(question+'\n'+payload.answer);
            title=nav[cad?2:1];
            link=new URL('/3_ToolSelector/'+(cad?'?mode=cad':''),/^https:\/\/inovancerobot\.com$/.test(location.origin)?location.origin:([ 'localhost','127.0.0.1' ].includes(location.hostname)?location.origin:'https://inovancerobot.com'));
          }
          groups[navigation?1:0].push({title,url:link.href});
        }
        for(const [i,links] of groups.entries()){
          if(!links.length)continue;
          const heading=el('strong',reply,'ino-chat-sources');heading.textContent=i?nav[0]:w[6];
          const list=el('ul',reply);
          for(const link of links){
            const a=el('a',el('li',list));a.href=link.url;a.textContent=link.title;
            a.target='_blank';a.rel='noopener noreferrer';
          }
        }
      }
      previous=question.slice(0,450);
    }catch{message(w[4],'assistant');}
    finally{loading=false;updateInput();status.textContent='';log.scrollTop=log.scrollHeight;if(dialog.open&&matchMedia('(pointer:fine)').matches&&document.activeElement===submit)input.focus();}
  });
})();