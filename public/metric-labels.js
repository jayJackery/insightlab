// Shared by plan normalization and historical rendering. Narrative is not a metric.
export function metricLabels(values=[]){
  return [...new Set(values.filter(value=>typeof value==='string').map(value=>value.trim()).filter(value=>value&&value.length<=30&&!/[。；;\n]/u.test(value)&&!/(?:同档对比|指标覆盖|阈值内|基准.*竞品|缺失项标注|仅限|不能|应当)/u.test(value)))];
}
