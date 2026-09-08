import * as pdfjs from '/static/vendor/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/static/vendor/pdf.worker.mjs';

const $ = id => document.getElementById(id);
const state = {csrf:'', status:{}, tasks:[], task:null, analysis:null, tab:'requirements', mode:'analysis',
  profile:null, draft:null, job:null, pdf:null, page:1, zoom:1, render:null, timer:null, view:'workbench'};
const labels = {extract:'文件读取',extracting:'提取招标文字',ocr:'识别图片与扫描页',analyze:'招标文件分析',analyzing:'AI 分析招标文件',verifying:'核对原文引用',generate:'编制投标初稿',regenerate:'重写章节',outlining:'构建投标目录',writing:'撰写投标章节',check_model:'检查模型连接'};
const statusLabels = {queued:'等待处理',running:'处理中',succeeded:'已完成',failed:'处理失败',cancelled:'已取消',interrupted:'已中断'};
const groups = {requirements:'指标需求', scores:'评分要求', risks:'废标红线'};
const active = () => state.job && ['queued','running'].includes(state.job.status);
const icons = () => window.lucide?.createIcons();

function el(tag, className='', text=null){const node=document.createElement(tag);if(className)node.className=className;if(text!==null)node.textContent=String(text);return node;}
function icon(name){const i=el('i');i.dataset.lucide=name;return i;}
function button(text, cls, fn, symbol){const b=el('button',cls);b.type='button';if(symbol)b.append(icon(symbol));if(text)b.append(document.createTextNode(text));b.addEventListener('click',()=>Promise.resolve(fn()).catch(notifyError));return b;}
function iconButton(name,title,fn){const b=button('', 'icon-button',fn,name);b.title=title;b.setAttribute('aria-label',title);return b;}
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').hidden=true,6000);}
function notifyError(error){notify(error.message||'操作未完成，请重试。');}
async function api(path, options={}){
  const headers={...options.headers};
  if(options.method && options.method!=='GET')headers['X-CSRF-Token']=state.csrf;
  if(options.body && !(options.body instanceof FormData)){headers['Content-Type']='application/json';options.body=JSON.stringify(options.body);}
  const response=await fetch('/api'+path,{...options,headers,credentials:'same-origin'});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error?.message||'请求未完成');
  return body;
}
function showModal(title, content, actions=[]){
  $('modalTitle').textContent=title;$('modalBody').replaceChildren(content);$('modalFooter').replaceChildren(...actions);
  if(!$('modal').open)$('modal').showModal();icons();
}
function closeModal(){$('modal').close();}
function confirmAction(title,text,action,label='确认'){
  const body=el('div');body.append(el('p','',text));
  showModal(title,body,[button('取消','button secondary',closeModal),button(label,'button primary',async()=>{closeModal();await action();})]);
}
function empty(title,subtitle,symbol='scan-text'){
  const box=el('div','empty-state'),visual=el('div','empty-symbol');visual.append(icon(symbol));box.append(visual,el('h3','',title),el('p','',subtitle));return box;
}
function tag(text,kind='neutral'){return el('span','tag '+kind,text);}
function metric(id,value,unit){$(id).replaceChildren(document.createTextNode(value===null?'—':String(value)),el('small','',unit));}
function date(value){return new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}

