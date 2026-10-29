import {sameProduct} from './product-registry.js?v=e9968bcba1cb9548';
import {metricDefinition} from './metric-schema.js?v=e9968bcba1cb9548';
import {digest} from './source-document.js?v=e9968bcba1cb9548';

export const EVIDENCE_REPAIR_LIMITS=Object.freeze({rounds:2,queriesPerRound:3,totalQueries:6,maxSources:60});
export const queryKey=(query)=>String(query || '').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
export function evidenceGaps(evidence,input) {
  const gaps=[];
  const catalogKnown=(product,label)=>(evidence.competitorRows||[]).some(row=>sameProduct(row.competitor,product)&&(row.metricValues||[]).some(m=>(m.status==='curated'||m.catalogObservations?.some(o=>o.status==='curated'))&&m.metricId===metricDefinition(label).id));
  const add=(item)=>gaps.push({...item,id:'G'+digest([item.kind,item.product || '',item.metric || '',item.text || ''].join('|')).slice(0,16)});
  if(evidence.audit?.status!=='passed'&&!(evidence.audit?.checks || []).length)add({kind:'missing_evidence',priority:1,product:input.baselineProduct,metric:'技术原理 系统架构',reason:'未取得可核验的事实或产品参数'});
  for(const check of evidence.audit?.checks || []) if(check.status!=='supported'&&!(catalogKnown(check.product,check.metric)&&/规格库|catalog.*(?:pending|verification)|官网.*复核/i.test(check.reason||'')&&!/冲突|错配|不同|conflict|mismatch/i.test(check.reason||'')))add({kind:'fact_verification',priority:1,product:check.product,metric:check.metric,text:check.text,reason:check.reason});
  for(const row of evidence.competitorRows || []) for(const metric of row.metricValues || []) {
    if(['not_found','not_disclosed','not_comparable','conflict'].includes(metric.status)&&!(['not_found','not_disclosed'].includes(metric.status)&&catalogKnown(row.competitor,metric.metric)))add({kind:metric.status==='not_comparable'||metric.status==='conflict'?'condition_conflict':'missing_specification',priority:2,product:metric.product || row.competitor,metric:metric.metric,reason:metric.note || '缺少可比参数或原始条件'});
    if(metric.status==='disclosed'&&['capacity_nominal','mass_net'].includes(metric.metricId)&&(!metric.region||metric.region==='unknown'||metric.configuration==='unknown'||metric.metricId==='mass_net'&&metric.measureBasis==='unknown'))add({kind:'calculation_scope',priority:2,product:metric.product || row.competitor,metric:metric.metric,reason:'需要确认市场版本、裸机容量及净重口径，才能计算整机标称Wh/kg'});
  }
  return gaps.filter((gap,index,all)=>all.findIndex((other)=>other.id===gap.id)===index).sort((a,b)=>a.priority-b.priority).map((gap)=>{
    const topic=[gap.product || input.baselineProduct || input.subject,gap.metric || gap.text || '技术依据'].filter(Boolean).join(' ');
    const base=Array.from(topic).slice(0,80).join('');
    const queries=[' official specifications user manual',' datasheet filetype:pdf',' technical teardown test conditions'].map((suffix)=>Array.from(base+suffix).slice(0,128).join(''));
    return {...gap,query:queries[0],queries};
  });
}
