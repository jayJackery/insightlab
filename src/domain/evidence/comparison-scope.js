import {normalizeRegion} from './metric-schema.js?v=6cfce723d0abd3f5';
import {sameProduct} from './product-registry.js?v=6cfce723d0abd3f5';

export function comparisonScopeFromPlan(plan) {
  if(plan.comparisonScope?.region==='all')return {region:'all',configuration:'bare_unit',basis:'覆盖所有地区；同型号地区版本和来源条件分别保留'};
  if(plan.comparisonScope?.region&&plan.comparisonScope.configuration==='bare_unit')return {region:normalizeRegion(plan.comparisonScope.region),configuration:'bare_unit',basis:'明确的计划比较口径'};
  const assumption=(plan.assumptions || []).find((line)=>line.includes('按美国市场裸机资料比较')&&line.includes('其他地区和套装资料单列'));
  return assumption?{region:'US',configuration:'bare_unit',basis:assumption}:null;
}
export function scopeObservations(metric,row,scope) {
  const observations=metric.observations || [metric];
  const eligible=observations.filter((item)=>['disclosed','curated'].includes(item.status)&&normalizeRegion(item.region)===scope.region&&(item.configuration===scope.configuration||(item.status==='curated'&&item.configuration==='unknown'))&&sameProduct(item.product,row.competitor));
  return {eligible,variants:observations.filter((item)=>!eligible.includes(item))};
}
