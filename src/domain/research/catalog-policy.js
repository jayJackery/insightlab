import {catalogEvidence} from '../evidence/catalog-evidence.js?v=6cfce723d0abd3f5';
import {buildProductRegistry,sameProduct} from '../evidence/product-registry.js?v=6cfce723d0abd3f5';
import {metricDefinition,normalizeRegion} from '../evidence/metric-schema.js?v=6cfce723d0abd3f5';
export function knownCatalogMetrics(sources,input,plan={}){
 const region=normalizeRegion(plan.comparisonScope?.region||input.comparisonRegion||'unknown');
 return catalogEvidence(sources,buildProductRegistry(input,plan)).competitorRows.flatMap(row=>row.metricValues.filter(m=>m.status==='curated'&&(region==='unknown'||region==='all'||m.region===region)));
}
export function catalogHas(known,product,metric){const id=metricDefinition(metric).id;return known.some(m=>sameProduct(m.product,product)&&(id!=='unknown'&&m.metricId===id||m.metric===metric));}
export function excludeKnownSpecGaps(coverage,known){
 if(!coverage)return coverage;
 coverage.missingSpecifications=(coverage.missingSpecifications||[]).map(item=>({...item,metrics:(item.metrics||[]).filter(metric=>!catalogHas(known,item.product,metric))})).filter(item=>item.metrics.length);
 // A known metric does not close missing PACK adoption, mechanisms or conflicts.
 return coverage;
}
export function redundantCatalogQuery(query,known){
 if(/teardown|architecture|topology|patent|schematic|thermal|test conditions|use cases|application|review|拆解|原理|结构|冲突|认证|证书|验证|手册|应用|体验|评测|safety|certification/i.test(query))return false;
 const names=[...new Set(known.map(m=>m.product))],compact=s=>s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
 const product=names.find(name=>compact(query).includes(compact(name)));if(!product)return false;
 const requests=[[/capacity|容量/i,'电池容量'],[/rated|continuous|额定|持续功率/i,'持续功率'],[/weight|重量/i,'重量'],[/charg|充电/i,'充电时间'],[/warranty|质保/i,'质保'],[/price|价格/i,'价格'],[/expan|扩展|扩容/i,'扩展能力']].filter(([pattern])=>pattern.test(query)).map(([,metric])=>metric);
 if(requests.length)return requests.every(metric=>catalogHas(known,product,metric));
 return /specifications|datasheet|规格参数|官网规格/i.test(query)&&['电池容量','持续功率','重量','质保','扩展能力','电芯体系'].every(metric=>catalogHas(known,product,metric));
}
