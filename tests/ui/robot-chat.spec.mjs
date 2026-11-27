import {test,expect} from '@playwright/test';
const url='**/__preview/luna-chat';
const label="AI Chatbot Assistant";
const expected={"ko":["7kg 스카라 로봇 모델 라인업 알려줘.","0x282A 알람이 뭐야?","CAD 파일은 어디서 다운로드 받을 수 있어?"],"en":["What is the 7 kg SCARA robot lineup?","What does alarm 0x282A mean?","Where can I download CAD files?"],"zh-CN":["有哪些负载为 7 kg 的 SCARA 机器人型号？","0x282A 报警是什么意思？","在哪里可以下载 CAD 文件？"],"vi":["Có những mẫu robot SCARA tải trọng 7 kg nào?","Cảnh báo 0x282A có nghĩa là gì?","Tôi có thể tải tệp CAD ở đâu?"],"tr":["7 kg taşıma kapasiteli SCARA robot modelleri hangileri?","0x282A alarmı ne anlama geliyor?","CAD dosyalarını nereden indirebilirim?"],"ru":["Какие есть модели роботов SCARA с грузоподъёмностью 7 кг?","Что означает аварийный код 0x282A?","Где скачать файлы CAD?"]};
for(const lang of ["ko","en","zh-CN","vi","tr","ru"]){
 test('Luna dialog '+lang,async({page})=>{
  await page.addInitScript(l=>localStorage.setItem('inorobot.locale',l),lang);
  await page.setViewportSize({width:390,height:720});
  const posts=[];
  await page.route(url,async route=>{
   const r=route.request();
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST'};
   if(r.method()==='OPTIONS')return route.fulfill({status:204,headers});
   posts.push(r.postDataJSON());
   return route.fulfill({status:200,headers,json:{answer:'IR-S4 · 400 mm',sources:[{title:'Model',url:'https://inovancerobot.com/model'},{title:'Reject',url:'https://invalid.example/'}]}});
  });
  await page.goto('/0_Home/'+lang+'/');
  const launch=page.getByRole('button',{name:label,exact:true});
  await expect(launch.locator('.ino-chat-open-icon text')).toHaveText('AI');
  expect((await launch.locator('.ino-chat-open-icon').boundingBox()).width).toBeGreaterThanOrEqual(36);
  await launch.click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText(label,{exact:true})).toBeVisible();
  const suggestions=dialog.locator('.ino-chat-suggestion');
  await expect(suggestions).toHaveText(expected[lang]);
  await expect(dialog.locator('.ino-chat-disclaimer')).toHaveCount(0);
  const input=dialog.getByRole('textbox');
  const family=lang==='ko'?'Noto Sans KR':lang==='zh-CN'?'Noto Sans SC':'Noto Sans';
  const firstFamily=el=>getComputedStyle(el).fontFamily.split(',')[0].replaceAll(String.fromCharCode(34),'');
  for(const part of [dialog.locator('h2'),suggestions.first(),input])expect(await part.evaluate(firstFamily)).toBe(family);
  await suggestions.nth(1).click();
  await expect(input).toHaveValue(expected[lang][1]);
  await input.fill('4 kg SCARA CAD');
  await dialog.locator('button[type=submit]').click();
  await expect(dialog.getByText('IR-S4 · 400 mm')).toBeVisible();
  expect(await dialog.locator('.ino-chat-message.assistant').evaluate(firstFamily)).toBe(family);
  await expect(dialog.getByRole('link',{name:'Model'})).toHaveAttribute('href','https://inovancerobot.com/model');
  await expect(dialog.getByRole('link',{name:'Reject'})).toHaveCount(0);
  expect(posts[0]).toEqual({question:'4 kg SCARA CAD',previousQuestion:'',lang});
  await input.fill('400 mm?');
  await dialog.locator('button[type=submit]').click();
  await expect.poll(()=>posts.length).toBe(2);
  expect(posts[1].previousQuestion).toBe('4 kg SCARA CAD');
  const box=await dialog.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
 });
}
test('desktop chat resizes from its top-left grip and stays on screen',async({page})=>{
 await page.setViewportSize({width:1100,height:830});
 await page.goto('/0_Home/ko/');
 await page.getByRole('button',{name:label,exact:true}).click();
 const dialog=page.getByRole('dialog');
 const grip=dialog.locator('.ino-chat-resize');
 const initial=await dialog.boundingBox(), corner=await grip.boundingBox();
 const header=await dialog.locator('.ino-chat-head').boundingBox();
 const form=await dialog.locator('.ino-chat-form').boundingBox();
 expect(header.height).toBeLessThanOrEqual(48);
 expect(form.height).toBeLessThanOrEqual(58);
 await page.mouse.move(corner.x+10,corner.y+10);
 await page.mouse.down();
 await page.mouse.move(corner.x-100,corner.y-60,{steps:5});
 await page.mouse.up();
 const enlarged=await dialog.boundingBox();
 expect(enlarged.width).toBeGreaterThan(initial.width+90);
 expect(enlarged.height).toBeGreaterThan(initial.height+55);
 expect(enlarged.x+enlarged.width).toBeCloseTo(initial.x+initial.width,0);
 await grip.focus(); await page.keyboard.press('ArrowRight');
 const narrowed=await dialog.boundingBox();
 expect(narrowed.width).toBeCloseTo(enlarged.width-24,0);
 const lowerCorner=await grip.boundingBox();
 await page.mouse.move(lowerCorner.x+10,lowerCorner.y+10);
 await page.mouse.down();
 await page.mouse.move(lowerCorner.x+10,0,{steps:6});
 await page.mouse.up();
 const nav=await page.locator('#home-header').boundingBox();
 const maxed=await dialog.boundingBox();
 expect(maxed.y).toBeGreaterThanOrEqual(nav.y+nav.height+7);
 await page.keyboard.press('ArrowUp');
 expect((await dialog.boundingBox()).y).toBeGreaterThanOrEqual(nav.y+nav.height+7);

 await page.setViewportSize({width:360,height:640});
 await expect(grip).toBeHidden();
 const mobile=await dialog.boundingBox();
 const mobileNav=await page.locator('#home-header').boundingBox();
 expect(mobile.y).toBeGreaterThanOrEqual(mobileNav.y+mobileNav.height+7);
 expect(mobile.x).toBeGreaterThanOrEqual(0);
 expect(mobile.x+mobile.width).toBeLessThanOrEqual(360);
 await dialog.locator('.ino-chat-close').click();
 await expect(dialog).not.toBeVisible();
});

test('429 text separates request speed, site answer budget, and provider error',async({page})=>{
 const errors=[
  ['visitor_rate','요청이 너무 잦아요. 1분 정도 기다렸다가 다시 보내 주세요.'],
  ['site_ai_budget','이번 달 AI 답변 예산 한도에 도달했어요.'],
  ['provider_busy','AI 서버가 잠시 요청을 받지 못하고 있어요. 잠시 후 다시 시도해 주세요.'],
  ['limit','지금 답변할 수 없어요. 잠시 후 다시 시도해 주세요.']
 ];
 let count=0;
 await page.addInitScript(()=>localStorage.setItem('inorobot.locale','ko'));
 await page.route(url,route=>route.fulfill({status:429,json:{code:errors[count++][0]}}));
 await page.goto('/0_Home/ko/');
 await page.getByRole('button',{name:label,exact:true}).click();
 const dialog=page.getByRole('dialog');
 for(const [code,expected] of errors){
   await dialog.getByRole('textbox').fill(code);
   await dialog.locator('button[type=submit]').click();
   await expect(dialog.getByText(expected,{exact:true})).toBeVisible();
 }
 expect(count).toBe(4);
});
