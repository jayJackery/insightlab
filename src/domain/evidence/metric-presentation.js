// Shared by HTTP serialization and Word output; does not change factual values.
function valueWithUnit(metric) {
  const value=String(metric.value ?? ''),unit=String(metric.unit || '').trim();
  if(!unit)return value;
  if(/^(?:cycles?|次)$/i.test(unit)&&/(?:cycles?|次)/i.test(value))return value;
  const escaped=unit.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(new RegExp('(?<![a-z])'+escaped+'(?![a-z])','i').test(value))return value;
  return value+' '+unit;
}
export function metricPresentation(metric) {
  if(!metric)return {state:'not_found',label:'本轮未找到'};
  const curated=metric.status==='curated'?metric:metric.catalogObservations?.find(item=>item.status==='curated');
  if(curated&&(metric.status==='curated'||metric.verification?.status==='needs_review'))return {state:'curated',label:valueWithUnit(curated)+' · 规格库收录',detail:curated.note || '待官网独立复核',sourceIds:curated.sourceIds};
  if(metric.verification?.status==='needs_review')return {state:'needs_review',label:'参数待核验',detail:metric.verification.reason || ''};
  if(metric.status==='not_comparable'||metric.status==='conflict')return {state:'not_comparable',label:metric.status==='conflict'?'来源信息冲突':'数据不可比',detail:metric.note || ''};
  if(metric.status==='not_found'||metric.status==='not_disclosed')return {state:'not_found',label:'本轮未找到',detail:metric.note || ''};
  if(!['derived','disclosed'].includes(metric.status))return {state:'needs_review',label:'参数待核验',detail:'尚未识别该指标状态'};
  return {state:metric.status,label:(metric.status==='derived'?'计算值 · ':'')+valueWithUnit(metric),detail:metric.note || '',formula:metric.status==='derived'?metric.formula:undefined};
}
