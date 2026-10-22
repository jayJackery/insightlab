import {metricLabels} from './metric-labels.js';
export function hasUsableComparisonValue(row){
 return (row.metricValues||[]).some(metric=>{
  if(!metricLabels([metric.metric]).length)return false;
  const state=metric.presentation?.state||(metric.verification?.status==='needs_review'?'needs_review':metric.status);
  const value=metric.presentation?.label??metric.value;
  return ['curated','disclosed','derived'].includes(state)&&value!==null&&value!==undefined&&String(value).trim()!==''&&!/^(?:—|-|未知|待核验|本轮未找到|数据不可比)$/u.test(String(value).trim());
 });
}
export function visibleComparisonRows(rows,isBaseline=()=>false){return (rows||[]).filter(row=>isBaseline(row)||hasUsableComparisonValue(row));}
