const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const stages=['需求拆解','资料检索','证据整理','对比分析','报告生成'];
const descriptions=['正在把你的诉求拆成可确认的问题和检索计划。','正在搜集公开资料，并筛掉与目标产品无关的结果。','正在提取参数、核对型号与原文，并检查证据缺口。','正在把证据整理成产品对比和有依据的技术主题。','正在整合答案、核对引用，并审查报告的适用边界。'];
const tips=['不同地区与套装的规格可能不同，比较时先确认版本。','额定功率与峰值功率不能直接放在同一列排名。','整机重量不等于电池包重量，能量密度需要统一口径。','检索到一份资料不等于结论已证实，原文和适用条件仍需核对。','轮播是等待时的产品速览，不会自动成为本次调研的证据。'];
const active=task=>['running','planning','queued'].includes(task?.status);
export function stageModel(task){
  const research=task.research||{},phase=Math.max(0,Math.min(4,Number(task.phaseIndex)||0));
  let fraction=null,label='当前环节尚无可计数的子任务',activity='';
  if(task.status==='queued')return {phase,title:'任务已排队',description:'等待当前研究结束后依次执行，暂不估计开始时间。',activity:'已保存诉求，轮到本任务时自动开始',fraction:null,label:'等待执行',units:0};
  if(phase===0)activity=research.plan?.delivery?.autoStart?'正在整理精准查询，随后直接回答你的问题':'正在制定研究计划，复杂研究完成后需要你确认';
  if(phase===1){const live=research.searchProgress||{},runs=research.queryRuns||[],total=Number(live.totalQueries||runs.length||research.plan?.queries?.length||0),done=runs.length?runs.filter(row=>['completed','failed'].includes(row.status)).length:Number(live.completedQueries||0);if(total>0){fraction=Math.min(1,done/total);label='已处理查询 '+done+' / '+total;}activity=live.currentQueries?.length?'正在检索 '+live.currentQueries.length+' 个问题：'+live.currentQueries.join(' / '):live.currentQuery||'正在检索和审查公开来源';}
  if(phase===2){const progress=research.evidenceProgress||{},audit=research.auditProgress||{},done=Number(progress.completed||0),total=Number(progress.total||0);if(/独立事实核验/.test(research.currentActivity||'')&&audit.total){fraction=Math.min(1,audit.completed/audit.total);label='已核验事实 '+audit.completed+' / '+audit.total+(audit.reused?' · 复用 '+audit.reused+' 项':'');activity=research.currentActivity;}else if(total>0&&done<total){fraction=Math.min(1,done/total);label='已整理来源 '+done+' / '+total+(progress.reusedSources?' · 复用 '+progress.reusedSources+' 条':'');activity=research.currentActivity||'正在整理证据';}else {label=total?'来源提取已完成，正在核验或补查':'正在逐项核对证据';activity=research.currentActivity||'核对产品型号、参数条件与原文依据';}}
  if(phase===3){const checkpoint=research.technicalCheckpoint||{},done=(checkpoint.routes||[]).filter(Boolean).length,total=(checkpoint.outline||[]).length;if(total){fraction=Math.min(1,done/total);label='已保存主题 '+done+' / '+total;}activity=research.currentActivity||'正在分析产品差异和技术实现';}
  if(phase===4){
    const progress=/独立复核/.test(research.currentActivity||'')?research.answerReviewCheckpoint?.progress:research.reportIntegration?.progress;
    if(progress?.total){fraction=Math.min(1,Number(progress.completed||0)/progress.total);label='已保存 '+Number(progress.completed||0)+' / '+progress.total+' 段'+(progress.reused?' · 复用 '+progress.reused+' 段':'');}
    else label='生成、复核与必要修订耗时不固定';
    activity=research.currentActivity||(research.contentRevision?.status==='running'?'按独立复核意见修订报告':'整合报告并进行独立复核');
  }
  return {phase,title:stages[phase]+'中',description:descriptions[phase],activity,fraction,label,units:phase};
}
export function renderWaitingRoom(task){
  if(!active(task))return '';
  return '<div class="research-waiting" data-wait-task="'+esc(task.id)+'"><section class="wait-live"><div class="wait-live-heading"><div><span class="wait-eyebrow"><i></i> RESEARCH IN PROGRESS</span><h2 data-wait-title></h2><p data-wait-description></p></div><div class="wait-clock"><span>本页等待</span><strong data-wait-clock>00:00</strong><small>非剩余时间</small></div></div><div class="wait-rail" aria-label="研究阶段">'+stages.map((stage,index)=>'<div data-wait-phase="'+index+'"><i>'+String(index+1).padStart(2,'0')+'</i><span>'+stage+'</span><b></b></div>').join('')+'</div><div class="wait-now"><div class="wait-now-label"><i></i><span>当前处理</span><small data-wait-fresh></small></div><strong data-wait-activity></strong><div class="wait-meter" role="progressbar" aria-label="当前环节进度"><span></span></div><div class="wait-meter-caption"><span data-wait-caption></span><small>按实际结果更新 · 不预测完成时间</small></div></div></section><section class="product-showcase" aria-label="等待期间的产品速览"><header><div><span class="wait-eyebrow">PRODUCT SPOTLIGHT</span><h3>等一份报告，认识一款产品</h3><p>来自部门规格库 · 独立于本次研究结论</p></div><div class="showcase-controls"><button type="button" data-wait-action="previous" aria-label="上一款产品">←</button><button type="button" data-wait-action="toggle" aria-pressed="false">暂停轮播</button><button type="button" data-wait-action="next" aria-label="下一款产品">→</button></div></header><div class="showcase-content"><div class="showcase-placeholder"><span class="catalog-loader"></span><strong>正在读取产品规格库</strong><p>加载不会阻塞你的调研；稍后也可以手动重试。</p></div></div><div class="showcase-footer"><span data-showcase-note>正在连接部门产品规格库…</span><div class="showcase-cycle"><span></span></div><small data-showcase-count></small></div></section><div class="wait-bottom"><span>✦</span><p data-wait-tip></p><small>可以切换页面做其他工作，保持后台工作台运行即可。</small></div></div>';
}

