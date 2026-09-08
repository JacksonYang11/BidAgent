import {snapshot,demoCompany,opportunities,contracts,templates,assets,reviewItems,chapters,monthly} from './demo-data.js';

// Intentionally has no fetch, storage, live-task state, or model client dependencies.
export function initDemo({navigate}) {
  const $ = id => document.getElementById(id);
  const memory = {favorites:new Set(),followed:new Set(),read:new Set(),resolved:new Set(),
    selectedAssets:new Set(),selectedTemplate:null,checked:false,reviewFilter:'全部',
    subscription:{cities:['杭州'],types:['招聘服务'],amount:'不限',email:'demo@example.test',expiry:true},
    rule:{days:180,score:70,enabled:true},plan:structuredClone(chapters),docType:'技术标',
    planMode:'评分点',dark:false,caseRef:true,weighted:true,polish:true,chat:[]};
  const dialog=$('demoDialog');
  const icons=()=>window.lucide?.createIcons();
  function node(tag,cls='',text){const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
  function icon(name){const n=node('i');n.dataset.lucide=name;return n;}
  function action(text,symbol,fn,cls='secondary'){
    const b=node('button','button '+cls);b.type='button';if(symbol)b.append(icon(symbol));if(text)b.append(document.createTextNode(text));
    b.addEventListener('click',()=>{try{fn();}catch{toast('演示操作未完成，请重试。');}});return b;
  }
  function tool(symbol,title,fn){const b=action('',symbol,fn,'');b.className='icon-button';b.title=title;b.setAttribute('aria-label',title);return b;}
  function tag(text,kind='neutral'){return node('span','tag '+kind,text);}
  function row(...children){const n=node('div','demo-row');n.append(...children);return n;}
  function toast(text){$('demoToast').textContent=text;$('demoToast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('demoToast').hidden=true,4000);}
  function close(){dialog.close();}
  function show(title,content,actions=[]){
    $('demoDialogTitle').textContent=title;$('demoDialogBody').replaceChildren(content);
    $('demoDialogFooter').replaceChildren(...(actions.length?actions:[action('关闭',null,close)]));
    if(!dialog.open)dialog.showModal();icons();
  }
  $('demoDialogClose').onclick=close;
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
  function go(view){if(dialog.open)close();navigate(view);}
  function download(name,text,type='text/markdown;charset=utf-8'){
    const url=URL.createObjectURL(new Blob([text],{type})),link=node('a');link.href=url;link.download='虚构演示_'+name;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出演示文件。');
  }
  const days=date=>Math.ceil((Date.parse(date+'T00:00:00Z')-Date.parse(snapshot+'T00:00:00Z'))/86400000);
  const money=number=>number.toLocaleString('zh-CN')+' 万元';
  function field(label,control){const n=node(['INPUT','SELECT','TEXTAREA'].includes(control.tagName)?'label':'div','demo-field');n.append(node('span','',label),control);return n;}
  function select(label,options,value,onChange){
    const n=node('select');n.setAttribute('aria-label',label);
    for(const item of options){const [v,t]=Array.isArray(item)?item:[item,item];const o=node('option','',t);o.value=v;n.append(o);}
    n.value=value;n.addEventListener('change',()=>onChange(n.value));return n;
  }
  function search(label,onChange,value=''){const n=node('div','search-box'),input=node('input');input.type='search';input.placeholder=label;input.value=value;input.maxLength=200;input.setAttribute('aria-label',label);input.addEventListener('input',()=>onChange(input.value));n.append(icon('search'),input);return n;}
  function segmented(label,values,value,onChange){
    const n=node('div','segmented demo-segmented');n.setAttribute('role','group');n.setAttribute('aria-label',label);
    for(const v of values){const b=action(v,null,()=>{for(const x of n.children){x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));}onChange(v);},'');b.className=v===value?'active':'';b.setAttribute('aria-pressed',String(v===value));n.append(b);}return n;
  }
  function checkbox(label,checked,onChange){const input=node('input');input.type='checkbox';input.checked=checked;input.addEventListener('change',()=>onChange(input.checked));const n=node('label','demo-checkbox');n.append(input,node('span','',label));return n;}
  function section(title,...contents){const n=node('section','demo-section');n.append(node('h2','',title),...contents);return n;}
  function table(headers){const wrap=node('div','demo-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',headers[0]+'列表');const t=node('table'),head=node('thead'),tr=node('tr'),body=node('tbody');headers.forEach(h=>{const th=node('th','',h);th.scope='col';tr.append(th);});head.append(tr);t.append(head,body);wrap.append(t);return {wrap,body};}
  function cell(value,cls=''){const n=node('td',cls);if(value instanceof Node)n.append(value);else n.textContent=String(value);return n;}
  function noResults(body,columns){const r=node('tr'),c=node('td','empty-row','暂无匹配的演示数据');c.colSpan=columns;r.append(c);body.append(r);}
  function score(value){const n=node('div','demo-score'),meter=node('meter');meter.min=0;meter.max=100;meter.value=value;meter.setAttribute('aria-label','示例匹配度');n.append(meter,node('span','mono',value+'%'));return n;}
  function metrics(items){const n=node('div','demo-metrics');items.forEach(([label,value,note])=>{const item=node('div');item.append(node('span','demo-caption',label),node('strong','mono',value),node('small','',note));n.append(item);});return n;}
  function detailPairs(pairs){const list=node('dl','demo-details');for(const [label,value] of pairs)list.append(node('dt','',label),node('dd','',value));return list;}
  function shell(view,commands=[]){
    const root=$(view+'View');root.replaceChildren();
    const notice=row(tag('虚构演示数据','warning'),node('span','demo-caption','快照 '+snapshot),node('span','demo-caption',demoCompany));notice.classList.add('demo-disclosure');
    const controls=row(tool('bell','通知中心（演示）',notifications),tool('messages-square','鲸灵助手（演示）',assistant));
    const bar=row(notice,controls);bar.classList.add('demo-page-bar');root.append(bar);
    if(commands.length){const toolbar=row(...commands);toolbar.classList.add('demo-toolbar');root.append(toolbar);}return root;
  }

  function bidDetail(item){
    const body=node('div');body.append(row(tag(item.status,item.status==='中标公示'?'success':'info'),tag(item.type),tag('匹配度 '+item.match+'%','info')),
      detailPairs([['采购单位',item.buyer],['城市',item.city],['预算',money(item.amount)],['时间',item.deadline],['来源',item.source]]),
      section('项目概况',node('p','',item.summary)),section('AI 解读示例',node('p','','建议重点核对服务范围、人员资质与交付标准。匹配度来自预设数据，并非对当前投标企业的资格判断。')));
    if(item.winner)body.append(section('中标公示示例',detailPairs([['中标单位',item.winner],['中标金额',money(item.winningAmount)]])));
    body.append(section('竞争对手透视',detailPairs([['启航人才（虚构）','区域项目 42 个 · 示例中标率 31%'],['嘉禾人才（虚构）','区域项目 35 个 · 示例中标率 27%']])),
      section('响应重点',node('p','','服务实施方案、项目团队、应急处置及信息安全。真实要求以手动上传文件的解析结果为准。')));
    const favorite=action(memory.favorites.has(item.id)?'取消收藏':'收藏','bookmark',()=>{memory.favorites.has(item.id)?memory.favorites.delete(item.id):memory.favorites.add(item.id);renderBids();renderOverview();bidDetail(item);});
    show(item.name,body,[favorite,action('编制方案预览','notebook-tabs',()=>go('planning')),action('打开标书工作台','arrow-right',()=>go('workbench'),'primary')]);
  }

  function renderOverview(){
    const root=shell('overview',[action('查看标讯','radar',()=>go('opportunities'),'primary'),action('打开标书工作台','arrow-right',()=>go('workbench'))]);
    const matched=opportunities.filter(x=>x.match>=80),urgent=opportunities.filter(x=>x.status==='招标中'&&days(x.deadline)<=7);
    root.append(metrics([['样例标讯',opportunities.length,'固定数据集'],['高匹配商机',matched.length,'示例匹配度 ≥ 80%'],['近期截标',urgent.length,'快照起 7 天内'],['到期线索',contracts.length,'快照起 180 天内']]));
    const split=node('div','demo-split');const recommended=node('div');
    [...matched].sort((a,b)=>b.match-a.match).slice(0,4).forEach(item=>{const info=node('div','demo-grow');info.append(action(item.name,null,()=>bidDetail(item),'ghost'),node('p','demo-caption',item.city+' · '+item.type+' · '+money(item.amount)));const line=row(score(item.match),info,tag(item.status,'info'));line.classList.add('demo-list-row');recommended.append(line);});
    const alerts=node('div');for(const [title,detail,view] of [['截标提醒',urgent.length+' 个样例项目临近截标','opportunities'],['合约预警','钱塘星谷项目将进入服务续约窗口','expiry'],['材料检查','示例标书有 2 项高风险待核对','review']]){const info=node('div','demo-grow');info.append(node('h3','',title),node('p','demo-caption',detail));const line=row(info,tool('arrow-right','查看'+title,()=>go(view)));line.classList.add('demo-list-row');alerts.append(line);}
    split.append(section('高匹配商机推荐',recommended),section('预警中心',alerts));root.append(split);
    const tasks=table(['模拟项目','阶段','进度','状态']);
    [['云溪园区招聘服务','方案编制',62,'进行中'],['桂语企业园人事服务','材料复核',88,'待审核'],['未来港园区派遣服务','目录确认',30,'准备中']].forEach(([name,stage,progress,status])=>{const tr=node('tr');tr.append(cell(action(name,null,()=>go('planning'),'ghost')),cell(stage),cell(score(progress)),cell(tag(status,'info')));tasks.body.append(tr);});
    const feed=node('ol','demo-timeline');['09:30 · 云溪产业园样例已加入推荐清单','09:10 · 合约到期样例新增跟进建议','08:50 · 示例招聘交付标准更新至 V2','08:30 · 标讯快照更新完成'].forEach(t=>feed.append(node('li','',t)));
    const bottom=node('div','demo-split');bottom.append(section('模拟投标任务',tasks.wrap),section('工作动态示例',feed));root.append(bottom);icons();
  }

  const bidFilters={query:'',city:'',type:'',amount:'',status:'全部标讯'};
  let bidBody,bidCount;
  function bidsPage(){
    const root=shell('opportunities',[action('订阅标讯推送','bell-plus',subscribe,'primary')]);
    const filters=row(search('搜索项目或采购单位',v=>{bidFilters.query=v;renderBids();}),
      select('城市',[['','全部城市'],...new Set(opportunities.map(x=>x.city))],'',v=>{bidFilters.city=v;renderBids();}),
      select('服务类别',[['','全部类别'],...new Set(opportunities.map(x=>x.type))],'',v=>{bidFilters.type=v;renderBids();}),
      select('预算金额',[['','全部金额'],['small','100 万以下'],['medium','100-500 万'],['large','500 万以上']],'',v=>{bidFilters.amount=v;renderBids();}));filters.classList.add('demo-filters');
    const tabs=segmented('标讯状态',['全部标讯','招标中','中标公示','到期预告','高匹配','我的收藏'],bidFilters.status,v=>{bidFilters.status=v;renderBids();});
    const t=table(['项目名称','城市 / 类别','预算','截止 / 公示日期','示例匹配度','状态','收藏']);bidBody=t.body;bidCount=node('p','demo-caption');root.append(filters,tabs,bidCount,t.wrap);renderBids();
  }
  function renderBids(){
    if(!bidBody)return;bidBody.replaceChildren();const f=bidFilters;
    const filtered=opportunities.filter(b=>(!f.query||(b.name+b.buyer).includes(f.query))&&(!f.city||b.city===f.city)&&(!f.type||b.type===f.type)&&
      (!f.amount||(f.amount==='small'?b.amount<100:f.amount==='medium'?b.amount>=100&&b.amount<=500:b.amount>500))&&
      (f.status==='全部标讯'||(f.status==='高匹配'?b.match>=80:f.status==='我的收藏'?memory.favorites.has(b.id):b.status===f.status)));
    for(const b of filtered){const name=node('div','demo-name-cell');name.append(action(b.name,null,()=>bidDetail(b),'ghost'),node('p','demo-caption',b.buyer));const tr=node('tr');
      const save=tool('bookmark',memory.favorites.has(b.id)?'取消收藏 '+b.name:'收藏 '+b.name,()=>{memory.favorites.has(b.id)?memory.favorites.delete(b.id):memory.favorites.add(b.id);renderBids();renderOverview();});save.setAttribute('aria-pressed',String(memory.favorites.has(b.id)));save.classList.toggle('demo-selected',memory.favorites.has(b.id));
      tr.append(cell(name),cell(b.city+' / '+b.type),cell(money(b.amount),'mono'),cell(b.deadline,'mono'),cell(b.match?score(b.match):'不适用'),cell(tag(b.status,b.status==='招标中'?'info':b.status==='中标公示'?'success':'warning')),cell(save));bidBody.append(tr);}
    if(!filtered.length)noResults(bidBody,7);bidCount.textContent='共 '+filtered.length+' 条样例 · 收藏 '+memory.favorites.size+' 条';icons();
  }
  function subscribe(){
    const draft=structuredClone(memory.subscription),form=node('form','demo-form');form.id='demoSubscription';
    const cities=node('fieldset'),cityLegend=node('legend','','关注城市');cities.append(cityLegend);['杭州','上海','南京','苏州','深圳','北京','成都'].forEach(v=>cities.append(checkbox(v,draft.cities.includes(v),checked=>{draft.cities=checked?[...draft.cities,v]:draft.cities.filter(x=>x!==v);})));form.append(cities);
    const types=node('fieldset');types.append(node('legend','','关注类别'));['招聘服务','劳务派遣','人力资源外包','综合后勤'].forEach(v=>types.append(checkbox(v,draft.types.includes(v),checked=>{draft.types=checked?[...draft.types,v]:draft.types.filter(x=>x!==v);})));form.append(types);
    const email=node('input');email.type='email';email.required=true;email.maxLength=200;email.value=draft.email;
    form.append(field('预算区间',select('订阅预算区间',['不限','100 万以下','100-500 万','500 万以上'],draft.amount,v=>draft.amount=v)),field('演示邮箱（不发送邮件）',email),checkbox('同时关注合约到期',draft.expiry,v=>draft.expiry=v));
    const save=action('保存演示订阅','save',()=>{},'primary');save.type='submit';save.setAttribute('form',form.id);
    form.onsubmit=e=>{e.preventDefault();draft.email=email.value;memory.subscription=draft;close();toast('演示订阅已保存到当前页面，未发送邮件。');};show('订阅标讯推送',form,[action('取消',null,close),save]);
  }

  let expiryBody,expiryRange='全部';
  function expiryPage(){
    const root=shell('expiry',[action('预警规则','sliders-horizontal',expiryRules),action('导出样例方案','download',()=>download('到期跟进方案.md','# 合约到期跟进方案（虚构演示）\n\n'+contracts.map(c=>'## '+c.name+'\n预计到期：'+c.date+'\n\n'+c.note).join('\n\n')))]);
    root.append(metrics([['到期项目',contracts.length,'固定样例'],['90 天内到期',contracts.filter(c=>days(c.date)<=90).length,'按快照日期计算'],['年度合同总额',money(contracts.reduce((n,c)=>n+c.amount,0)),'样例金额汇总'],['高机会评分',contracts.filter(c=>c.score>=80).length,'示例评分 ≥ 80']]));
    root.append(segmented('到期时间',['全部','90 天内','180 天内'],expiryRange,v=>{expiryRange=v;renderExpiry();}));const t=table(['项目 / 类别','当前服务方','年度合同额','预计到期','剩余天数','示例机会分','操作']);expiryBody=t.body;root.append(t.wrap);renderExpiry();
  }
  function renderExpiry(){if(!expiryBody)return;expiryBody.replaceChildren();const filtered=contracts.filter(c=>expiryRange==='全部'||days(c.date)<=(expiryRange==='90 天内'?90:180));
    for(const c of filtered){const tr=node('tr'),name=node('div','demo-name-cell');name.append(action(c.name,null,()=>expiryPlan(c),'ghost'),node('p','demo-caption',c.type));tr.append(cell(name),cell(c.provider),cell(money(c.amount),'mono'),cell(c.date,'mono'),cell(tag(days(c.date)+' 天',days(c.date)<=90?'warning':'neutral')),cell(score(c.score)),cell(action(memory.followed.has(c.id)?'已加入跟进':'介入方案','clipboard-list',()=>expiryPlan(c))));expiryBody.append(tr);}if(!filtered.length)noResults(expiryBody,7);icons();}
  function expiryPlan(c){const body=node('div');body.append(detailPairs([['预计到期',c.date],['年度合同额',money(c.amount)],['机会评分',c.score+'/100（示例）']]),section('机会研判示例',node('p','',c.note)));
    const steps=node('ol','demo-timeline');['确认采购计划与业务联系人','调研服务现状、需求范围和采购预算','核对企业能力并准备差异化方案','跟踪公告并安排标前评审'].forEach(s=>steps.append(node('li','',s)));body.append(section('四步跟进计划',steps));
    show('介入方案 · '+c.name,body,[action('关闭',null,close),action(memory.followed.has(c.id)?'取消模拟跟进':'加入模拟跟进','clipboard-plus',()=>{memory.followed.has(c.id)?memory.followed.delete(c.id):memory.followed.add(c.id);renderExpiry();close();toast('当前页面的模拟跟进状态已更新，未指派真实任务。');},'primary')]);}
  function expiryRules(){const draft={...memory.rule},form=node('div','demo-form');const horizon=select('提前预警天数',[['30','30 天'],['90','90 天'],['180','180 天']],String(draft.days),v=>draft.days=Number(v));const minimum=node('input');minimum.type='number';minimum.min=0;minimum.max=100;minimum.value=draft.score;
    form.append(field('提前预警',horizon),field('最低示例机会分',minimum),checkbox('启用模拟预警',draft.enabled,v=>draft.enabled=v));show('预警规则配置',form,[action('取消',null,close),action('保存演示规则','save',()=>{if(!minimum.reportValidity())return;draft.score=Number(minimum.value);memory.rule=draft;close();toast('演示规则已保存，未启用后台监控。');},'primary')]);}

  let period=12,analyticsRoot;
  function analyticsPage(){analyticsRoot=shell('analytics',[select('统计周期',[['12','近 12 个月'],['6','近 6 个月'],['3','近 3 个月']],String(period),v=>{period=Number(v);renderAnalytics();}),action('导出示例报表','download',()=>download('行业数据.json',JSON.stringify({fictional:true,snapshot,monthly:monthly.slice(-period)},null,2),'application/json'))]);const content=node('div');content.id='demoAnalyticsContent';analyticsRoot.append(content);renderAnalytics();}
  function bars(items){const n=node('div','demo-bars'),max=Math.max(...items.map(x=>x[1]));for(const [name,value] of items){const track=node('div','demo-bar-track'),fill=node('div','demo-bar-fill');fill.style.width=(value/max*100)+'%';track.append(fill);const line=row(node('span','demo-bar-name',name),track,node('span','mono',value.toLocaleString()));n.append(line);}return n;}
  function renderAnalytics(){const root=$('demoAnalyticsContent');if(!root)return;root.replaceChildren();const series=monthly.slice(-period),total=series.reduce((n,x)=>n+x.bids,0),awards=series.reduce((n,x)=>n+x.awards,0);
    root.append(metrics([['标讯总量',total.toLocaleString(),'所选周期样例'],['中标公示',awards.toLocaleString(),'所选周期样例'],['月均标讯',Math.round(total/period).toLocaleString(),'按所选周期计算'],['统计月份',period,'固定历史快照']]));
    const chart=node('div','demo-trend');chart.setAttribute('role','img');chart.setAttribute('aria-label','月度招标及中标公示趋势，具体数值见下方明细');chart.style.setProperty('--columns',series.length);const max=Math.max(...series.map(x=>x.bids));
    for(const m of series){const column=node('div','demo-chart-column'),plot=node('div','demo-chart-pair');for(const [key,label] of [['bids','招标'],['awards','中标']]){const bar=node('div','demo-chart-bar '+key);bar.style.height=(m[key]/max*100)+'%';bar.title=m.month+' '+label+' '+m[key]+' 条';plot.append(bar);}column.append(plot,node('small','',m.month.slice(5)+'月'));chart.append(column);}
    const details=node('details');details.append(node('summary','','查看月度明细'));const t=table(['月份','招标数量','中标公示']);series.forEach(m=>{const tr=node('tr');tr.append(cell(m.month,'mono'),cell(m.bids,'mono'),cell(m.awards,'mono'));t.body.append(tr);});details.append(t.wrap);
    const trend=section('月度标讯发布趋势',row(tag('招标数量','info'),tag('中标公示','success')),chart,details),split=node('div','demo-split');
    split.append(trend,section('服务类别分布（所选周期）',bars([['招聘服务',Math.round(total*.38)],['人力资源外包',Math.round(total*.32)],['劳务派遣',Math.round(total*.2)],['综合后勤',total-Math.round(total*.38)-Math.round(total*.32)-Math.round(total*.2)]])));root.append(split);
    const factor=period/12,second=node('div','demo-split'),activity=node('ol','demo-timeline');['启航人才（虚构） · 明湖园区示例中标公示','嘉禾人才（虚构） · 示例服务方案更新','研才咨询（虚构） · 人才寻访案例新增'].forEach(s=>activity.append(node('li','',s)));
    second.append(section('城市热度 TOP 8',bars([['杭州',1840],['上海',1620],['北京',1490],['深圳',1310],['成都',1120],['南京',980],['苏州',860],['广州',820]].map(([n,v])=>[n,Math.round(v*factor)]))),section('行业企业动态示例',activity));root.append(second);icons();}

  function reviewPage(){const root=shell('review',[action(memory.checked?'重新查看样例报告':'查看样例检查报告','shield-check',()=>{memory.checked=true;reviewPage();},'primary'),action('导出样例报告','download',()=>download('废标检查报告.md','# 废标检查报告（虚构演示，非真实审查结果）\n\n'+reviewItems.map(r=>'## '+r.level+'风险：'+r.title+'\n'+r.issue+'\n\n建议：'+r.suggestion+'\n状态：'+(memory.resolved.has(r.id)?'演示标记已处理':'待处理')).join('\n\n')))]);
    root.append(node('p','demo-caption','检查对象：云溪产业园_投标文件_示例.docx · 未读取当前真实标书'),metrics([['示例检查项',24,'资质 / 格式 / 响应 / 暗标'],['风险条目',memory.checked?reviewItems.length:'待查看','固定报告'],['高风险',memory.checked?reviewItems.filter(r=>r.level==='高').length:'待查看','需人工确认'],['已标记处理',memory.resolved.size,'仅当前页面的演示状态']]));
    if(!memory.checked){root.append(section('样例报告待查看',node('p','demo-caption','云溪产业园招聘与驻场服务 · 虚构检查样本')));icons();return;}
    root.append(segmented('检查风险级别',['全部','高','中','低','未处理'],memory.reviewFilter,v=>{memory.reviewFilter=v;reviewPage();}));
    const list=node('div','demo-review-list');for(const r of reviewItems.filter(r=>memory.reviewFilter==='全部'||memory.reviewFilter==='未处理'&&!memory.resolved.has(r.id)||r.level===memory.reviewFilter)){
      const item=node('article','demo-review-item'),text=node('div','demo-grow'),done=memory.resolved.has(r.id);text.append(row(tag(r.level+'风险',r.level==='高'?'danger':r.level==='中'?'warning':'info'),node('h3','',r.title)),node('p','demo-caption',r.category+' · '+r.location),node('p','',r.issue));
      const detail=node('details');detail.append(node('summary','','查看依据与建议'),node('blockquote','',r.source),node('p','',r.suggestion));text.append(detail);item.append(text,action(done?'撤销处理标记':'标记已处理',done?'undo-2':'check',()=>{done?memory.resolved.delete(r.id):memory.resolved.add(r.id);reviewPage();}));list.append(item);}
    if(!list.children.length)list.append(node('p','empty-row','当前筛选下无待处理样例'));root.append(list);icons();}

  let templateGrid,templateQuery='',templateType='全部';
  function templatesPage(){const root=shell('templates',[action('载入企业模板示例','folder-plus',()=>sampleImport('template'))]);
    const filters=row(search('搜索模板',v=>{templateQuery=v;renderTemplates();}),select('模板类别',['全部','招聘服务','人力资源外包','劳务派遣','综合后勤'],templateType,v=>{templateType=v;renderTemplates();}));filters.classList.add('demo-filters');templateGrid=node('div','demo-template-grid');root.append(filters,templateGrid);renderTemplates();}
  const extraTemplates=[],extraAssets=[];
  function renderTemplates(){if(!templateGrid)return;templateGrid.replaceChildren();const filtered=[...templates,...extraTemplates].filter(t=>(templateType==='全部'||t.type===templateType)&&t.name.includes(templateQuery));
    for(const t of filtered){const card=node('article','demo-template'),cover=node('div','demo-template-cover'),sheet=node('div','demo-paper');sheet.append(node('span','demo-caption','投标方案 / SAMPLE'),node('strong','',t.name));t.chapters.slice(0,3).forEach((c,i)=>sheet.append(node('p','',`${i+1}. ${c}`)));cover.append(sheet);card.append(cover,row(tag(t.type),tag(t.source,'info')),node('h2','',t.name),node('p','demo-caption',`示例引用 ${t.uses} 次 · 示例质量分 ${t.quality}`),row(action('预览','eye',()=>templateDetail(t)),action(memory.selectedTemplate===t.id?'已选入预览':'选入编制预览','notebook-tabs',()=>useTemplate(t),'primary')));templateGrid.append(card);}
    if(!filtered.length)templateGrid.append(node('p','empty-row','暂无匹配模板'));icons();}
  function templateDetail(t){const list=node('ol','demo-timeline');t.chapters.forEach(c=>list.append(node('li','',c)));show(t.name,section('模板目录示例',list),[action('关闭',null,close),action('选入编制预览','notebook-tabs',()=>{useTemplate(t);close();go('planning');},'primary')]);}
  function useTemplate(t){memory.selectedTemplate=t.id;memory.planMode='模板';memory.plan=t.chapters.map((title,i)=>({id:'template-chapter-'+i,title,weight:Math.floor(100/t.chapters.length)+(i<100%t.chapters.length?1:0),text:'本章为模板预览内容。具体条款、企业事实与服务承诺需根据真实招标文件另行编制。'}));renderTemplates();planningPage();toast('模板已选入编制预览，不改变真实标书。');}

  let knowledgeBody,knowledgeQuery='',knowledgeType='全部';
  function knowledgePage(){const root=shell('knowledge',[action('载入知识资产示例','library',()=>sampleImport('asset'))]);root.append(metrics([['知识资产',[...assets,...extraAssets].length,'预设样例'],['示例引用总数',[...assets,...extraAssets].reduce((n,a)=>n+a.uses,0).toLocaleString(),'固定演示计数'],['选入编制预览',memory.selectedAssets.size,'与真实企业资料隔离'],['资产类别',new Set([...assets,...extraAssets].map(a=>a.type)).size,'服务标准 / 案例等']]));const filters=row(search('搜索知识资产',v=>{knowledgeQuery=v;renderKnowledge();},knowledgeQuery),select('知识资产类型',['全部',...new Set(assets.map(a=>a.type))],knowledgeType,v=>{knowledgeType=v;renderKnowledge();}));filters.classList.add('demo-filters');const t=table(['资产名称','类型 / 场景','关联项目','示例引用','示例质量分','引用预览']);knowledgeBody=t.body;root.append(filters,t.wrap);renderKnowledge();}
  function renderKnowledge(){if(!knowledgeBody)return;knowledgeBody.replaceChildren();const filtered=[...assets,...extraAssets].filter(a=>a.name.includes(knowledgeQuery)&&(knowledgeType==='全部'||a.type===knowledgeType));
    for(const a of filtered){const tr=node('tr');tr.append(cell(action(a.name,null,()=>assetDetail(a),'ghost')),cell(a.type+' / '+a.category),cell(a.project),cell(a.uses,'mono'),cell(a.quality,'mono'),cell(tag(memory.selectedAssets.has(a.id)?'已选入':'未选择',memory.selectedAssets.has(a.id)?'info':'neutral')));knowledgeBody.append(tr);}if(!filtered.length)noResults(knowledgeBody,6);icons();}
  function assetDetail(a){show(a.name,section('资产内容示例',node('p','',a.content),detailPairs([['类型',a.type],['关联项目',a.project],['示例引用次数',a.uses]])),[action('关闭',null,close),action(memory.selectedAssets.has(a.id)?'移出引用预览':'选入引用预览','book-open-check',()=>{memory.selectedAssets.has(a.id)?memory.selectedAssets.delete(a.id):memory.selectedAssets.add(a.id);close();knowledgePage();planningPage();toast('引用预览已更新，未写入真实企业资料或模型请求。');},'primary')]);}
  function sampleImport(kind){const list=kind==='template'?extraTemplates:extraAssets,exists=list.length>0;const body=node('div');body.append(node('p','','待载入：'+(kind==='template'?'星湾企业招聘方案（虚构）':'面试组织与候选人沟通规范（虚构）')),node('p','demo-caption','仅载入内置示例，不读取本机文件。'));
    const load=action(exists?'示例已载入':'载入内置示例','plus',()=>{if(list.length)return;if(kind==='template'){list.push({...templates[0],id:'tpl-extra',name:'星湾企业招聘方案（虚构）',source:'企业示例',uses:0});renderTemplates();}else{list.push({...assets[0],id:'asset-extra',name:'面试组织与候选人沟通规范（虚构）',uses:0});knowledgePage();}close();toast('已载入当前页面的虚构示例。');},'primary');load.disabled=exists;show(kind==='template'?'企业标书示例':'知识资产示例',body,[action('取消',null,close),load]);}

  function planningPage(){const root=shell('planning',[action('恢复默认方案','rotate-ccw',()=>{memory.plan=structuredClone(chapters);memory.selectedTemplate=null;memory.planMode='评分点';memory.dark=false;memory.docType='技术标';memory.caseRef=true;memory.weighted=true;memory.polish=true;planningPage();renderTemplates();}),action('导出方案预览','download',()=>download('编制方案.md',planText())),action('打开标书工作台','arrow-right',()=>go('workbench'),'primary')]);
    root.append(node('p','demo-boundary','以下编制选项仅用于预览，不应用于真实解析、生成或 Word 导出。'));
    const controls=node('div','demo-plan-controls');controls.append(field('标书类型',segmented('预览标书类型',['技术标','商务标'],memory.docType,v=>{memory.docType=v;planningPage();})),field('目录构建方式',segmented('预览目录构建方式',['评分点','模板'],memory.planMode,v=>{memory.planMode=v;if(v==='模板'){const selected=[...templates,...extraTemplates].find(t=>t.id===memory.selectedTemplate);if(selected)useTemplate(selected);else go('templates');return;}memory.plan=structuredClone(chapters);planningPage();})),
      checkbox('引用企业知识库示例',memory.caseRef,v=>{memory.caseRef=v;planningPage();}),checkbox('按评分权重分配篇幅',memory.weighted,v=>{memory.weighted=v;planningPage();}),checkbox('语法检查与润色预览',memory.polish,v=>{memory.polish=v;planningPage();}),checkbox('暗标模式预览',memory.dark,v=>{memory.dark=v;planningPage();}));root.append(controls);
    const list=node('div','demo-outline');memory.plan.forEach((c,index)=>{const info=node('div','demo-grow');info.append(node('strong','',c.title),node('p','demo-caption',(memory.weighted?'篇幅权重 '+c.weight+'%':'均衡篇幅')+' · '+memory.docType));const up=tool('arrow-up','上移 '+c.title,()=>moveChapter(index,-1)),down=tool('arrow-down','下移 '+c.title,()=>moveChapter(index,1));up.disabled=index===0;down.disabled=index===memory.plan.length-1;const entry=row(node('span','demo-number',index+1),info,tool('pencil','编辑目录 '+c.title,()=>editPlan(c)),up,down);entry.classList.add('demo-outline-row');list.append(entry);});
    const weight=bars(memory.plan.map(c=>[c.title.slice(0,9),memory.weighted?c.weight:Math.round(100/memory.plan.length)])),split=node('div','demo-split');split.append(section('目录调整预览',list),section('评分权重示例',weight,node('p','demo-caption','权重用于布局演示，不是当前招标文件的评分。')));root.append(split);
    const preview=node('div','demo-document');preview.append(node('p','demo-caption','虚构演示 / '+memory.docType),node('h2','','云溪产业园招聘与驻场服务投标方案'),node('p','',memory.dark?'投标人：投标人（暗标预览）':'投标人：'+demoCompany),node('p','demo-caption',`知识引用预览：${memory.caseRef?memory.selectedAssets.size:0} 项 · ${memory.polish?'润色预览开启':'润色预览关闭'}`));
    memory.plan.forEach(c=>{const d=node('details');d.open=c===memory.plan[0];d.append(node('summary','',c.title),node('p','',memory.docType==='商务标'?'商务响应示例：核对本章涉及的资质、报价及承诺材料，未确认事实保留待补充。':c.text));preview.append(d);});root.append(section('正文与明暗标预览',preview));icons();}
  function moveChapter(index,step){const next=index+step;if(next<0||next>=memory.plan.length)return;[memory.plan[index],memory.plan[next]]=[memory.plan[next],memory.plan[index]];planningPage();}
  function editPlan(chapter){const input=node('input');input.value=chapter.title;input.maxLength=80;input.required=true;show('编辑目录标题',field('章节标题',input),[action('取消',null,close),action('保存预览','save',()=>{if(!input.reportValidity())return;chapter.title=input.value.trim()||chapter.title;close();planningPage();},'primary')]);}
  function planText(){return '# 编制方案预览（虚构演示，非正式投标文件）\n\n标书类型：'+memory.docType+'\n企业：'+(memory.dark?'投标人（暗标预览）':demoCompany)+'\n\n'+memory.plan.map(c=>'## '+c.title+'\n\n'+(memory.docType==='商务标'?'商务材料与承诺待人工核对。':c.text)).join('\n\n');}

  const notificationItems=[
    {id:'notice-1',text:'桂语企业园样例 3 天后截标',time:'09:30',view:'opportunities'},
    {id:'notice-2',text:'示例标书有 2 项高风险待核对',time:'09:10',view:'review'},
    {id:'notice-3',text:'钱塘星谷样例合约进入预警期',time:'08:50',view:'expiry'},
    {id:'notice-4',text:'招聘交付标准示例已更新',time:'08:30',view:'knowledge'},
  ];
  function notifications(){const body=node('div');notificationItems.forEach(n=>{const text=node('div','demo-grow');text.append(action(n.text,null,()=>{memory.read.add(n.id);go(n.view);},'ghost'),node('p','demo-caption',snapshot+' '+n.time));const line=row(tag(memory.read.has(n.id)?'已读':'未读',memory.read.has(n.id)?'neutral':'info'),text);line.classList.add('demo-list-row');body.append(line);});show('通知中心（演示）',body,[action('全部标记已读','check-check',()=>{notificationItems.forEach(n=>memory.read.add(n.id));notifications();},'primary')]);}
  function assistant(){const body=node('div','demo-assistant'),quick=row(...['高匹配商机','竞争情况','投标风险'].map(q=>action(q,null,()=>sendChat(q),'secondary'))),log=node('div','demo-chat-log');log.id='demoChatLog';log.setAttribute('role','log');log.setAttribute('aria-label','演示对话');const form=node('form','demo-chat-form'),input=node('input');input.id='demoChatInput';input.placeholder='输入演示问题';input.setAttribute('aria-label','演示问题');input.maxLength=500;const send=tool('send','发送演示问题',()=>{});send.type='submit';form.append(input,send);form.onsubmit=e=>{e.preventDefault();sendChat(input.value);input.value='';};body.append(tag('预设回答 · 不调用模型','warning'),quick,log,form);show('鲸灵助手（演示）',body);renderChat();input.focus();}
  function sendChat(question){question=question.trim();if(!question)return;let reply='当前为预设问答。可查看高匹配商机、竞争情况或投标风险示例；真实文件分析请使用标书工作台。';
    if(/商机|匹配|推荐|本周/.test(question))reply='样例中云溪产业园匹配度 94%，桂语企业园匹配度 90%。这些是演示评分，不代表当前企业满足投标资格。';
    else if(/竞争|对手/.test(question))reply='示例竞争单位包括启航人才与嘉禾人才，均为虚构企业。标讯详情中可查看对应的样例项目数和竞争情况。';
    else if(/风险|废标|检查/.test(question))reply='样例报告列出证照页面缺失、暗标标识和响应不一致等风险。报告不会读取或修改当前真实标书。';
    memory.chat.push({role:'user',text:question},{role:'assistant',text:reply});memory.chat=memory.chat.slice(-20);renderChat();}
  function renderChat(){const log=$('demoChatLog');if(!log)return;log.replaceChildren();if(!memory.chat.length)log.append(node('p','demo-chat-message','鲸灵助手 · 演示对话'));for(const entry of memory.chat)log.append(node('p','demo-chat-message '+entry.role,entry.text));log.scrollTop=log.scrollHeight;}

  renderOverview();bidsPage();expiryPage();analyticsPage();reviewPage();templatesPage();knowledgePage();planningPage();
  const globalTools=row(tool('bell','通知中心（演示）',notifications),tool('messages-square','鲸灵助手（演示）',assistant));globalTools.classList.add('demo-global-tools');document.querySelector('.top-status').prepend(globalTools);icons();
}
