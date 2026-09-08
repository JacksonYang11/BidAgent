import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8001';
const output=new URL('../output/playwright/',import.meta.url).pathname;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1512,height:1000},deviceScaleFactor:1});
  page.setDefaultTimeout(10000);
  const errors=[],writes=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const r=route.request();
    if(!r.url().startsWith(base+'/')){external.push(r.url());return route.abort();}
    if(!['GET','HEAD'].includes(r.method())){writes.push(r.method()+' '+r.url());return route.abort();}
    return route.continue();
  });
  await page.goto(base);
  await page.locator('#overviewView .demo-metrics').waitFor({state:'attached'});
  await page.locator('#companyRevision').getByText(/已保存|尚未提供/).waitFor({state:'attached'});
  const profileBefore=await (await page.request.get(base+'/api/company-profile')).json();
  const tasksBefore=await (await page.request.get(base+'/api/tasks')).json();
  const nav=async view=>{
    if(await page.locator('#menuBtn').isVisible())await page.locator('#menuBtn').click();
    await page.locator(`[data-view="${view}"]`).click();
    await page.locator('#'+view+'View').waitFor();
    await page.waitForFunction(()=>innerWidth>=768||document.getElementById('sidebar').getBoundingClientRect().right<=1);
    assert.equal(await page.locator('main>.view:visible').count(),1);
  };
  const dialog=page.locator('#demoDialog');
  const close=async()=>{await page.locator('#demoDialogClose').click();};
  const command=async(name)=>(await dialog.isVisible()?dialog:page).getByRole('button',{name,exact:true}).click();
  const assertTemplateLayout=async()=>{
    const layout=await page.locator('.demo-template').evaluateAll(cards=>cards.map(card=>{
      const rect=e=>e.getBoundingClientRect().toJSON();
      const cover=card.querySelector('.demo-template-cover'),paper=card.querySelector('.demo-paper');
      return {card:rect(card),cover:rect(cover),paper:rect(paper),paperContent:[...paper.children].map(rect),
        title:rect(card.querySelector('h2')),buttons:[...card.querySelectorAll('button')].map(rect),
        textOverflow:[...card.querySelectorAll('h2,strong,p,button')].some(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)};
    }));
    const contains=(outer,inner,inset=0)=>inner.left>=outer.left+inset-1&&inner.right<=outer.right-inset+1&&inner.top>=outer.top+inset-1&&inner.bottom<=outer.bottom-inset+1;
    const width=page.viewportSize().width;
    for(const [index,item] of layout.entries()){
      assert.ok(contains(item.cover,item.paper,12),`Template ${index}: paper clipped or missing whitespace at ${width}px`);
      assert.ok(item.paperContent.every(r=>contains(item.paper,r,8)),`Template ${index}: paper text overflow at ${width}px`);
      assert.ok(contains(item.card,item.title,12),`Template ${index}: title overflow at ${width}px`);
      assert.equal(item.textOverflow,false,`Template ${index}: overflowing text at ${width}px`);
      assert.ok(item.buttons.every(r=>contains(item.card,r,12)),`Template ${index}: button clipping at ${width}px`);
      assert.ok(item.buttons.every(r=>r.top>=item.title.bottom+8),`Template ${index}: title/button overlap at ${width}px`);
      for(const peer of layout.slice(0,index).filter(p=>Math.abs(p.card.top-item.card.top)<1)){
        assert.ok(Math.abs(peer.card.bottom-item.card.bottom)<1,`Unequal template row heights at ${width}px`);
        assert.ok(Math.abs(peer.buttons[0].top-item.buttons[0].top)<1,`Misaligned template actions at ${width}px`);
      }
    }
  };
  await nav('opportunities');
  assert.equal(await page.locator('#opportunitiesView tbody tr').count(),12);
  await page.getByRole('searchbox',{name:'搜索项目或采购单位'}).fill('云溪');
  assert.equal(await page.locator('#opportunitiesView tbody tr').count(),1);
  await page.getByLabel('城市',{exact:true}).selectOption('上海');
  await page.getByText('暂无匹配的演示数据',{exact:true}).waitFor();
  await page.getByLabel('城市',{exact:true}).selectOption('');
  await command('云溪产业园招聘与驻场服务');
  await dialog.getByRole('heading',{name:'竞争对手透视'}).waitFor();
  await dialog.getByRole('button',{name:'收藏',exact:true}).click();
  await dialog.getByRole('button',{name:'取消收藏',exact:true}).waitFor();
  await close();
  await page.getByRole('searchbox',{name:'搜索项目或采购单位'}).fill('');
  await command('我的收藏');
  assert.equal(await page.locator('#opportunitiesView tbody tr').count(),1);
  await command('全部标讯');
  await page.getByLabel('预算金额',{exact:true}).selectOption('small');
  assert.equal(await page.locator('#opportunitiesView tbody tr').count(),1);
  await page.getByLabel('预算金额',{exact:true}).selectOption('');
  await command('订阅标讯推送');
  await dialog.getByLabel('上海',{exact:true}).check();
  await dialog.getByLabel('演示邮箱（不发送邮件）').fill('preview@example.test');
  await command('保存演示订阅');
  await command('订阅标讯推送');
  assert.equal(await dialog.getByLabel('演示邮箱（不发送邮件）').inputValue(),'preview@example.test');
  assert.equal(await dialog.getByLabel('上海',{exact:true}).isChecked(),true);
  await close();
  await nav('expiry');await command('90 天内');
  assert.equal(await page.locator('#expiryView tbody tr').count(),1);
  await command('介入方案');await command('加入模拟跟进');
  await page.getByRole('button',{name:'已加入跟进'}).waitFor();
  await command('预警规则');
  await dialog.getByLabel('提前预警天数').selectOption('90');
  await command('保存演示规则');await command('预警规则');
  assert.equal(await dialog.getByLabel('提前预警天数').inputValue(),'90');await close();
  await nav('analytics');await page.getByLabel('统计周期').selectOption('3');
  assert.equal(await page.locator('.demo-chart-bar:visible').count(),6);
  const downloadPromise=page.waitForEvent('download');await command('导出示例报表');
  const download=await downloadPromise;assert.ok(download.suggestedFilename().startsWith('虚构演示_'));
  await download.saveAs(output+'demo-industry.json');
  const exported=JSON.parse(await readFile(output+'demo-industry.json','utf8'));assert.equal(exported.fictional,true);assert.equal(exported.monthly.length,3);
  await nav('review');await command('查看样例检查报告');
  assert.equal(await page.locator('.demo-review-item').count(),6);
  await page.getByRole('button',{name:'标记已处理',exact:true}).first().click();await command('未处理');
  assert.equal(await page.locator('.demo-review-item').count(),5);
  await command('高');assert.equal(await page.locator('.demo-review-item').count(),2);
  await page.locator('.demo-review-item summary').first().click();await page.locator('.demo-review-item blockquote').first().waitFor();
  await nav('templates');await page.getByRole('searchbox',{name:'搜索模板',exact:true}).fill('招聘交付');
  assert.equal(await page.locator('.demo-template').count(),1);
  await command('预览');await dialog.getByRole('heading',{name:'模板目录示例'}).waitFor();
  await command('选入编制预览');await page.locator('#planningView').waitFor();
  assert.equal(await page.locator('.demo-outline-row').count(),5);
  await page.getByLabel('暗标模式预览').check();
  await page.getByText('投标人：投标人（暗标预览）',{exact:true}).waitFor();
  await command('商务标');
  await page.getByRole('button',{name:/编辑目录/}).first().click();
  await dialog.getByLabel('章节标题').fill('样例目录修改');await command('保存预览');
  await page.getByRole('button',{name:'下移 样例目录修改',exact:true}).click();
  assert.equal(await page.locator('.demo-outline-row strong').nth(1).innerText(),'样例目录修改');
  await command('评分点');assert.equal(await page.locator('.demo-outline-row').count(),8);
  await command('模板');assert.equal(await page.locator('.demo-outline-row').count(),5);
  await nav('knowledge');await command('招聘交付全流程作业标准');await command('选入引用预览');
  await page.getByText('已选入',{exact:true}).waitFor();
  await page.getByRole('searchbox',{name:'搜索知识资产'}).fill('招聘');
  await command('招聘交付全流程作业标准');await command('移出引用预览');
  assert.equal(await page.getByRole('searchbox',{name:'搜索知识资产'}).inputValue(),'招聘');
  await page.getByRole('searchbox',{name:'搜索知识资产'}).fill('');
  await command('载入知识资产示例');await command('载入内置示例');
  assert.equal(await page.locator('#knowledgeView tbody tr').count(),7);
  await nav('templates');await page.getByRole('searchbox',{name:'搜索模板',exact:true}).fill('');
  await command('载入企业模板示例');await command('载入内置示例');
  assert.equal(await page.locator('.demo-template').count(),7);
  await page.getByRole('button',{name:'通知中心（演示）',exact:true}).filter({visible:true}).first().click();
  await command('全部标记已读');assert.equal(await dialog.getByText('已读',{exact:true}).count(),4);await close();
  await page.getByRole('button',{name:'鲸灵助手（演示）',exact:true}).filter({visible:true}).first().click();
  await dialog.getByLabel('演示问题',{exact:true}).fill('<img src=x onerror=alert(1)> 投标风险');
  await command('发送演示问题');
  assert.equal(await dialog.locator('img').count(),0);
  await dialog.getByText(/样例报告列出证照页面缺失/).waitFor();await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(),false);
  const views=['overview','opportunities','expiry','analytics','review','templates','knowledge','planning'];
  await page.locator('#demoToast').waitFor({state:'hidden'});
  for(const width of [1512,1280,390]){
    await page.setViewportSize({width,height:width===390?844:1000});
    for(const view of views){
      await nav(view);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,view+' overflow at '+width);
      if(view==='templates')await assertTemplateLayout();
      await page.screenshot({path:output+`demo-${view}-${width}.png`,fullPage:true});
    }
  }
  for(const width of [320,768,1281]){
    await page.setViewportSize({width,height:900});await nav('templates');await assertTemplateLayout();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'templates overflow at '+width);
    await page.screenshot({path:output+`demo-templates-${width}.png`,fullPage:true});
  }
  // Stress only the browser DOM; the preset data and backend stay untouched.
  const templateHeadings=page.locator('.demo-template').first().locator('h2,.demo-paper strong');
  const originalHeadings=await templateHeadings.allTextContents();
  await templateHeadings.evaluateAll(elements=>elements.forEach(e=>e.textContent='跨区域多城市招聘交付与人才服务全流程一体化实施方案（虚构长标题布局测试）'));
  for(const width of [320,1281]){
    await page.setViewportSize({width,height:900});
    await page.waitForFunction(()=>innerWidth>=768||document.getElementById('sidebar').getBoundingClientRect().right<=1);
    await assertTemplateLayout();
    await page.locator('.demo-template').first().screenshot({path:output+`demo-template-long-title-${width}.png`});
  }
  await templateHeadings.evaluateAll((elements,texts)=>elements.forEach((e,i)=>e.textContent=texts[i]),originalHeadings);
  await nav('workbench');await page.locator('#workbench').waitFor();
  assert.equal(await page.locator('#pageTitle').innerText(),'在线智能招投标Agent');
  await nav('company');assert.equal(await page.locator('#companyForm [name=name]').inputValue(),profileBefore.name);
  const profileAfter=await (await page.request.get(base+'/api/company-profile')).json();
  const tasksAfter=await (await page.request.get(base+'/api/tasks')).json();
  assert.deepEqual(profileAfter,profileBefore);assert.deepEqual(tasksAfter,tasksBefore);
  assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  await page.reload();await page.locator('#overviewView .demo-metrics').waitFor({state:'attached'});
  await nav('opportunities');await command('我的收藏');await page.getByText('暂无匹配的演示数据',{exact:true}).waitFor();
  console.log(JSON.stringify({result:'passed',views:views.length,viewports:[1512,1280,390],templateViewports:[320,390,768,1280,1281,1512],longTitles:true,apiMutations:writes.length,externalRequests:external.length,liveDataUnchanged:true,errors}));
}finally{await browser.close();}