let task=null,root=null,api=null,ticker=null,visible=true,online=true,deck=[],feed=null,feedError='',pending=null,index=0,paused=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,hovered=false;
let cycle=0,lastTick=Date.now(),lastPaint='',lastProduct='',tipIndex=0;
const visits=new Map(),cycleMs=10000;
function shuffle(items){const result=[...items];for(let n=result.length-1;n>0;n--){const j=Math.floor(Math.random()*(n+1));[result[n],result[j]]=[result[j],result[n]];}return result;}
function secondsLabel(seconds){const n=Math.max(0,Math.floor(seconds));return n>=3600?String(Math.floor(n/3600)).padStart(2,'0')+':'+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0'):String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function select(step){if(!deck.length)return;index=(index+step+deck.length)%deck.length;cycle=0;lastTick=Date.now();paintProduct(true);}
function paintProduct(force=false){
  if(!root)return;
  const box=root.querySelector('.showcase-content'),product=deck[index];
  root.querySelectorAll('[data-wait-action="previous"],[data-wait-action="next"],[data-wait-action="toggle"]').forEach(button=>button.disabled=!deck.length);
  const toggle=root.querySelector('[data-wait-action="toggle"]');toggle.textContent=paused?'继续轮播':'暂停轮播';toggle.setAttribute('aria-pressed',String(paused));
  if(product){
    if(lastProduct!==product.id||!box.querySelector('.spotlight-card')){
      const changing=Boolean(box.querySelector('.spotlight-card'));
      lastProduct=product.id;
      box.innerHTML='<article class="spotlight-card"><div class="spotlight-visual"><span class="spotlight-brand">'+esc(product.brand||'PRODUCT')+'</span><div class="spotlight-fallback" aria-hidden="true"><span>▥</span><small>PRODUCT LIBRARY</small></div>'+(product.imageUrl?'<img src="'+esc(product.imageUrl)+'" alt="'+esc(product.name)+' 产品图片" referrerpolicy="no-referrer" loading="lazy">':'')+'<span class="spotlight-category">'+esc(product.category||'产品记录')+'</span></div><div class="spotlight-body"><div class="spotlight-product-meta">'+esc(product.brand)+' <span>· '+esc(product.regions.join(' / ')||'地区未注明')+'</span></div><h4>'+esc(product.name)+'</h4><p class="spotlight-summary">'+esc([product.category,product.series,product.chemistry].filter(Boolean).join(' · '))+'</p><div class="spotlight-metrics">'+product.metrics.map(metric=>'<div><small>'+esc(metric.label)+'</small><strong>'+esc(metric.value)+'</strong></div>').join('')+'</div><div class="spotlight-tags">'+product.tags.map(tag=>'<span>'+esc(tag)+'</span>').join('')+'</div><dl class="spotlight-features">'+product.features.slice(0,2).map(item=>'<div><dt>'+esc(item.label)+'</dt><dd>'+esc(item.value)+'</dd></div>').join('')+'</dl><div class="spotlight-links"><a href="'+esc(product.catalogUrl)+'" target="_blank" rel="noopener noreferrer">在规格库查看 ↗</a>'+(product.officialUrl?'<a href="'+esc(product.officialUrl)+'" target="_blank" rel="noopener noreferrer">产品官网 ↗</a>':'')+'<small>记录复核：'+esc(product.verifiedDate||'未注明')+'</small></div></div></article>';
      // Reset only the product viewport; never focus or scroll the document.
      box.scrollTop=0;box.scrollLeft=0;
      const card=box.querySelector('.spotlight-card');if(changing&&!matchMedia('(prefers-reduced-motion: reduce)').matches)card.animate([{opacity:0,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],{duration:480,easing:'ease-out'});
      const upcoming=deck[(index+1)%deck.length];if(upcoming?.imageUrl){const preload=new Image();preload.referrerPolicy='no-referrer';preload.src=upcoming.imageUrl;}
      const image=box.querySelector('img');if(image)image.addEventListener('error',()=>image.remove(),{once:true});
    }
    root.querySelector('[data-showcase-count]').textContent=(index+1)+' / '+deck.length+' 款 · 随机顺序';
    root.querySelector('[data-showcase-note]').textContent=feed.status==='stale_cache'?'网站暂不可用，使用 '+feed.retrievedAt.slice(0,10)+' 的缓存，请复核最新规格。':(paused?'已暂停自动切换':hovered?'阅读中，暂不切换':'每10秒切换，可手动暂停')+' · 规格库整理值，非独立核验';
  }else if(feedError){box.innerHTML='<div class="showcase-placeholder is-unavailable"><strong>产品速览暂时无法读取</strong><p>'+esc(feedError)+'</p><button type="button" data-wait-action="retry">重新读取规格库</button><a href="https://hellotech2.pages.dev/" target="_blank" rel="noopener noreferrer">直接打开规格库 ↗</a></div>';root.querySelector('[data-showcase-note]').textContent='仅产品速览不可用，不影响调研执行';}
}
async function loadFeed(){
  if(feed||pending)return pending;
  pending=(async()=>{try{const result=await api('/api/catalog/spotlight');if(!Array.isArray(result.products)||!result.products.length)throw Error('规格库当前没有可展示的产品。');feed=result;deck=shuffle(result.products);index=0;feedError='';}catch(error){feedError=error.message;}finally{pending=null;paintProduct(true);}})();
  return pending;
}
function paint(){
  if(!root?.isConnected||!task)return;
  const research=task.research||{},search=research.searchProgress||{},runs=research.queryRuns||[];
  root.querySelector('[data-wait-sources]').textContent=String(search.sourceCount??research.sources?.length??0);
  root.querySelector('[data-wait-queries]').textContent=String(search.completedQueries??runs.filter(row=>row.status==='completed').length)+' / '+String(search.totalQueries||runs.length||research.plan?.queries?.length||0);
  const rounds=Number(research.searchQuality?.repairRounds||0)+Number(research.evidenceRepair?.roundsUsed||0);
  root.querySelector('[data-wait-round]').textContent=rounds?rounds+' 轮':research.supplementalRound?'补充 '+research.supplementalRound+' 轮':'初始检索';
  const model=stageModel(task),fingerprint=JSON.stringify([task.id,task.status,model,online]);
  if(fingerprint!==lastPaint){
    lastPaint=fingerprint;
    root.querySelector('[data-wait-title]').textContent=online?model.title:'连接暂时中断，正在重连';
    root.querySelector('[data-wait-description]').textContent=online?model.description:'暂未获取最新状态；动画和计时不代表后台仍在执行，请保持工作台后台运行。';
    root.querySelector('[data-wait-activity]').textContent=model.activity;
    root.querySelector('[data-wait-caption]').textContent=online?model.label:'显示上次保存的进度';
    root.querySelectorAll('[data-wait-phase]').forEach((node,index)=>{node.classList.toggle('is-done',task.status!=='queued'&&index<model.phase);node.classList.toggle('is-current',task.status!=='queued'&&index===model.phase);});
    const meter=root.querySelector('.wait-meter');meter.classList.toggle('is-indeterminate',model.fraction===null&&online);meter.classList.toggle('is-offline',!online);
    if(model.fraction!==null){meter.setAttribute('aria-valuenow',String(Math.round(model.fraction*100)));meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.querySelector('span').style.width=Math.round(model.fraction*100)+'%';}else {meter.removeAttribute('aria-valuenow');meter.querySelector('span').style.width='';}meter.setAttribute('aria-valuetext',online?model.label:'连接中断，进度未知');
  }
  root.querySelector('[data-wait-clock]').textContent=secondsLabel((Date.now()-visits.get(task.id))/1000);
  const updated=Date.parse(task.updatedAt);root.querySelector('[data-wait-fresh]').textContent=Number.isFinite(updated)?'最近保存 '+secondsLabel((Date.now()-updated)/1000)+' 前':'';
  root.querySelector('[data-wait-tip]').textContent=tips[tipIndex];
}
function tick(){
  const now=Date.now(),delta=Math.min(2000,now-lastTick);lastTick=now;
  if(!root?.isConnected||!visible||document.hidden)return;
  paint();
  const focusInside=root.querySelector('.showcase-content').contains(document.activeElement);
  if(deck.length&&!paused&&!hovered&&!focusInside){cycle+=delta;if(cycle>=cycleMs){select(1);tipIndex=(tipIndex+1)%tips.length;}}
  root.querySelector('.showcase-cycle span').style.transform='scaleX('+(cycle/cycleMs)+')';
}
export function mountWaitingRoom(nextTask,{api:client,preserved}={}){
  if(!active(nextTask)){stopWaitingRoom();return;}
  const incoming=document.querySelector('.research-waiting');if(!incoming)return;
  if(preserved?.dataset.waitTask===nextTask.id&&incoming!==preserved)incoming.replaceWith(preserved);
  const previous=root;root=preserved?.dataset.waitTask===nextTask.id?preserved:incoming;task=nextTask;api=client;online=true;lastPaint='';if(previous!==root)lastTick=Date.now();
  if(!root.querySelector('.wait-facts')){const facts=document.createElement('div');facts.className='wait-facts';facts.innerHTML='<div><strong data-wait-sources>0</strong><small>已收集来源</small></div><div><strong data-wait-queries>0 / 0</strong><small>检索查询</small></div><div><strong data-wait-round>初始检索</strong><small>补查轮次</small></div>';root.querySelector('.wait-now').before(facts);}
  if(!visits.has(task.id))visits.set(task.id,Date.now());
  if(previous!==root){lastProduct='';hovered=false;const content=root.querySelector('.showcase-content');content.addEventListener('mouseenter',()=>{hovered=true;paintProduct();});content.addEventListener('mouseleave',()=>{hovered=false;lastTick=Date.now();paintProduct();});root.addEventListener('click',event=>{const action=event.target.closest('[data-wait-action]')?.dataset.waitAction;if(!action)return;if(action==='next')select(1);if(action==='previous')select(-1);if(action==='toggle'){paused=!paused;if(!paused){cycle=0;lastTick=Date.now();}paintProduct();}if(action==='retry'){feedError='';root.querySelector('.showcase-content').innerHTML='<div class="showcase-placeholder">正在重新读取规格库…</div>';loadFeed();}});}
  paint();paintProduct();loadFeed();
  if(!ticker)ticker=setInterval(tick,1000);
}
export function setWaitingRoomConnection(value){online=value;paint();}
export function setWaitingRoomVisible(value){visible=value;lastTick=Date.now();}
export function stopWaitingRoom(){if(ticker)clearInterval(ticker);if(task)visits.delete(task.id);ticker=null;task=null;root=null;lastPaint='';}
