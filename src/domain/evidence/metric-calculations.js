// Derived nominal specifications, never substitutes for measured delivered energy.
const as = (metric, units) => {
  if (metric?.verification?.status !== 'supported' || !Number.isFinite(metric.numericValue) || metric.numericValue <= 0) return null;
  const factor = units[String(metric.unit || '').toLowerCase()];
  return factor ? metric.numericValue * factor : null;
};
export function appendDerivedMetrics(evidence) {
  for (const row of evidence.competitorRows || []) {
    const metrics = row.metricValues || [];
    const capacity = metrics.find((metric)=>metric.metricId==='capacity_nominal'||/^(电池容量|容量|capacity)$/i.test(metric.metric));
    const mass = metrics.find((metric)=>metric.metricId==='mass_net'||/^(重量|净重|整机重量|weight)$/i.test(metric.metric));
    const wh = as(capacity,{wh:1,kwh:1000}), kg = as(mass,{kg:1,g:0.001});
    const sameScope = capacity?.status==='disclosed'&&mass?.status==='disclosed'&&capacity.productId===mass.productId&&capacity?.region && !['unknown','未注明'].includes(capacity.region) && capacity.region === mass?.region
      && capacity.configuration === 'bare_unit' && mass?.configuration === 'bare_unit'
      && mass.measureBasis === 'whole_unit';
    if (!wh || !kg || !sameScope) continue;
    const existing=metrics.findIndex((metric)=>metric.metricId==='specific_energy_nominal'||metric.metric==='标称容量/整机重量');
    const computed={metric:'标称容量/整机重量',status:'derived',value:Number((wh/kg).toFixed(1)),numericValue:Number((wh/kg).toFixed(1)),unit:'Wh/kg',
      metricId:'specific_energy_nominal',productId:row.productId,basis:'calculated',formula:'标称容量(Wh) ÷ 裸机净重(kg)',inputs:[structuredClone(capacity),structuredClone(mass)],
      region:capacity.region,configuration:'bare_unit',measureBasis:'nominal_capacity_per_unit_mass',
      sourceIds:[...new Set([...(capacity.sourceIds || []),...(mass.sourceIds || [])])],
      note:'计算值；不等于电池包级能量密度或实测AC可输出电量。',verification:{status:'supported',method:'deterministic_calculation'}};
    if(existing>=0) {computed.observations=structuredClone(metrics[existing].observations || [metrics[existing]]);metrics[existing]=computed;}
    else metrics.push(computed);
  }
  return evidence;
}
