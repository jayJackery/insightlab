export const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const safeHref=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'https://hellotech2.pages.dev/';}catch{return 'https://hellotech2.pages.dev/';}};
const number=value=>Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2});
const deviation=value=>typeof value==='number'?(value>0?'+':'')+number(value)+'%':'未计算';
export function selectionOverview(selection){
  if(!selection.applies)return '';
  const count=Number.isInteger(selection.matchingCount)?selection.matchingCount:'待重算';
  return '<section class="selection-overview"><strong>符合条件 <b>'+count+'</b> 款</strong><span>容量 ±'+esc(selection.policy.capacityTolerance)+'% · 额定连续功率 ±'+esc(selection.policy.powerTolerance)+'%</span><ul>'+(selection.reference.ranges||[]).map(range=>'<li>'+esc((range.regions||[]).join('/')||'来源未注明地区')+'：<b>'+number(range.capacityMinWh)+'–'+number(range.capacityMaxWh)+' Wh</b> / <b>'+number(range.powerMinW)+'–'+number(range.powerMaxW)+' W</b></li>').join('')+'</ul><p>优先推荐最多3款最接近的产品；放宽范围后，这3款可能不变，全部符合条件的型号见下方。范围沿用原需求中的厂商条件，基准品牌默认不作自动推荐。</p></section>';
}
export function selectionTable(rows,{actions=false,kind='selected'}={}){
  if(!rows.length)return '<p class="comparison-result-note">暂无型号，可从规格库选择，也可手动添加。</p>';
  return '<div class="table-wrap"><table class="selection-table"><thead><tr><th>厂商 / 准确型号</th><th>容量 / 连续功率</th><th>与基准的偏差 / 状态</th>'+(actions?'<th>选择</th>':'')+'</tr></thead><tbody>'+rows.map(row=>'<tr><th>'+esc(row.name)+'<small><a href="'+esc(safeHref(row.catalogUrl||row.sourceUrl))+'" target="_blank" rel="noopener noreferrer">规格库 ↗</a>'+(row.officialUrl?' · <a href="'+esc(safeHref(row.officialUrl))+'" target="_blank" rel="noopener noreferrer">官网 ↗</a>':'')+'</small></th><td>'+esc(row.capacityWh?number(row.capacityWh)+' Wh':'容量待查')+'<br>'+esc(row.ratedPowerW?number(row.ratedPowerW)+' W':'连续功率待查')+'<small>'+esc(row.region||'地区见记录')+'</small></td><td><strong class="selection-state '+esc(row.status)+'">'+({comparable:'同档候选',cross_tier:'超出范围 · 参考',unmatched:'型号待补查'}[row.status]||'待确认')+'</strong><small>容量 '+deviation(row.capacityDeviation)+' · 功率 '+deviation(row.powerDeviation)+'</small>'+(row.status!=='comparable'?'<small>'+esc(row.reason)+'</small>':'')+'</td>'+(actions?'<td><button type="button" data-comparison-toggle="'+kind+'" data-product-name="'+esc(row.name)+'">'+(kind==='selected'?'移除':'添加')+'</button></td>':'')+'</tr>').join('')+'</tbody></table></div>';
}