async function refreshStatus(){
  state.status=await api('/status');
  const chip=$('modelChip');chip.replaceChildren(el('span','status-dot'+(state.status.configured?'':' warning')),el('span','',state.status.configured?'DeepSeek 已配置':'DeepSeek 未配置'));
  $('uploadLimit').textContent=`PDF · 最大 ${state.status.max_mb} MB / ${state.status.max_pages} 页`;
  renderSettings();controls();
}
async function refreshTasks(){state.tasks=await api('/tasks');$('taskCount').textContent=state.tasks.length;renderHistory();}
function switchView(view){
  state.view=view;
  for(const name of ['workbench','history','company','settings'])$(name+'View').hidden=name!==view;
  for(const b of document.querySelectorAll('[data-view]'))b.classList.toggle('active',b.dataset.view===view);
  $('breadcrumb').textContent={workbench:'标书工作台',history:'我的任务',company:'企业资料',settings:'运行状态'}[view];
  $('pageTitle').textContent=view==='workbench'?'在线智能招投标Agent':{history:'我的投标任务',company:'企业资料',settings:'运行状态'}[view];
  $('sidebar').classList.remove('open');
  if(view==='history')refreshTasks().catch(notifyError);
  if(view==='workbench')setTimeout(()=>renderPdf().catch(notifyError),30);
}
function controls(){
  const busy=active();
  $('uploadBtn').disabled=busy;$('replaceBtn').disabled=busy;
  $('analyzeBtn').disabled=busy||!state.task?.extracted||!state.status.configured;
  $('analyzeBtn').title=state.status.configured?'真实调用 DeepSeek 分析全文':'请先在本机配置 DeepSeek API Key';
  $('generateBtn').disabled=busy||!state.analysis||!state.status.configured;
  $('exportBtn').disabled=busy||!state.draft?.chapters.some(c=>c.blocks.length);
  $('restoreBtn').disabled=busy||!state.draft||state.draft.revision<2;
  $('viewExtracted').disabled=!state.task?.extracted;
  $('analyzeBtn').hidden=state.mode==='draft';$('generateBtn').hidden=state.mode==='draft';$('exportBtn').hidden=state.mode!=='draft';
  $('step1').classList.toggle('active',state.mode==='analysis');$('step2').classList.toggle('active',state.mode==='draft');
  $('step3').classList.toggle('active',state.mode==='draft'&&state.draft?.status==='ready');
}
async function uploadFile(file){
  if(!file)return;
  if(active())throw new Error('请等待当前任务完成或先取消。');
  if(!file.name.toLowerCase().endsWith('.pdf'))throw new Error('仅支持 PDF 文件。');
  if(file.size>state.status.max_mb*1024*1024)throw new Error('文件超过上传大小限制。');
  $('uploadBtn').disabled=true;
  const data=new FormData();data.append('file',file);
  try{
    const result=await api('/tasks',{method:'POST',body:data});
    await openTask(result.task.id);trackJob(result.job);notify('文件已保存到本机，开始读取。');
  }finally{controls();$('fileInput').value='';}
}
async function openTask(id){
  state.task=await api('/tasks/'+id);state.analysis=await api('/tasks/'+id+'/analysis');state.draft=null;
  state.page=1;state.zoom=1;state.selectedEvidence=null;state.tab='requirements';$('resultSearch').value='';
  $('fileName').textContent=state.task.filename;$('fileName').title=state.task.filename;
  $('fileMeta').textContent='PDF · '+(state.task.size<1048576?`${Math.ceil(state.task.size/1024)} KB`:`${(state.task.size/1048576).toFixed(1)} MB`);
  $('dropZone').hidden=true;$('pdfToolbar').hidden=false;$('pdfViewport').hidden=false;
  switchView('workbench');setMode('analysis');renderAnalysis();updateTaskMeta();
  if(state.pdf){await state.pdf.destroy();state.pdf=null;}
  const loading=pdfjs.getDocument({url:'/api/tasks/'+id+'/source',isEvalSupported:false,
    cMapUrl:'/static/vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'/static/vendor/standard_fonts/'});
  const pdf=await loading.promise;
  if(state.task.id!==id){await pdf.destroy();return;}
  state.pdf=pdf;$('pageNumber').max=pdf.numPages;$('pageTotal').textContent='/ '+pdf.numPages;
  await renderPdf();
  renderDraftOptions();
  if(state.task.drafts.length){await loadDraft(state.task.drafts.at(-1).id);setMode('analysis');}
  await refreshTasks();
  const latest=state.tasks.find(t=>t.id===id)?.latest_job;
  if(latest)trackJob(latest);else{$('jobStrip').hidden=true;state.job=null;}
  controls();icons();
}
function updateTaskMeta(){
  const task=state.task;if(!task)return;
  metric('metricPages',task.page_count||null,'页');
  $('extractionLabel').textContent=task.extracted?`已提取 ${task.page_count} 页${task.ocr_pages?' · OCR '+task.ocr_pages+' 页':''}`:'正在读取文件';
  $('savedTime').textContent='已保存 '+date(task.created_at);
}
async function renderPdf(evidence=null){
  if(!state.pdf||state.view!=='workbench')return;
  if(evidence)state.selectedEvidence=evidence;
  const requestId=state.renderVersion=(state.renderVersion||0)+1;
  if(state.render){state.render.cancel();try{await state.render.promise;}catch{}state.render=null;}
  const pdf=state.pdf,pageNumber=Math.max(1,Math.min(state.page,pdf.numPages));state.page=pageNumber;
  const page=await pdf.getPage(pageNumber);if(pdf!==state.pdf||requestId!==state.renderVersion)return;
  const base=page.getViewport({scale:1});const available=Math.max(280,$('pdfViewport').clientWidth-32);
  const scale=available/base.width*state.zoom;
  const viewport=page.getViewport({scale});const ratio=Math.min(window.devicePixelRatio||1,2);
  const canvas=$('pdfCanvas');canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);
  canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
  const render=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});state.render=render;
  try{await render.promise;}catch(error){if(error.name!=='RenderingCancelledException')throw error;return;}
  if(state.render===render)state.render=null;
  $('pageNumber').value=pageNumber;$('zoomLabel').textContent=Math.round(state.zoom*100)+'%';
  $('prevPage').disabled=pageNumber<=1;$('nextPage').disabled=pageNumber>=pdf.numPages;
  $('highlight').hidden=true;
  const selected=state.selectedEvidence;
  if(selected?.bbox&&selected.page===pageNumber){const [x1,y1,x2,y2]=selected.bbox;Object.assign($('highlight').style,{left:x1*scale+'px',top:y1*scale+'px',width:(x2-x1)*scale+'px',height:(y2-y1)*scale+'px'});$('highlight').hidden=false;if(evidence)$('highlight').scrollIntoView({block:'center',behavior:'smooth'});}
}
function showPane(result){$('workbench').classList.toggle('mobile-result',result);$('showSource').classList.toggle('active',!result);$('showResult').classList.toggle('active',result);if(!result)setTimeout(()=>renderPdf().catch(notifyError),20);}
async function jump(evidence){if(!evidence.page){notify('这条引用未能定位到原文。');return;}closeModal();state.page=evidence.page;switchView('workbench');showPane(false);await renderPdf(evidence);}
function sourceButtons(item){
  const box=el('div','sources');
  item.evidence.slice(0,3).forEach(e=>{const b=button(e.page?'第 '+e.page+' 页':'来源待核对','source-link',()=>showEvidence(item),'file-search');box.append(b);});
  if(!item.evidence.length)box.append(tag('无原文依据','warning'));
  return box;
}
function showEvidence(item){
  const body=el('div');body.append(el('p','muted',item.name));
  for(const e of item.evidence){const block=el('div','evidence-detail');block.append(button(e.page?'PDF 第 '+e.page+' 页':'来源未匹配','text-button',()=>jump(e),'external-link'),tag(e.status==='matched'?'引用已验证':e.status==='needs_review'?'OCR 待核对':'引用未匹配',e.status==='matched'?'success':'warning'),el('blockquote','',e.quote));body.append(block);}
  body.append(el('p','muted','引用验证仅表示摘录与提取文本匹配，仍需核对条款的适用范围。'));
  showModal('原文依据',body,[button('关闭','button secondary',closeModal)]);
}
function renderAnalysis(){
  const analysis=state.analysis?.analysis;
  for(const group of Object.keys(groups)){$(group+'Count').textContent=analysis?.[group].length||0;}
  metric('metricRequirements',analysis?analysis.requirements.length:null,'项');metric('metricScores',analysis?analysis.scores.length:null,'项');metric('metricRisks',analysis?analysis.risks.length:null,'项');
  document.querySelectorAll('[data-tab]').forEach(b=>{const selected=b.dataset.tab===state.tab;b.classList.toggle('active',selected);b.setAttribute('aria-selected',selected);});
  $('analysisSummary').hidden=!analysis;$('resultFilter').hidden=!analysis;
  if(!analysis){$('analysisContent').replaceChildren(empty('暂无解析结果',state.task?.extracted?'文件提取完成，等待 AI 分析':'等待招标文件'));controls();icons();return;}
  $('analysisSummary').className='analysis-summary';$('analysisSummary').replaceChildren(el('strong','',analysis.project_name||state.task.filename),el('span','',analysis.business_type+' · 分析版本 '+state.analysis.revision));
  const query=$('resultSearch').value.toLowerCase();const items=analysis[state.tab].filter(i=>JSON.stringify(i).toLowerCase().includes(query));
  const content=$('analysisContent');content.replaceChildren();
  if(!items.length){content.append(empty(query?'没有匹配条目':'本类暂无提取结果',query?'尝试其他关键词':'不代表原文不存在相关要求，请核对全文'));icons();return;}
  if(state.tab==='risks'){
    const names={invalid:['明确无效投标条件','danger'],mandatory:['实质性响应要求','warning'],review:['待人工确认风险','neutral'],'':['待分类','neutral']};
    for(const item of items){
      const row=el('article','risk-row'),header=el('header'),heading=el('div');heading.append(tag(...(names[item.risk_type]||names.review)),el('h3','',item.name));
      const edit=iconButton('pencil','编辑风险条款',()=>editItem(item));edit.disabled=active();header.append(heading,edit);row.append(header,el('p','',item.value));
      if(item.consequence)row.append(el('p','consequence','后果：'+item.consequence));row.append(sourceButtons(item));content.append(row);
    }
  }else{
    const table=el('table'),thead=el('thead'),hr=el('tr');
    const columns=state.tab==='scores'?['评分项 / 得分条件','分值','操作']:['指标 / 响应要求','操作'];columns.forEach(t=>hr.append(el('th','',t)));thead.append(hr);table.append(thead);const tbody=el('tbody');
    for(const item of items){const row=el('tr'),cell=el('td');cell.append(el('div','item-category',item.package+' · '+item.category),el('span','item-name',item.name),el('div','item-value',item.value));
      if(item.materials)cell.append(el('div','consequence','证明材料：'+item.materials));
      if(item.edited)cell.append(tag('人工修改','info'));cell.append(sourceButtons(item));row.append(cell);
      if(state.tab==='scores')row.append(el('td','numeric',item.points||'待确认'));
      const action=el('td'),edit=iconButton('pencil','编辑 '+item.name,()=>editItem(item));edit.disabled=active();edit.classList.add('item-edit');action.append(edit);row.append(action);tbody.append(row);
    }table.append(tbody);content.append(table);
  }
  controls();icons();
}
function editItem(item){
  const form=el('div','edit-form'),fields={};
  const definitions=[['name','条目名称'],['value','原文要求'],['points','分值或权重'],['materials','证明材料'],['suggestion','响应建议'],['consequence','触发后果']];
  for(const [key,label]of definitions){if(state.tab!=='scores'&&key==='points')continue;if(state.tab!=='risks'&&key==='consequence')continue;const l=el('label','',label),input=el(key==='name'||key==='points'?'input':'textarea');input.value=item[key]||'';input.maxLength=10000;l.append(input);form.append(l);fields[key]=input;}
  if(state.tab==='risks'){const l=el('label','','风险分类'),select=el('select');for(const [value,text] of [['invalid','明确无效投标条件'],['mandatory','实质性响应要求'],['review','待人工确认风险']]){const option=el('option','',text);option.value=value;select.append(option);}select.value=item.risk_type||'review';fields.risk_type=select;l.append(select);form.append(l);}
  form.append(el('p','muted','原始结果保留在历史版本中；原文引用保持关联。'));
  const originalRevision=state.analysis.revision,group=state.tab;
  showModal('编辑'+groups[group],form,[button('取消','button secondary',closeModal),button('保存修改','button primary',async()=>{
    const copy=structuredClone(state.analysis.analysis),target=copy[group].find(i=>i.id===item.id);for(const [key,input]of Object.entries(fields))target[key]=input.value;target.edited=true;
    state.analysis=await api('/tasks/'+state.task.id+'/analysis',{method:'PUT',body:{revision:originalRevision,analysis:copy}});closeModal();renderAnalysis();notify('修改已保存，生成初稿将使用新版本。');
  },'save')]);
}
async function startAnalysis(){
  confirmAction(state.analysis?'重新分析招标文件':'AI 解析招标文件','将本任务提取的招标文本发送至 DeepSeek 官方 API 进行真实分析，可能产生模型费用。文件本身与页面图片保存在本机。',async()=>{
    trackJob(await api('/tasks/'+state.task.id+'/analyze',{method:'POST',body:{consent:true}}));
  },'确认并分析');
}
async function startGeneration(){
  const incomplete=state.analysis.analysis.warnings.length;
  confirmAction('生成投标初稿',`将相关招标文本和当前企业资料发送至 DeepSeek。${incomplete?'解析结果仍有待核对事项，将同时保留在初稿中。':''}未提供的企业事实会标为待补充。`,async()=>{
    const result=await api('/tasks/'+state.task.id+'/drafts',{method:'POST',body:{consent:true,allow_incomplete:true}});
    await loadDraft(result.draft_id);setMode('draft');trackJob(result.job);state.task=await api('/tasks/'+state.task.id);renderDraftOptions();
  },'确认并生成');
}
function setMode(mode){state.mode=mode;$('analysisPanel').hidden=mode!=='analysis';$('draftPanel').hidden=mode!=='draft';document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));controls();}
function renderDraftOptions(){
  const select=$('draftSelect');select.replaceChildren();
  for(const d of state.task?.drafts||[]){const option=el('option','',date(d.created_at)+' · '+d.title);option.value=d.id;select.append(option);}
  if(!select.options.length)select.append(el('option','','暂无初稿'));if(state.draft)select.value=state.draft.id;
}
async function loadDraft(id){state.draft=await api('/drafts/'+id);renderDraft();controls();}
function renderDraft(){
  const content=$('draftContent');content.replaceChildren();const draft=state.draft;
  if(!draft){content.append(empty('暂无投标初稿','等待招标解析完成','notebook-pen'));icons();return;}
  if(draft.stale)content.append(el('div','notice','企业资料或解析结果已有更新。当前初稿保留生成时的输入版本。'));
  if(draft.is_demo)content.append(el('div','notice','含虚构企业资料，仅供演示。'));
  if(!draft.chapters.length)content.append(empty('正在构建目录','等待模型返回章节结构','notebook-pen'));
  for(const chapter of draft.chapters){const article=el('article','draft-chapter'),header=el('header'),actions=el('div','chapter-actions');header.append(el('h3','',chapter.title));
    const edit=iconButton('pencil','编辑章节',()=>editChapter(chapter));edit.disabled=active()||!chapter.blocks.length;
    const regenerate=iconButton('refresh-cw','重新生成章节',()=>confirmAction('重新生成章节','此操作调用 DeepSeek 并覆盖当前章节，上一版本可恢复。',async()=>{trackJob(await api(`/drafts/${draft.id}/chapters/${chapter.id}/regenerate`,{method:'POST'}));}));regenerate.disabled=active()||!state.status.configured;
    actions.append(edit,regenerate);header.append(actions);article.append(header);
    if(chapter.edited)article.append(tag('人工修改','info'));
    if(!chapter.blocks.length)article.append(el('p','muted','等待生成'));
    for(const block of chapter.blocks)appendBlock(article,block);
    for(const p of chapter.pending)article.append(el('p','pending','【待补充】'+p));content.append(article);
  }
  if(draft.coverage.length){const box=el('section','draft-chapter');box.append(el('h3','','响应覆盖清单'));for(const row of draft.coverage)box.append(el('p','muted',row.name+'：'+row.status));content.append(box);}
  icons();
}
function appendBlock(parent,block){
  if(block.type==='paragraph')parent.append(el('p','',block.text));
  else if(block.type==='list'){const list=el('ul');block.items.forEach(text=>list.append(el('li','',text)));parent.append(list);}
  else if(block.type==='table'){const wrap=el('div','modal-table-wrap'),table=el('table'),head=el('tr');block.headers.forEach(t=>head.append(el('th','',t)));table.append(head);for(const cells of block.rows){const row=el('tr');cells.forEach(t=>row.append(el('td','',t)));table.append(row);}wrap.append(table);parent.append(wrap);}
}
function editChapter(chapter){
  const copy=structuredClone(chapter),form=el('div','edit-form');const titleLabel=el('label','','章节标题'),title=el('input');title.value=chapter.title;titleLabel.append(title);form.append(titleLabel);
  for(const [index,block]of copy.blocks.entries()){
    const label=el('label','',`内容 ${index+1} · ${block.type==='table'?'表格':block.type==='list'?'列表':'段落'}`);
    if(block.type==='paragraph'||block.type==='list'){const input=el('textarea');input.rows=6;input.value=block.type==='paragraph'?block.text:block.items.join('\n');input.addEventListener('input',()=>{if(block.type==='paragraph')block.text=input.value;else block.items=input.value.split('\n');});label.append(input);}
    else{const wrap=el('div','modal-table-wrap'),table=el('table');[block.headers,...block.rows].forEach((cells,rowIndex)=>{const row=el('tr');cells.forEach((text,column)=>{const cell=el('td'),input=el('input');input.value=text;input.setAttribute('aria-label',`表格 ${rowIndex+1} 行 ${column+1} 列`);input.addEventListener('input',()=>cells[column]=input.value);cell.append(input);row.append(cell);});table.append(row);});wrap.append(table);label.append(wrap);}form.append(label);
  }
  const revision=state.draft.revision,id=state.draft.id;
  showModal('编辑投标章节',form,[button('取消','button secondary',closeModal),button('保存章节','button primary',async()=>{copy.title=title.value;state.draft=await api(`/drafts/${id}/chapters/${chapter.id}`,{method:'PUT',body:{revision,chapter:copy}});closeModal();renderDraft();notify('章节已保存。');},'save')]);
}
function trackJob(job){state.job=job;clearTimeout(state.timer);renderJob();controls();if(active())state.timer=setTimeout(pollJob,900);}
async function pollJob(){
  try{
    const previous=state.job;state.job=await api('/jobs/'+previous.id);renderJob();controls();
    if(state.draft&&['generate','regenerate'].includes(state.job.kind)){await loadDraft(state.draft.id);}
    if(active()){state.timer=setTimeout(pollJob,1200);return;}
    if(state.task&&state.job.task_id===state.task.id){state.task=await api('/tasks/'+state.task.id);state.analysis=await api('/tasks/'+state.task.id+'/analysis');updateTaskMeta();renderAnalysis();renderDraftOptions();}
    await refreshTasks();await refreshStatus();
    if(state.job.status==='succeeded')notify('任务已完成。');else if(state.job.error)notify(state.job.error);
  }catch(error){notifyError(error);state.timer=setTimeout(pollJob,4000);}
}
function renderJob(){
  const job=state.job;if(!job){$('jobStrip').hidden=true;return;}
  $('jobStrip').hidden=false;$('jobStrip').classList.toggle('done',!active());
  document.querySelector('.job-symbol').replaceChildren(icon(active()?'loader-circle':job.status==='succeeded'?'circle-check':'circle-alert'));
  $('jobLabel').textContent=(labels[job.stage]||'处理任务')+' · '+statusLabels[job.status];
  $('jobDetail').textContent=job.error||(job.total?`${job.completed} / ${job.total}`:'准备中');
  $('jobProgress').style.width=(job.total?Math.min(100,job.completed/job.total*100):0)+'%';
  $('cancelBtn').hidden=!active();$('retryBtn').hidden=!['failed','cancelled','interrupted'].includes(job.status);
  icons();
}
function renderHistory(){
  const tbody=$('historyBody');tbody.replaceChildren();const query=$('historySearch').value.toLowerCase();
  const tasks=state.tasks.filter(t=>t.filename.toLowerCase().includes(query));
  for(const task of tasks){const row=el('tr'),name=el('td'),open=button(task.filename,'text-button',()=>openTask(task.id),'file-text');name.append(open);const status=task.latest_job?.status;row.append(name,el('td','mono',date(task.created_at)),el('td','numeric',task.page_count||'—'));const badge=el('td');badge.append(tag(statusLabels[status]||'已上传',status==='succeeded'?'success':status==='failed'?'danger':'neutral'));row.append(badge);const actions=el('td'),box=el('div','inline-actions');box.append(button('打开','text-button',()=>openTask(task.id)),iconButton('trash-2','删除任务',()=>confirmAction('删除任务','将删除该任务的原始文件、解析结果、初稿及导出物，无法恢复；不会撤回已发送至 DeepSeek 的数据。',async()=>{await api('/tasks/'+task.id,{method:'DELETE'});if(state.task?.id===task.id)location.reload();else await refreshTasks();notify('任务及关联本地文件已删除。');},'删除')));actions.append(box);row.append(actions);tbody.append(row);}
  if(!tasks.length){const row=el('tr'),cell=el('td','empty-row','暂无投标任务');cell.colSpan=5;row.append(cell);tbody.append(row);}icons();
}
async function loadProfile(){state.profile=await api('/company-profile');for(const key of ['name','capabilities','qualifications','cases','team'])$('companyForm').elements[key].value=state.profile[key];$('companyForm').elements.is_demo.checked=state.profile.is_demo;$('companyRevision').textContent=state.profile.revision?'已保存 · 版本 '+state.profile.revision:'尚未提供';}
function renderSettings(){
  const container=$('settingsList');container.replaceChildren();
  const rows=[['DeepSeek 官方 API','Key 仅服务端读取；连接检查将发出一次小额模型请求。',state.status.configured?'已配置':'未配置',state.status.configured?'success':'warning'],['分析与生成模型','模型 ID 可在本机配置文件中调整。',state.status.model||'—','neutral'],['本地 OCR','RapidOCR / ONNX · 中文识别模型',state.status.ocr_ready?'已就绪':'不可用',state.status.ocr_ready?'success':'warning'],['文件限制','文字型、扫描型及图文混合型 PDF',`${state.status.max_mb||50} MB / ${state.status.max_pages||150} 页`,'neutral'],['数据存储','文件、任务和导出结果保存在本机 data 目录。','本地 SQLite','info']];
  for(const [title,detail,status,kind]of rows){const row=el('div','setting-row'),text=el('div');text.append(el('h3','',title),el('p','',detail));row.append(text,tag(status,kind));container.append(row);}$('modelCheckBtn').disabled=!state.status.configured;icons();
}
function showWarnings(){const body=el('div'),warnings=state.analysis?.analysis.warnings||state.task?.warnings||[];for(const text of warnings)body.append(el('p','',text));if(!warnings.length)body.append(el('p','','暂无自动识别的警告；仍需人工审核。'));showModal('待核对事项',body,[button('关闭','button secondary',closeModal)]);}

