import {resolveProduct,sameProduct} from './product-registry.js?v=983914e21674fb3e';

const definitions=[
 ['capacity_nominal','电池容量',['容量','capacity','battery capacity']],
 ['power_continuous','持续功率',['额定功率','ac continuous output','rated power']],
 ['power_surge','峰值功率',['surge power','peak power']],
 ['power_xboost','X-Boost功率',['x-boost']],
 ['power_summary','持续/峰值功率',[]],
 ['mass_net','重量',['净重','整机重量','net weight','weight']],
 ['charge_time','充电时间',['charging time']],
 ['power_ac_charge','AC充电输入',['AC输入功率','AC charging input']],
 ['chemistry','电芯体系',['电池体系','chemistry','battery type']],
 ['safety_summary','电芯与安全',[]],
 ['expandability','扩展能力',['scalability']],
 ['price','价格',['price']],['warranty','质保',['保修','warranty']],
 ['ingress_rating','防护等级',['ip等级','ip rating']],
 ['cycle_life','循环寿命',['battery lifecycle','cycle life']],
 ['specific_energy_nominal','标称容量/整机重量',[]],
];
const key=(value)=>String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g,'').trim();
export const METRIC_DEFINITIONS=definitions.map(([id,label,aliases])=>({id,label,aliases}));
export function metricDefinition(label) {
  return METRIC_DEFINITIONS.find((item)=>[item.id,item.label,...item.aliases].some((name)=>key(name)===key(label))) || {id:'custom:'+key(label),label,aliases:[]};
}
const componentAliases={'整机':'whole_unit','whole_unit':'whole_unit','电池包':'pack','pack':'pack','电芯':'cell','cell':'cell','附件':'accessory','accessory':'accessory'};
const regionAliases={'美国':'US','us':'US','usa':'US','欧洲':'EU','eu':'EU','英国':'UK','uk':'UK','中国':'CN','cn':'CN','日本':'JP','jp':'JP'};
export const normalizeRegion=(value)=>regionAliases[key(value)] || (typeof value==='string'&&value.trim()&&!/未知|未注明|unknown/i.test(value)?value.trim():'unknown');

export function validateEvidenceBatch(value) {
  const fail=(message)=>{throw new Error('证据结构不完整：'+message+'。已保留前序阶段，不能把格式错误当作未披露。');};
  if(!value||!Array.isArray(value.claims)||!Array.isArray(value.competitorRows))fail('缺少事实或产品数组');
  if(value.claims.length>12||value.competitorRows.length>12)fail('本批返回过多记录');
  for(const claim of value.claims)if(!claim||typeof claim.claim!=='string'||!Array.isArray(claim.sourceIds)||!['公开事实','分析推断','未知','待核实'].includes(claim.type))fail('事实正文、类型或来源字段无效');
  for(const row of value.competitorRows) {
    if(!row||typeof row.competitor!=='string'||!Array.isArray(row.metricValues)||row.metricValues.length>50)fail('产品型号或指标数组无效');
    for(const metric of row.metricValues) {
      if(!metric||typeof metric.metric!=='string'||!['disclosed','not_disclosed','not_comparable','not_found','conflict'].includes(metric.status)||!Array.isArray(metric.sourceIds)||!['string','number'].includes(typeof metric.value)&&metric.value!==null&&metric.value!==undefined)fail('指标名称、数值、状态或来源字段无效');
      if(['product','unit','region','configuration','component','measureBasis','condition','note'].some((field)=>metric[field]!=null&&typeof metric[field]!=='string'))fail('指标的型号、单位或条件字段必须是文字');
      metric.metricId=metricDefinition(metric.metric).id;
      if(metric.status==='disclosed' && metricDimensionIssues(metric).length)fail(metric.metric+'：'+metricDimensionIssues(metric).join('；'));
    }
  }
  return value;
}
export function metricDimensionIssues(metric) {
  const id=metricDefinition(metric.metric).id,unit=key(metric.unit),issues=[];
  if(id==='charge_time' && /^(?:w|kw|wh|kwh|瓦|千瓦)$/.test(unit))issues.push('充电时间不能以功率或能量单位记录，请提取原文时长或另记充电功率');
  if(id==='mass_net' && /^(?:wh|kwh|w|kw)$/.test(unit))issues.push('重量单位与维度不符');
  if(id==='capacity_nominal' && /^(?:kg|g|w|kw)$/.test(unit))issues.push('容量单位与维度不符');
  return issues;
}
export function bindEvidenceEntities(evidence,registry,sources) {
  const sourceIds=new Set(sources.map((source)=>source.id));
  for(const row of evidence.competitorRows || []) {
    row.productEntity=resolveProduct(row.competitor,registry);
    row.productId=row.productEntity.id;
    row.evidenceIds=(Array.isArray(row.evidenceIds)?row.evidenceIds:[]).filter((id)=>sourceIds.has(id));
    for(const metric of row.metricValues || []) {
      metric.metricId=metricDefinition(metric.metric).id;
      metric.entityIssues=[];
      for(const message of metricDimensionIssues(metric))metric.entityIssues.push({code:'DIMENSION_MISMATCH',message});
      if(metric.status==='disclosed'&&(metric.value===null||metric.value===undefined||metric.value===''))metric.entityIssues.push({code:'VALUE_MISSING',message:'已披露状态没有提供原文值。'});
      if(!metric.product||!sameProduct(metric.product,row.competitor))metric.entityIssues.push({code:'PRODUCT_MISMATCH',message:'参数必须明确绑定与所在产品行一致的准确型号。'});
      if(row.productEntity.status==='unresolved'||row.productEntity.status==='brand_scope')metric.entityIssues.push({code:'PRODUCT_UNRESOLVED',message:'尚未与研究计划中的准确型号匹配，需要锁定型号。'});
      metric.productId=row.productId;
      metric.sourceIds=(metric.sourceIds || []).filter((id)=>sourceIds.has(id));
      metric.region=normalizeRegion(metric.region);
      metric.component=componentAliases[metric.component] || 'unknown';
      if(!['bare_unit','bundle','refurbished'].includes(metric.configuration))metric.configuration='unknown';
      if(!['whole_unit','pack','cell'].includes(metric.measureBasis))metric.measureBasis='unknown';
      if(metric.numericValue!==null&&metric.numericValue!==undefined&&!Number.isFinite(metric.numericValue))metric.entityIssues.push({code:'NUMBER_INVALID',message:'数值字段不是有限数值，不可参与计算。'});
      if(!metric.sourceIds.length&&metric.status==='disclosed')metric.entityIssues.push({code:'SOURCE_MISSING',message:'披露值缺少可追溯来源。'});
      if(metric.status==='not_disclosed')metric.status='not_found';
      if(['safety_summary','power_summary'].includes(metric.metricId)&&Number.isFinite(metric.numericValue))metric.entityIssues.push({code:'COMPOSITE_NUMERIC',message:'复合维度不能当作单一数值。'});
    }
  }
  evidence.competitorRows.sort((a,b)=>Number(b.productEntity.baseline)-Number(a.productEntity.baseline));
  return evidence;
}
