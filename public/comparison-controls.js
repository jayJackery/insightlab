import {COMPARISON_DEFAULTS} from './comparison-defaults.js';
import {cleanProductLabel} from './product-identity.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeHref=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'https://hellotech2.pages.dev/';}catch{return 'https://hellotech2.pages.dev/';}};
const names=value=>String(value||'').split(/[、，,；;\n]/u).map(cleanProductLabel).filter(Boolean);
function fields(prefix,values={}){
  return '<div class="comparison-fields"><label>容量允许偏差 %<input class="input" type="number" min="0" max="300" id="'+prefix+'capacity-tolerance" '+(prefix==='brief-'?'name="capacityTolerance"':'')+' value="'+esc(values.capacityTolerance??COMPARISON_DEFAULTS.capacityTolerance)+'"></label><label>功率允许偏差 %<input class="input" type="number" min="0" max="300" id="'+prefix+'power-tolerance" '+(prefix==='brief-'?'name="powerTolerance"':'')+' value="'+esc(values.powerTolerance??COMPARISON_DEFAULTS.powerTolerance)+'"></label></div>';
}
function referenceSummary(selection){
  const reference=selection?.reference,variants=reference?.variants||[];
  if(!variants.length)return '<p class="comparison-result-note">'+esc(selection?.reason||'基准选填。不填也能调研；输入简称后可确认匹配型号，容量和连续功率由系统查找。')+'</p>';
  return '<div class="automatic-reference"><strong>已自动找到基准规格 · '+esc(reference.name)+'</strong><ul>'+variants.map(item=>'<li><b>'+esc(item.capacityWh+' Wh / '+item.ratedPowerW+' W')+'</b><span>'+esc((item.regions||[]).join('/')||'来源未注明地区')+'</span><a href="'+esc(safeHref(item.sourceUrl))+'" target="_blank" rel="noopener noreferrer">'+(item.basis==='team_catalog'?'规格库整理记录':'官方原文摘录')+' ↗</a><small>'+esc(item.verifiedDate?'记录日期 '+item.verifiedDate:'原文日期未注明')+'</small></li>').join('')+'</ul><p>筛选范围：所有地区。每条版本的容量与连续功率成对使用；地区、配置差异在报告中保留。</p></div>';
}
function candidates(selection,scope){
  if(selection?.baselineStatus!=='needs_confirmation')return '';
  return '<section class="baseline-candidates" aria-label="可能的基准型号"><strong>你指的是哪款产品？</strong><p>相似名称仅供选择，不会自动混用代际或后缀。也可以暂不确认，继续调研。</p><ul>'+(selection.baselineOptions||[]).map(item=>'<li><div><b>'+esc(item.name)+'</b><span>'+esc(item.variants.map(v=>[(v.capacityWh?v.capacityWh+' Wh':'容量待查'),(v.ratedPowerW?v.ratedPowerW+' W':'连续功率待查'),(v.regions||[]).join('/')].join(' · ')).join('；'))+'</span><a href="'+esc(safeHref(item.sourceUrl))+'" target="_blank" rel="noopener noreferrer">规格库记录 ↗</a></div><button type="button" data-baseline-candidate="'+esc(item.name)+'" data-baseline-scope="'+scope+'">确认这款</button></li>').join('')+'</ul></section>';
}
export function setupComparisonBrief(){
  const baseline=document.querySelector('#baselineProduct');
  baseline?.closest('.grid')?.insertAdjacentHTML('afterend','<details class="comparison-brief"><summary>同档竞品筛选 · 基准选填，支持简称匹配</summary><p>填写基准时自动查找容量与连续功率；不填则按原问题研究。默认容量±25%、连续功率±100%，均可调整为0–300%，覆盖所有地区。</p><div id="brief-reference" aria-live="polite">'+referenceSummary()+'</div>'+fields('brief-')+'</details>');
  let timer,sequence=0;
  const lookup=async()=>{const number=++sequence,node=document.querySelector('#brief-reference');if(!node)return;const product=baseline.value.trim();if(!product){node.innerHTML=referenceSummary();return;}node.textContent='正在匹配基准型号规格…';
    try{const response=await fetch('/api/competitors/recommend',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input:{subject:document.querySelector('#subject').value||'便携储能竞品分析',baselineProduct:product,comparisonRegion:'all',referenceMode:'automatic'}})});const result=await response.json();if(number!==sequence)return;if(!response.ok)throw Error(result.error||'基准规格暂时无法读取，可继续调研。');node.innerHTML=referenceSummary(result)+candidates(result,'brief');node.closest('details').open=true;}catch(error){if(number===sequence)node.textContent=error.message;}
  };
  baseline?.addEventListener('input',()=>{sequence++;clearTimeout(timer);const node=document.querySelector('#brief-reference');if(node)node.innerHTML=baseline.value.trim()?'正在识别产品名称…':referenceSummary();timer=setTimeout(lookup,650);});baseline?.addEventListener('change',()=>{clearTimeout(timer);lookup();});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-baseline-candidate][data-baseline-scope="brief"]');if(!button)return;baseline.value=button.dataset.baselineCandidate;baseline.dispatchEvent(new Event('change',{bubbles:true}));});
}
export function comparisonResults(selection){
  if(!selection)return '';
  const rows=(selection.rows?.length?selection.rows:selection.recommendations||[]).map(row=>({...row,catalogUrl:safeHref(row.catalogUrl||'https://hellotech2.pages.dev/'),officialUrl:row.officialUrl?safeHref(row.officialUrl):''}));
  if(!selection.applies)return referenceSummary(selection)+candidates(selection,'plan');
  return referenceSummary(selection)+'<p class="comparison-result-note">'+esc(selection.reason||'')+'</p>'+(selection.warning?'<p class="comparison-warning">'+esc(selection.warning)+'</p>':'')+(rows.length?'<div class="table-wrap"><table class="selection-table"><thead><tr><th>准确型号 / 资料</th><th>容量 / 连续功率</th><th>筛选结果</th></tr></thead><tbody>'+rows.map(row=>'<tr><th>'+esc(row.name)+'<small><a href="'+esc(row.catalogUrl)+'" target="_blank" rel="noopener noreferrer">规格库 ↗</a>'+(row.officialUrl?' · <a href="'+esc(row.officialUrl)+'" target="_blank" rel="noopener noreferrer">官网 ↗</a>':'')+'</small></th><td>'+esc(row.capacityWh?row.capacityWh+' Wh':'尚待匹配')+'<br>'+esc(row.ratedPowerW?row.ratedPowerW+' W':'尚待匹配')+'<small>'+esc(row.region||'地区保留在原始记录')+'</small>'+(row.versions?.length>1?'<details><summary>查看其他地区版本</summary>'+row.versions.map(item=>'<p>'+esc((item.regions||[]).join('/')+' · '+(item.capacityWh||'未知')+' Wh / '+(item.ratedPowerW||'未知')+' W')+'</p>').join('')+'</details>':'')+'</td><td><strong class="selection-state '+esc(row.status)+'">'+({comparable:'同档候选',cross_tier:'跨档参考',unmatched:'型号待补查'}[row.status]||'待确认')+'</strong><small>'+esc(row.reason)+'</small></td></tr>').join('')+'</tbody></table></div>':'<p class="comparison-warning">当前范围内没有同档推荐，可继续原问题研究；也可调整允许偏差，不会自动放宽。</p>');
}
export function renderComparisonControls(task){
  const selection=task.research?.plan?.competitorSelection;if(!selection?.requested&&!selection?.applies)return '';
  const saved=task.research?.plan?.comparisonInput||{},reference=selection.reference||{};
  const values={...task.input,...saved,capacityTolerance:selection.policy?.capacityTolerance??saved.capacityTolerance??task.input.capacityTolerance,powerTolerance:selection.policy?.powerTolerance??saved.powerTolerance??task.input.powerTolerance};
  return '<section class="comparison-calibration"><h3>基准识别与同档竞品 · 可选</h3><p>原始名称：<strong>'+esc(task.input.baselineProduct||'未设置')+'</strong>。可确认候选型号，也可直接开始研究；无可靠基准时不作同档排名。</p><input type="hidden" id="plan-compare-baseline-choice" value="'+esc(saved.baselineChoice||'')+'">'+fields('plan-compare-',values)+'<div class="comparison-buttons"><button type="button" data-comparison-action="check">检查当前型号</button><button type="button" data-comparison-action="recommend">应用同档推荐并更新型号查询</button></div><div id="comparison-results">'+comparisonResults(selection)+'</div><label class="cross-tier-choice"><input type="checkbox" id="allow-cross-tier"'+(selection.crossTierConfirmed?' checked':'')+'>我确认保留手工填写的跨档 / 待核实型号作为参考，不参与同档排名</label></section>';
}
export function readComparisonControls(){
  const fields={capacityTolerance:'capacity-tolerance',powerTolerance:'power-tolerance'};
  return {...Object.fromEntries(Object.entries(fields).map(([key,suffix])=>{const input=document.querySelector('#plan-compare-'+suffix);if(input&&!input.checkValidity())throw Error('允许偏差须为0至300%。');return [key,input?.value??''];})),baselineChoice:document.querySelector('#plan-compare-baseline-choice')?.value||'',referenceMode:'automatic',comparisonRegion:'all'};
}
export function setupComparisonActions({api,getTask}){
  document.addEventListener('click',async event=>{
    const candidate=event.target.closest('[data-baseline-candidate][data-baseline-scope="plan"]');
    if(candidate){document.querySelector('#plan-compare-baseline-choice').value=candidate.dataset.baselineCandidate;document.querySelector('[data-comparison-action="check"]').click();return;}
    const button=event.target.closest('[data-comparison-action]');if(!button)return;
    const results=document.querySelector('#comparison-results');button.disabled=true;
    try{const task=await getTask(),input={...task.input,...readComparisonControls()},current=names(document.querySelector('#plan-competitors').value);const selection=await api('/api/competitors/recommend',{method:'POST',body:JSON.stringify({taskId:task.id,input,candidates:current})});
      const label=document.querySelector('[data-plan-baseline-label]'),name=document.querySelector('[data-plan-baseline-name]');if(label)label.textContent=selection.baselineStatus==='confirmed'?'已确认的对比基准':'原始产品名称 · 未确认，不作相对基准排名';if(name)name.textContent=selection.baselineStatus==='confirmed'?selection.reference.name:task.input.baselineProduct;
      if(button.dataset.comparisonAction==='recommend'&&selection.applies&&!selection.requiresConfirmation){
        const next=[...new Set([...(selection.explicitNames||[]),...(selection.recommendations||[]).map(row=>row.name)])];if(!next.length)throw Error('当前阈值内没有可推荐的异品牌型号。请调整范围或手工填写并检查，不会自动放宽。');
        document.querySelector('#plan-competitors').value=next.join('\n');
        const compact=value=>value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
        const general=document.querySelector('#plan-queries').value.split('\n').filter(query=>!current.some(name=>compact(query).includes(compact(name))));
        document.querySelector('#plan-queries').value=[...new Set([task.input.baselineProduct,...next].filter(Boolean).map(name=>cleanProductLabel(name)+' teardown architecture missing specifications').concat(general))].slice(0,10).join('\n');
        const refreshed=await api('/api/competitors/recommend',{method:'POST',body:JSON.stringify({taskId:task.id,input,candidates:next})});results.innerHTML=comparisonResults(refreshed)+'<p class="comparison-result-note">已更新下方竞品与查询，请检查后再开始研究。</p>';
      }else results.innerHTML=comparisonResults(selection);
    }catch(error){results.textContent=error.message;}finally{button.disabled=false;}
  });
}
