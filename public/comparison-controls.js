import {COMPARISON_DEFAULTS} from './comparison-defaults.js';
import {cleanProductLabel} from './product-identity.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeHref=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'https://hellotech2.pages.dev/';}catch{return 'https://hellotech2.pages.dev/';}};
const regions=[['','请选择地区'],['US','美国 US'],['EU','欧洲 EU'],['UK','英国 UK'],['CN','中国 CN'],['JP','日本 JP'],['AU','澳大利亚 AU'],['CA','加拿大 CA'],['DE','德国 DE'],['FR','法国 FR']];
const names=value=>String(value||'').split(/[、，,；;\n]/u).map(cleanProductLabel).filter(Boolean);
function fields(prefix,values={}){
  return '<div class="comparison-fields"><label>基准 / 目标容量 Wh<input class="input" type="number" min="1" step="any" id="'+prefix+'capacity" '+(prefix==='brief-'?'name="baselineCapacityWh"':'')+' value="'+esc(values.baselineCapacityWh||'')+'" placeholder="例如 1536"></label><label>额定连续功率 W<input class="input" type="number" min="1" step="any" id="'+prefix+'power" '+(prefix==='brief-'?'name="baselineRatedPowerW"':'')+' value="'+esc(values.baselineRatedPowerW||'')+'" placeholder="例如 1800"></label><label>比较地区<select class="input" id="'+prefix+'region" '+(prefix==='brief-'?'name="comparisonRegion"':'')+'>'+regions.map(([id,title])=>'<option value="'+id+'"'+(values.comparisonRegion===id?' selected':'')+'>'+title+'</option>').join('')+'</select></label><label>容量允许偏差 %<input class="input" type="number" min="0" max="300" id="'+prefix+'capacity-tolerance" '+(prefix==='brief-'?'name="capacityTolerance"':'')+' value="'+esc(values.capacityTolerance??COMPARISON_DEFAULTS.capacityTolerance)+'"></label><label>功率允许偏差 %<input class="input" type="number" min="0" max="300" id="'+prefix+'power-tolerance" '+(prefix==='brief-'?'name="powerTolerance"':'')+' value="'+esc(values.powerTolerance??COMPARISON_DEFAULTS.powerTolerance)+'"></label></div>';
}
export function setupComparisonBrief(){
  document.querySelector('#baselineProduct')?.closest('.grid')?.insertAdjacentHTML('afterend','<details class="comparison-brief"><summary>同档竞品筛选 · 可填写目标容量、功率与地区</summary><p>已知型号可先从规格库匹配；多地区版本需确认。默认容量±25%、额定功率±100%，均可在0–300%调整；不使用峰值功率或扩容套装容量。</p>'+fields('brief-')+'</details>');
}
export function comparisonResults(selection){
  if(!selection)return '';
  const rows=(selection.rows?.length?selection.rows:selection.recommendations||[]).map(row=>({...row,catalogUrl:safeHref(row.catalogUrl||'https://hellotech2.pages.dev/'),officialUrl:row.officialUrl?safeHref(row.officialUrl):''}));
  return '<p class="comparison-result-note">'+esc(selection.reason||'')+'</p>'+(selection.warning?'<p class="comparison-warning">'+esc(selection.warning)+'</p>':'')+(rows.length?'<div class="table-wrap"><table class="selection-table"><thead><tr><th>准确型号 / 资料</th><th>容量 / 额定功率</th><th>筛选结果</th></tr></thead><tbody>'+rows.map(row=>'<tr><th>'+esc(row.name)+'<small><a href="'+esc(row.catalogUrl||'https://hellotech2.pages.dev/')+'" target="_blank" rel="noopener noreferrer">规格库 ↗</a>'+(row.officialUrl?' · <a href="'+esc(row.officialUrl)+'" target="_blank" rel="noopener noreferrer">官网 ↗</a>':'')+'</small></th><td>'+esc(row.capacityWh?row.capacityWh+' Wh':'尚待匹配')+'<br>'+esc(row.ratedPowerW?row.ratedPowerW+' W':'尚待匹配')+'</td><td><strong class="selection-state '+esc(row.status)+'">'+({comparable:'同档候选',cross_tier:'跨档参考',region_unavailable:'地区待确认',unmatched:'型号未匹配'}[row.status]||'待确认')+'</strong><small>'+esc(row.reason)+'</small></td></tr>').join('')+'</tbody></table></div>':'<p class="comparison-warning">尚未形成同档推荐；先补齐或调整目标范围，再点击推荐。</p>');
}
export function renderComparisonControls(task){
  const selection=task.research?.plan?.competitorSelection;if(!selection?.applies)return '';
  const saved=task.research?.plan?.comparisonInput||{},reference=selection.reference||{};
  const values={...task.input,...saved,baselineCapacityWh:saved.baselineCapacityWh||reference.capacityWh||task.input.baselineCapacityWh,baselineRatedPowerW:saved.baselineRatedPowerW||reference.ratedPowerW||task.input.baselineRatedPowerW,comparisonRegion:saved.comparisonRegion||reference.region||task.input.comparisonRegion,capacityTolerance:selection.policy?.capacityTolerance,powerTolerance:selection.policy?.powerTolerance};
  return '<section class="comparison-calibration"><h3>先确认同档范围，再比较竞品</h3><p>基准：<strong>'+esc(task.input.baselineProduct||'自定义目标档位')+'</strong>。数值是筛选依据，规格库已有参数直接引用，缺项再补查；跨档型号单列参考，不参与同档排名。</p>'+fields('plan-compare-',values)+'<div class="comparison-buttons"><button type="button" data-comparison-action="check">检查当前型号</button><button type="button" data-comparison-action="recommend">应用同档推荐并更新型号查询</button></div><div id="comparison-results">'+comparisonResults(selection)+'</div><label class="cross-tier-choice"><input type="checkbox" id="allow-cross-tier"'+(selection.crossTierConfirmed?' checked':'')+'>我确认保留手工填写的跨档 / 待核实型号作为参考，不参与同档排名</label></section>';
}
export function readComparisonControls(){
  const fields={baselineCapacityWh:'capacity',baselineRatedPowerW:'power',comparisonRegion:'region',capacityTolerance:'capacity-tolerance',powerTolerance:'power-tolerance'};
  return Object.fromEntries(Object.entries(fields).map(([key,suffix])=>{const input=document.querySelector('#plan-compare-'+suffix);if(input&&!input.checkValidity())throw Error('请检查目标容量、额定功率及允许偏差的填写范围。');return [key,input?.value||''];}));
}
export function setupComparisonActions({api,getTask}){
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-comparison-action]');if(!button)return;
    const results=document.querySelector('#comparison-results');button.disabled=true;
    try{const task=await getTask(),input={...task.input,...readComparisonControls()},current=names(document.querySelector('#plan-competitors').value);const selection=await api('/api/competitors/recommend',{method:'POST',body:JSON.stringify({input,candidates:current})});
      if(button.dataset.comparisonAction==='recommend'&&!selection.requiresConfirmation){
        const next=[...new Set([...(selection.explicitNames||[]),...(selection.recommendations||[]).map(row=>row.name)])];if(!next.length)throw Error('当前阈值内没有可推荐的异品牌型号。请调整范围或手工填写并检查，不会自动放宽。');
        document.querySelector('#plan-competitors').value=next.join('\n');
        const compact=value=>value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
        const general=document.querySelector('#plan-queries').value.split('\n').filter(query=>!current.some(name=>compact(query).includes(compact(name))));
        document.querySelector('#plan-queries').value=[...new Set([task.input.baselineProduct,...next].filter(Boolean).map(name=>cleanProductLabel(name)+' teardown architecture missing specifications').concat(general))].slice(0,10).join('\n');
        const refreshed=await api('/api/competitors/recommend',{method:'POST',body:JSON.stringify({input,candidates:next})});results.innerHTML=comparisonResults(refreshed)+'<p class="comparison-result-note">已更新下方竞品与查询，请检查后再开始研究。</p>';
      }else results.innerHTML=comparisonResults(selection);
    }catch(error){results.textContent=error.message;}finally{button.disabled=false;}
  });
}
