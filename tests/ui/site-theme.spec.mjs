import {test,expect} from '@playwright/test';

const languageNames = ['Korean', 'English', 'Chinese (Simplified)', 'Vietnamese', 'Turkish', 'Russian'];
const pages={home:'/0_Home/ko/',model:'/1_RobotModelSelect/',simulation:'/2_3DSimulation/',tool:'/3_ToolSelector/',project:'/4_ProjectGenerator/',software:'/5_Software/',document:'/6_Document/',debugging:'/7_DebuggingTool/',calibration:'/7_DebuggingTool/ZeroCalibration/',servo:'/Servo/',privacy:'/privacy/'};

for (const [name, route, selector] of [
 ['로봇 모델 필터', pages.model, '.filter-option[data-filter-id="Payload(kg)"][data-option-id="10"]'],
 ['도구 모드 탭', pages.tool, '[role="tab"][data-mode="calc"]'],
 ['소프트웨어 필터', pages.software, '.filter-btn[data-type="InoRobotTP"]'],
 ['문서 필터', pages.document, '#typeFilters [data-type="scara"]']
]) {
 test(`${name} 선택 시 왼쪽 강조선 없이 배경색으로 구분한다`, async ({ page }) => {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  if (route === pages.document) await page.locator('#filterToggleHardware').click();
  const control = page.locator(selector);
  await control.click();
  await expect(control).toHaveClass(/\bactive\b/);
  await expect(control).toHaveCSS('background-color', 'rgb(220, 239, 252)');
  await expect(control).not.toHaveCSS('box-shadow', /\b[1-9]\d*px 0px 0px 0px inset\b/);
 });
}

for(const [name,route] of Object.entries(pages)){
 test(`화면 테마: ${name} 화면의 로고·언어 선택·모바일 배치`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(route,{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(242, 246, 250)');
  await expect(page.locator('body > header').first()).toHaveCSS('background-color','rgb(247, 250, 253)');
  if(name === 'simulation'){
   await expect(page.locator('#model-browser-panel')).toHaveCSS('background-color','rgb(255, 255, 255)');
   await expect(page.locator('#model-select')).toHaveCSS('background-color','rgb(8, 104, 158)');
  }
  const logo=page.locator('body > header img').first();
  await expect(logo).toBeVisible();
  await expect.poll(()=>logo.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  const language = page.getByRole('combobox', { name: 'Language', exact: true });
  await expect(language.locator('option')).toHaveText(languageNames);
  await expect(page.locator('#inorobot-language-switcher').getByText('Language', { exact: true })).toHaveCount(0);
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
   await expect(language).toBeInViewport({ ratio: 1 });
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
   await expect(page.locator('.title-stop')).toHaveCSS('color','rgb(16, 140, 207)');
   await expect(page.locator('.tool-filters [aria-pressed="true"]')).toHaveCSS('background-color','rgb(8, 104, 158)');
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
  expect(html).toContain('/shared/brand-colors.css');
 }
});

test('좁은 화면에서도 선택한 언어의 영문 이름이 보이고 새로고침 후에도 선택이 유지된다', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 800 });
 await page.goto('/5_Software/');
 const selector = page.getByRole('combobox', { name: 'Language', exact: true });
 for (const [locale, name] of [['zh-CN', 'Chinese (Simplified)'], ['vi', 'Vietnamese']]) {
  await selector.selectOption({ label: name });
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(selector.locator('option:checked')).toHaveText(name);
  await expect(selector).toBeInViewport({ ratio: 1 });
 }
 await page.reload();
 await expect(selector).toHaveValue('vi');
 await expect(selector.locator('option')).toHaveText(languageNames);
});
