// Deterministic structure checks complement the independent semantic review.
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
export function engineeringIssues(route, validIds,products=[]) {
  const issues = [];
  for (const key of ['principle','architecture','implementation','tradeoffs','validation']) {
    if (!Array.isArray(route[key]) || route[key].filter(nonempty).length < (key === 'implementation' ? 3 : 2)) issues.push(key+'缺少完整工程说明');
  }
  if (!nonempty(route.designProblem) || !nonempty(route.systemPath)) issues.push('缺少设计问题或系统路径');
  for (const [key, fields] of [['designDecisions',['condition','benefit','cost','decision']],['validationPlan',['failureMode','conditions','measurement','criterion','basis']]]) {
    if (!Array.isArray(route[key]) || route[key].length < 2 || route[key].some((item)=>fields.some((field)=>!nonempty(item?.[field])))) issues.push(key+'必须有至少2项完整记录');
  }
  if (!route.sourceIds?.length || route.sourceIds.some((id)=>!validIds.has(id))) issues.push('缺少有效来源');
  if (!route.questionIds?.length || route.questionIds.some((id)=>!/^Q\d+$/.test(id))) issues.push('缺少对应研究问题');
  if(products.length) {
    const mappings=Array.isArray(route.productMappings)?route.productMappings:[];
    for(const product of products)if(mappings.filter(item=>item.productId===product.id).length!==1)issues.push('缺少'+product.display+'的唯一方案对应关系');
    for(const item of mappings) {
      if(!products.some(product=>product.id===item.productId)||!['documented','proposal','unknown'].includes(item.adoptionStatus)||!nonempty(item.summary)||!nonempty(item.comparisonImplication))issues.push('型号对应记录的主体、采用关系或比较意义不完整');
      if(!Array.isArray(item.sourceIds)||item.sourceIds.some(id=>!validIds.has(id)))issues.push('型号对应记录引用无效');
      if(item.adoptionStatus==='documented'&&(!item.sourceIds?.length||!item.evidence?.length||item.evidence.some(quote=>!item.sourceIds.includes(quote.sourceId))))issues.push('已证实采用须有对应来源和逐字摘录');
    }
  }
  return issues;
}

export function normalizeEngineeringRoute(value, topic, sourceIds,{products=[],sources=[]}={}) {
  const route = {...value, heading:topic.heading, questionIds:topic.questionIds,
    sourceIds:[...new Set((value.sourceIds || []).filter((id)=>sourceIds.has(id)))]};
  for (const key of ['principle','architecture','implementation','knownLimits']) route[key]=(Array.isArray(value[key])?value[key]:[]).filter(nonempty);
  // The readable lists and structured tables are projections of the same decisions.
  route.tradeoffs=(value.designDecisions || []).map((item)=>'适用：'+item.condition+'；收益：'+item.benefit+'；代价：'+item.cost+'；选择：'+item.decision);
  route.validation=(value.validationPlan || []).map((item)=>'失效：'+item.failureMode+'；条件：'+item.conditions+'；测量：'+item.measurement+'；判据：'+item.criterion+'；依据：'+item.basis);
  if (!['documented','engineering_proposal'].includes(route.implementationBasis)) route.implementationBasis='engineering_proposal';
  if(products.length)route.productMappings=(Array.isArray(value.productMappings)?value.productMappings:[]).map(item=>{
    const compact=text=>String(text || '').replace(/\s+/gu,'');
    const evidence=(Array.isArray(item.evidence)?item.evidence:[]).filter(quote=>sources.some(source=>source.id===quote.sourceId&&source.contentKind==='page_content'&&(item.adoptionStatus!=='documented'||source.relevance!=='context')&&typeof quote.quote==='string'&&quote.quote.trim()&&compact(source.content).includes(compact(quote.quote))));
    return {...item,evidence};
  });
  const issues=engineeringIssues(route,sourceIds,products);
  if (issues.length) throw Error(topic.heading+'：'+issues.join('；'));
  return route;
}
