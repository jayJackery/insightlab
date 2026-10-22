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
  if(!variants.length)return '<p class="comparison-result-note">'+esc(selection?.reason||'填写基准厂商与准确型号后，系统自动查找容量和额定连续功率。')+'</p>';
  return '<div class="automatic-reference"><strong>已自动找到基准规格 · '+esc(reference.name)+'</strong><ul>'+variants.map(item=>'<li><b>'+esc(item.capacityWh+' Wh / '+item.ratedPowerW+' W')+'</b><span>'+esc((item.regions||[]).join('/')||'来源未注明地区')+'</span><a href="'+esc(safeHref(item.sourceUrl))+'" target="_blank" rel="noopener noreferrer">'+(item.basis==='team_catalog'?'规格库整理记录':'官方原文摘录')+' ↗</a><small>'+esc(item.verifiedDate?'记录日期 '+item.verifiedDate:'原文日期未注明')+'</small></li>').join('')+'</ul><p>筛选范围：所有地区。每条版本的容量与连续功率成对使用；地区、配置差异在报告中保留。</p></div>';
}
export function setupComparisonBrief(){
  const baseline=document.querySelector('#baselineProduct');
  baseline?.closest('.grid')?.insertAdjacentHTML('afterend','<details class="comparison-brief"><summary>同档竞品筛选 · 基准规格自动查找</summary><p>容量、额定连续功率由系统自动查找，默认覆盖所有地区。你只需设置允许偏差；默认容量±25%、连续功率±100%，均可调整为0–300%。</p><div id="brief-reference" aria-live="polite">'+referenceSummary()+'</div>'+fields('brief-')+'</details>');
  let timer,sequence=0;
  const lookup=async()=>{const number=++sequence,node=document.querySelector('#brief-reference');if(!node)return;const product=baseline.value.trim();if(!product){node.innerHTML=referenceSummary();return;}node.textContent='正在匹配基准型号规格…';
    try{const response=await fetch('/api/competitors/recommend',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input:{subject:document.querySelector('#subject').value||'便携储能竞品分析',baselineProduct:product,comparisonRegion:'all',referenceMode:'automatic'}})});const result=await response.json();if(number!==sequence)return;if(!response.ok)throw Error(result.error||'基准规格暂时无法读取。');node.innerHTML=referenceSummary(result);}catch(error){if(number===sequence)node.textContent=error.message;}
  };
  baseline?.addEventListener('input',()=>{sequence++;clearTimeout(timer);timer=setTimeout(lookup,650);});baseline?.addEventListener('change',()=>{clearTimeout(timer);lookup();});
}
export function comparisonResults(selection){
  if(!selection)return '';
  const rows=(selection.rows?.length?selection.rows:selection.recommendations||[]).map(row=>({...row,catalogUrl:safeHref(row.catalogUrl||'https://hellotech2.pages.dev/'),officialUrl:row.officialUrl?safeHref(row.officialUrl):''}));
  return referenceSummary(selection)+'<p class="comparison-result-note">'+esc(selection.reason||'')+'</p>'+(selection.warning?'<p class="comparison-warning">'+esc(selection.warning)+'</p>':'')+(rows.length?'<div class="table-wrap"><table class="selection-table"><thead><tr><th>准确型号 / 资料</th><th>容量 / 连续功率</th><th>筛选结果</th></tr></thead><tbody>'+rows.map(row=>'<tr><th>'+esc(row.name)+'<small><a href="'+esc(row.catalogUrl)+'" target="_blank" rel="noopener noreferrer">规格库 ↗</a>'+(row.officialUrl?' · <a href="'+esc(row.officialUrl)+'" target="_blank" rel="noopener noreferrer">官网 ↗</a>':'')+'</small></th><td>'+esc(row.capacityWh?row.capacityWh+' Wh':'尚待匹配')+'<br>'+esc(row.ratedPowerW?row.ratedPowerW+' W':'尚待匹配')+'<small>'+esc(row.region||'地区保留在原始记录')+'</small>'+(row.versions?.length>1?'<details><summary>查看其他地区版本</summary>'+row.versions.map(item=>'<p>'+esc((item.regions||[]).join('/')+' · '+(item.capacityWh||'未知')+' Wh / '+(item.ratedPowerW||'未知')+' W')+'</p>').join('')+'</details>':'')+'</td><td><strong class="selection-state '+esc(row.status)+'">'+({comparable:'同档候选',cross_tier:'跨档参考',unmatched:'型号待补查'}[row.status]||'待确认')+'</strong><small>'+esc(row.reason)+'</small></td></tr>').join('')+'</tbody></table></div>':'<p class="comparison-warning">未形成同档推荐时，可核对基准型号或调整允许偏差；不需要手填容量和功率。</p>');
}
export function renderComparisonControls(task){
  const selection=task.research?.plan?.competitorSelection;if(!selection?.applies)return '';
  const saved=task.research?.plan?.comparisonInput||{},reference=selection.reference||{};
  const values={...task.input,...saved,capacityTolerance:selection.policy?.capacityTolerance??saved.capacityTolerance??task.input.capacityTolerance,powerTolerance:selection.policy?.powerTolerance??saved.powerTolerance??task.input.powerTolerance};
  return '<section class="comparison-calibration"><h3>同档竞品 · 自动查找基准规格</h3><p>基准：<strong>'+esc(task.input.baselineProduct||'请补充准确基准型号')+'</strong>。自动覆盖所有地区；容量与连续功率无需填写，仅调整允许偏差。</p>'+fields('plan-compare-',values)+'<div class="comparison-buttons"><button type="button" data-comparison-action="check">检查当前型号</button><button type="button" data-comparison-action="recommend">应用同档推荐并更新型号查询</button></div><div id="comparison-results">'+comparisonResults(selection)+'</div><label class="cross-tier-choice"><input type="checkbox" id="allow-cross-tier"'+(selection.crossTierConfirmed?' checked':'')+'>我确认保留手工填写的跨档 / 待核实型号作为参考，不参与同档排名</label></section>';
}
export function readComparisonControls(){
  const fields={capacityTolerance:'capacity-tolerance',powerTolerance:'power-tolerance'};
  return {...Object.fromEntries(Object.entries(fields).map(([key,suffix])=>{const input=document.querySelector('#plan-compare-'+suffix);if(input&&!input.checkValidity())throw Error('允许偏差须为0至300%。');return [key,input?.value??''];})),referenceMode:'automatic',comparisonRegion:'all'};
}
export function setupComparisonActions({api,getTask}){
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-comparison-action]');if(!button)return;
    const results=document.querySelector('#comparison-results');button.disabled=true;
    try{const task=await getTask(),input={...task.input,...readComparisonControls()},current=names(document.querySelector('#plan-competitors').value);const selection=await api('/api/competitors/recommend',{method:'POST',body:JSON.stringify({taskId:task.id,input,candidates:current})});
      if(button.dataset.comparisonAction==='recommend'&&!selection.requiresConfirmation){
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