$('modalClose').onclick=closeModal;$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;renderAnalysis();});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('menuBtn').onclick=()=>$('sidebar').classList.toggle('open');$('modelChip').onclick=()=>switchView('settings');$('historyBtn').onclick=()=>switchView('history');
for(const id of ['uploadBtn','replaceBtn'])$(id).onclick=()=>$('fileInput').click();
$('fileInput').onchange=()=>uploadFile($('fileInput').files[0]).catch(notifyError);
$('dropZone').onclick=()=>{if(!active())$('fileInput').click();};$('dropZone').onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();$('fileInput').click();}};
for(const event of ['dragenter','dragover'])$('dropZone').addEventListener(event,e=>{e.preventDefault();$('dropZone').classList.add('dragging');});
for(const event of ['dragleave','drop'])$('dropZone').addEventListener(event,e=>{e.preventDefault();$('dropZone').classList.remove('dragging');if(event==='drop')uploadFile(e.dataTransfer.files[0]).catch(notifyError);});
$('prevPage').onclick=()=>{state.page--;renderPdf().catch(notifyError);};$('nextPage').onclick=()=>{state.page++;renderPdf().catch(notifyError);};$('pageNumber').onchange=()=>{state.page=Number($('pageNumber').value)||1;renderPdf().catch(notifyError);};
$('zoomOut').onclick=()=>{state.zoom=Math.max(.5,state.zoom-.25);renderPdf().catch(notifyError);};$('zoomIn').onclick=()=>{state.zoom=Math.min(3,state.zoom+.25);renderPdf().catch(notifyError);};$('fitPage').onclick=()=>{state.zoom=1;renderPdf().catch(notifyError);};
$('showSource').onclick=()=>showPane(false);$('showResult').onclick=()=>showPane(true);
$('analyzeBtn').onclick=()=>startAnalysis().catch(notifyError);$('generateBtn').onclick=()=>startGeneration().catch(notifyError);
$('resultSearch').oninput=renderAnalysis;$('historySearch').oninput=renderHistory;$('warningsBtn').onclick=showWarnings;
$('cancelBtn').onclick=()=>confirmAction('取消当前任务','将停止后续处理，已发出的模型请求仍可能计费。',async()=>{await api('/jobs/'+state.job.id+'/cancel',{method:'POST'});notify('已请求取消。');},'取消任务');
$('retryBtn').onclick=()=>api('/jobs/'+state.job.id+'/retry',{method:'POST'}).then(trackJob).catch(notifyError);
$('draftSelect').onchange=()=>loadDraft($('draftSelect').value).catch(notifyError);
$('restoreBtn').onclick=()=>confirmAction('恢复上一个版本','将恢复上一版初稿内容，当前版本仍会保留。',async()=>{state.draft=await api('/drafts/'+state.draft.id+'/restore',{method:'POST'});renderDraft();notify('已恢复上一版本。');});
$('exportBtn').onclick=async()=>{try{const result=await api('/drafts/'+state.draft.id+'/exports',{method:'POST'});const link=el('a');link.href='/api/exports/'+result.id+'/download';link.download='投标方案初稿.docx';document.body.append(link);link.click();link.remove();notify('Word 初稿已导出，请人工审核后使用。');}catch(error){notifyError(error);}};
$('companyForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,body={revision:state.profile.revision,is_demo:form.elements.is_demo.checked};for(const key of ['name','capabilities','qualifications','cases','team'])body[key]=form.elements[key].value;try{state.profile=await api('/company-profile',{method:'PUT',body});$('companyRevision').textContent='已保存 · 版本 '+state.profile.revision;notify('企业资料已保存到本机。');}catch(error){notifyError(error);}};
$('modelCheckBtn').onclick=()=>api('/model/check',{method:'POST'}).then(job=>{switchView('workbench');trackJob(job);}).catch(notifyError);
$('viewExtracted').onclick=async()=>{try{const pages=await api('/tasks/'+state.task.id+'/pages');const content=el('div');for(const page of pages){content.append(el('h3','',`PDF 第 ${page.page} 页`),el('pre','text-preview',page.blocks.map(b=>b.text).join('\n')));}showModal('提取文本',content,[button('关闭','button secondary',closeModal)]);}catch(error){notifyError(error);}};
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderPdf().catch(notifyError),200);});

async function init(){
  const session=await api('/session');state.csrf=session.csrf;
  await Promise.all([refreshStatus(),refreshTasks(),loadProfile()]);icons();
  if(state.status.active_jobs.length){const job=state.status.active_jobs[0];if(job.task_id!=='system')await openTask(job.task_id);trackJob(job);}
}
init().catch(notifyError);
