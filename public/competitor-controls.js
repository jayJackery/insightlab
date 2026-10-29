import {COMPARISON_DEFAULTS} from './comparison-defaults.js?v=69935587b51cd156';
import {cleanProductLabel} from './product-identity.js?v=69935587b51cd156';
import {sameProduct} from '../src/domain/evidence/product-registry.js?v=69935587b51cd156';
import {esc,safeHref,selectionOverview,selectionTable} from './comparison-view.js?v=69935587b51cd156';
import {setupCatalogPicker} from './catalog-picker.js?v=69935587b51cd156';
const names=value=>String(value||'').split(/[、，,；;\n]/u).map(cleanProductLabel).filter(Boolean);
const compact=value=>String(value||'').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
function fields(prefix,values={}){
  return '<div class="comparison-fields">'+[['capacity','容量',COMPARISON_DEFAULTS.capacityTolerance],['power','功率',COMPARISON_DEFAULTS.powerTolerance]].map(([key,label,fallback])=>'<label>'+label+'允许偏差 %<input class="input" type="number" required min="0" max="300" id="'+prefix+key+'-tolerance" '+(prefix==='brief-'?'name="'+key+'Tolerance"':'')+' value="'+esc(values[key+'Tolerance']??fallback)+'"></label>').join('')+'</div>';
}
function tolerances(prefix){
  const result={referenceMode:'automatic',comparisonRegion:'all'};
  for(const key of ['capacity','power']){const input=document.querySelector('#'+prefix+key+'-tolerance');if(input&&(!input.checkValidity()||input.value===''))throw Error('请填写0至300%的允许偏差，0表示只接受相同数值。');result[key+'Tolerance']=input?.value??COMPARISON_DEFAULTS[key+'Tolerance'];}
  return result;
}
function referenceSummary(selection){
  const reference=selection?.reference,variants=reference?.variants||[];
  if(!variants.length)return '<p class="comparison-result-note">'+esc(selection?.reason||'基准选填。不填也能调研；输入简称后可确认匹配型号，容量和连续功率由系统查找。')+'</p>';
  return '<div class="automatic-reference"><strong>已自动找到基准规格 · '+esc(reference.name)+'</strong><ul>'+variants.map(item=>'<li><b>'+esc(item.capacityWh+' Wh / '+item.ratedPowerW+' W')+'</b><span>'+esc((item.regions||[]).join('/')||'来源未注明地区')+'</span><a href="'+esc(safeHref(item.sourceUrl))+'" target="_blank" rel="noopener noreferrer">'+(item.basis==='team_catalog'?'规格库整理记录':'官方原文摘录')+' ↗</a><small>'+esc(item.verifiedDate?'记录日期 '+item.verifiedDate:'原文日期未注明')+'</small></li>').join('')+'</ul><p>所有地区版本分别保留，容量与连续功率成对使用，不混搭参数。</p></div>';
}
function candidates(selection,scope){
  if(selection?.baselineStatus!=='needs_confirmation')return '';
  return '<section class="baseline-candidates" aria-label="可能的基准型号"><strong>你指的是哪款产品？</strong><p>相似名称仅供选择，不会自动混用代际或后缀。也可以暂不确认，继续调研。</p><ul>'+(selection.baselineOptions||[]).map(item=>'<li><div><b>'+esc(item.name)+'</b><span>'+esc(item.variants.map(v=>[(v.capacityWh?v.capacityWh+' Wh':'容量待查'),(v.ratedPowerW?v.ratedPowerW+' W':'连续功率待查'),(v.regions||[]).join('/')].join(' · ')).join('；'))+'</span><a href="'+esc(safeHref(item.sourceUrl))+'" target="_blank" rel="noopener noreferrer">规格库记录 ↗</a></div><button type="button" data-baseline-candidate="'+esc(item.name)+'" data-baseline-scope="'+scope+'">确认这款</button></li>').join('')+'</ul></section>';
}
export function comparisonResults(selection,{scope='plan'}={}){
  if(!selection)return '';
  if(!selection.applies)return referenceSummary(selection)+candidates(selection,scope);
  const selected=selection.rows||[],recommended=selection.recommendations||[],all=selection.matchingProducts||recommended;
  return referenceSummary(selection)+selectionOverview(selection)+(selection.warning?'<p class="comparison-warning">'+esc(selection.warning)+'</p>':'')+'<h4 class="comparison-list-title">'+(selected.length?'当前已选竞品':'优先推荐 · 尚未应用')+'</h4>'+selectionTable(selected.length?selected:recommended,{actions:scope==='plan',kind:selected.length?'selected':'available'})+'<details class="matching-products"><summary>查看全部 '+(selection.matchingCount??all.length)+' 款符合条件的型号</summary>'+selectionTable(all,{actions:scope==='plan',kind:'available'})+'</details>';
}
export function setupComparisonBrief(){
  const baseline=document.querySelector('#baselineProduct');
  baseline?.closest('.grid')?.insertAdjacentHTML('afterend','<div class="catalog-entry"><button type="button" data-open-catalog="brief">从规格库分类选择竞品</button><small>按类别、品牌、容量筛选，可多选和移除；无需模型或搜索密钥。</small></div><details class="comparison-brief"><summary>同档竞品筛选 · 基准选填，支持简称匹配</summary><p>偏差修改后自动重算预览；容量默认±25%、连续功率默认±100%，可调0–300%。不会自动更换已选竞品。</p>'+fields('brief-')+'<div id="brief-reference" aria-live="polite">'+referenceSummary()+'</div></details>');
  let timer,sequence=0;
  const lookup=async()=>{
    const number=++sequence,node=document.querySelector('#brief-reference');if(!node)return;
    if(!baseline.value.trim()){node.innerHTML=referenceSummary();return;}
    node.textContent='正在按当前偏差重新筛选…';
    try{
      const input={subject:document.querySelector('#subject').value||'便携储能竞品分析',baselineProduct:baseline.value.trim(),competitors:document.querySelector('#competitors').value,...tolerances('brief-')};
      const response=await fetch('/api/competitors/recommend',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input})}),result=await response.json();
      if(number!==sequence)return;if(!response.ok)throw Error(result.error||'规格库暂时无法读取，可继续调研。');node.innerHTML=comparisonResults(result,{scope:'brief'});node.closest('details').open=true;
    }catch(error){if(number===sequence)node.textContent=error.message;}
  };
  const changed=()=>{sequence++;clearTimeout(timer);document.querySelector('#brief-reference').textContent=baseline.value.trim()?'偏差或型号已修改，正在重新计算…':'基准选填，不填也能继续调研。';timer=setTimeout(lookup,450);};
  for(const input of [baseline,document.querySelector('#brief-capacity-tolerance'),document.querySelector('#brief-power-tolerance'),document.querySelector('#competitors')]){input?.addEventListener('input',changed);input?.addEventListener('change',()=>{clearTimeout(timer);lookup();});}
  document.addEventListener('click',event=>{const button=event.target.closest('[data-baseline-candidate][data-baseline-scope="brief"]');if(!button)return;baseline.value=button.dataset.baselineCandidate;baseline.dispatchEvent(new Event('change',{bubbles:true}));});
}
export function renderComparisonControls(task){
  const selection=task.research?.plan?.competitorSelection,saved=task.research?.plan?.comparisonInput||{};
  const values={...task.input,...saved,capacityTolerance:selection?.policy?.capacityTolerance??saved.capacityTolerance??task.input.capacityTolerance,powerTolerance:selection?.policy?.powerTolerance??saved.powerTolerance??task.input.powerTolerance};
  return '<section class="comparison-calibration"><h3>竞品选择与同档筛选 · 可选</h3><p>原始基准：<strong>'+esc(task.input.baselineProduct||'未设置')+'</strong>。可自由增删竞品；改变偏差只重新检查，不会偷偷换掉已选型号。</p><input type="hidden" id="plan-compare-baseline-choice" value="'+esc(saved.baselineChoice||'')+'">'+fields('plan-compare-',values)+'<div class="comparison-buttons"><button type="button" data-open-catalog="plan">从规格库分类选择竞品</button><button type="button" data-comparison-action="check">重新检查当前型号</button><button type="button" data-comparison-action="recommend">应用优先推荐并更新查询</button></div><div class="comparison-manual-add"><label for="comparison-product-add">库外型号 / 自由添加</label><div><input class="input" id="comparison-product-add" placeholder="输入厂商和型号，也可直接编辑下方竞品列表"><button type="button" data-comparison-add-manual>添加竞品</button></div></div><p id="comparison-update-status" class="comparison-result-note" role="status">修改偏差后自动重算；只有增删或主动应用推荐才更改计划。</p><div id="comparison-results">'+comparisonResults(selection)+'</div><label class="cross-tier-choice"><input type="checkbox" id="allow-cross-tier"'+(selection?.crossTierConfirmed?' checked':'')+'>我确认保留手工填写的跨档 / 待核实型号作为参考，不参与同档排名</label></section>';
}
export function readComparisonControls(){return {...tolerances('plan-compare-'),baselineChoice:document.querySelector('#plan-compare-baseline-choice')?.value||''};}
export function setupComparisonActions({api,getTask}){
  let sequence=0,timer,lastSelection=null,lastTaskId=null;
  const status=message=>{const node=document.querySelector('#comparison-update-status');if(node)node.textContent=message;};
  async function refresh(mode='check'){
    clearTimeout(timer);const number=++sequence,results=document.querySelector('#comparison-results');if(!results)return;
    status('正在按当前偏差重新计算…');results.setAttribute('aria-busy','true');
    try{
      const comparison=readComparisonControls(),task=await getTask(),input={...task.input,...comparison},current=names(document.querySelector('#plan-competitors').value);
      let selection=await api('/api/competitors/recommend',{method:'POST',body:JSON.stringify({taskId:task.id,input,candidates:current})});
      if(number!==sequence||document.querySelector('#comparison-results')!==results)return;
      if(mode==='recommend'&&selection.applies){
        const next=[...new Set((selection.recommendations||[]).map(row=>row.name))];
        if(!next.length)throw Error('当前范围没有自动推荐，可扩大偏差，或从规格库自行选择。');
        await editNames(next,{task,refreshAfter:false});
        selection=await api('/api/competitors/recommend',{method:'POST',body:JSON.stringify({taskId:task.id,input,candidates:names(document.querySelector('#plan-competitors').value)})});
      }
      if(number!==sequence||document.querySelector('#comparison-results')!==results)return;
      lastSelection=selection;lastTaskId=task.id;
      const label=document.querySelector('[data-plan-baseline-label]'),name=document.querySelector('[data-plan-baseline-name]');if(label)label.textContent=selection.baselineStatus==='confirmed'?'已确认的对比基准':'原始产品名称 · 未确认，不作相对基准排名';if(name)name.textContent=selection.baselineStatus==='confirmed'?selection.reference.name:task.input.baselineProduct;
      results.innerHTML=comparisonResults(selection);
      status(mode==='recommend'?'已应用推荐并更新查询，请确认计划。':selection.applies?'已按当前偏差重算：符合条件 '+selection.matchingCount+' 款。已选型号保持不变，可增删或从规格库重选。':selection.reason||'可从规格库选择产品，无基准也可继续研究。');
    }catch(error){if(number===sequence)status(error.message);}finally{if(number===sequence&&document.querySelector('#comparison-results')===results)results.removeAttribute('aria-busy');}
  }
  async function baselineName(){const task=await getTask();return lastTaskId===task.id&&lastSelection?.baselineStatus==='confirmed'?lastSelection.reference.name:task.research?.plan?.competitorSelection?.baselineStatus==='confirmed'?task.research.plan.competitorSelection.reference.name:task.input.baselineProduct||'';}
  async function editNames(next,{task=null,refreshAfter=true}={}){
    task ||= await getTask();const field=document.querySelector('#plan-competitors');if(!field)throw Error('请先打开研究计划。');
    const previous=names(field.value),baseline=lastTaskId===task.id&&lastSelection?.baselineStatus==='confirmed'?lastSelection.reference.name:task.research?.plan?.competitorSelection?.baselineStatus==='confirmed'?task.research.plan.competitorSelection.reference.name:task.input.baselineProduct||'';
    const unique=[];for(const name of [...previous.filter(item=>baseline&&sameProduct(item,baseline)),...next.map(cleanProductLabel)])if(name&&!unique.some(item=>sameProduct(item,name)))unique.push(name);
    if(unique.length>12)throw Error('最多12个研究对象（含已设置的基准），请先移除部分竞品。');
    const removed=previous.filter(item=>!unique.some(name=>sameProduct(item,name))),added=unique.filter(item=>!previous.some(name=>sameProduct(item,name))),queries=document.querySelector('#plan-queries');
    let pendingQueries=0;
    if(queries){const kept=queries.value.split('\n').filter(query=>query.trim()).filter(query=>!removed.some(name=>compact(query).includes(compact(name)))||unique.some(name=>compact(query).includes(compact(name))));const extra=added.map(name=>name+' teardown architecture').filter(query=>Array.from(query).length<=128),slots=Math.max(0,10-kept.length);queries.value=[...new Set([...kept,...extra.slice(0,slots)])].join('\n');pendingQueries=added.length-Math.min(extra.length,slots);}
    field.value=unique.join('\n');if(refreshAfter)await refresh();
    if(pendingQueries)status('竞品已更新并纳入规格库参数读取；现有查询预算已满或型号过长，未自动追加'+pendingQueries+'条查询。原问题查询保留，可在下方按需调整。');
  }
  setupCatalogPicker({api,getBaseline:baselineName,onPlanApply:editNames});
  let observedResults=null;
  new MutationObserver(()=>{const node=document.querySelector('#comparison-results');if(node&&node!==observedResults){observedResults=node;lastSelection=null;lastTaskId=null;refresh();}else if(!node)observedResults=null;}).observe(document.body,{childList:true,subtree:true});
  const changed=event=>{if(!event.target.matches('#plan-compare-capacity-tolerance,#plan-compare-power-tolerance,#plan-competitors'))return;sequence++;clearTimeout(timer);status('偏差或选择已修改，正在重新计算；不会自动更换已选型号。');document.querySelector('#comparison-results')?.setAttribute('aria-busy','true');timer=setTimeout(()=>refresh(),450);};
  document.addEventListener('input',changed);document.addEventListener('change',event=>{if(event.target.matches('#plan-compare-capacity-tolerance,#plan-compare-power-tolerance,#plan-competitors')){clearTimeout(timer);refresh();}});
  document.addEventListener('keydown',event=>{if(event.target.id==='comparison-product-add'&&event.key==='Enter'){event.preventDefault();document.querySelector('[data-comparison-add-manual]').click();}});
  document.addEventListener('click',async event=>{
    const candidate=event.target.closest('[data-baseline-candidate][data-baseline-scope="plan"]');if(candidate){document.querySelector('#plan-compare-baseline-choice').value=candidate.dataset.baselineCandidate;await refresh();return;}
    const button=event.target.closest('[data-comparison-action]');if(button){button.disabled=true;try{await refresh(button.dataset.comparisonAction);}finally{button.disabled=false;}return;}
    const toggle=event.target.closest('[data-comparison-toggle]'),manual=event.target.closest('[data-comparison-add-manual]');if(!toggle&&!manual)return;
    try{const current=names(document.querySelector('#plan-competitors').value),name=toggle?.dataset.productName||document.querySelector('#comparison-product-add').value.trim();if(!name)throw Error('请输入厂商和型号，或从规格库选择。');if(toggle?.dataset.comparisonToggle==='selected')await editNames(current.filter(item=>!sameProduct(item,name)));else await editNames([...current,name]);if(manual)document.querySelector('#comparison-product-add').value='';}catch(error){status(error.message);}
  });
}
