import {test,expect} from '@playwright/test';

const pages={home:'/0_Home/ko/',model:'/1_RobotModelSelect/',simulation:'/2_3DSimulation/',tool:'/3_ToolSelector/',project:'/4_ProjectGenerator/',software:'/5_Software/',document:'/6_Document/',debugging:'/7_DebuggingTool/',calibration:'/7_DebuggingTool/ZeroCalibration/',servo:'/Servo/',privacy:'/privacy/'};
for(const [name,route] of Object.entries(pages)){
 test(`화면 테마: ${name} 화면의 로고·언어 선택·모바일 배치`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(route,{waitUntil:'domcontentloaded'});
  const background = name === 'home' ? 'rgb(16, 21, 29)' : 'rgb(243, 244, 239)';
  await expect(page.locator('body')).toHaveCSS('background-color',background);
  await expect(page.locator('body > header').first()).toHaveCSS('background-color','rgb(250, 250, 246)');
  if(name === 'simulation'){
   await expect(page.locator('#model-browser-panel')).toHaveCSS('background-color','rgb(253, 254, 251)');
  }
  const logo=page.locator('body > header img').first();
  await expect(logo).toBeVisible();
  await expect.poll(()=>logo.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(page.locator('#inorobot-language-select')).toBeVisible();
  async function expectLogoPlacement(){
   const {x}=await logo.boundingBox();
   if(name==='home'){
    const grid=await page.locator('.tool-grid').boundingBox();
    expect(x).toBeCloseTo(grid.x,0);
   }else{
    expect(x).toBeLessThanOrEqual(40);
   }
  }
  await expectLogoPlacement();
  for(const width of [360,768,1920]){
   await page.setViewportSize({width,height:900});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: ${width}px`).toBe(true);
   await expect(page.locator('#inorobot-language-select')).toBeVisible();
   await expectLogoPlacement();
  }
  if(name === 'simulation'){
   await page.setViewportSize({width: 390, height: 844});
   await page.reload({waitUntil: 'domcontentloaded'});
   const tree = page.locator('#model-browser-panel');
   await expect(tree).toBeHidden();
   await page.locator('[data-panel-toggle="model-browser-panel"]').click();
   await expect(tree).toBeVisible();
   const panel = await tree.boundingBox();
   expect(panel.height).toBeLessThan(844 / 2);
  }
  if(name==='home'){
   await page.locator('[data-history-card="software"]').click();
   await expect(page.locator('.history-dialog')).toBeVisible();
  }
  expect(errors).toEqual([]);
 });
}

test('홈 공통 스타일은 모든 언어별 생성 페이지에서 제공된다',async({request})=>{
 for(const locale of ['ko','en','zh-CN','vi','tr','ru']){
  const response=await request.get(`/0_Home/${locale}/`);
  expect(response.ok()).toBe(true);
  const html=await response.text();
  expect(html).toContain('data-design-page="home"');
  expect(html).toContain('/shared/astryx-theme.css');
 }
});
