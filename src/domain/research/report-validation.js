// Structural checks run before normalization so missing answers cannot become silent defaults.
export function validateReportAnswers(report,contract,sourceIds) {
  for(const [field,questions] of [['userQuestionAnswers',contract.userQuestions],['questionAnswers',contract.questions]]) {
    const answers=report[field];
    if(!Array.isArray(answers)||answers.length!==questions.length)throw Error(field+'须逐一包含全部问题，不能遗漏或重复');
    for(const question of questions) {
      const matches=answers.filter((answer)=>answer?.questionId===question.id),answer=matches[0];
      if(matches.length!==1||typeof answer.answer!=='string'||!answer.answer.trim())throw Error(question.id+'必须有唯一的直接答案answer');
      if(!['证据支持','部分支持','证据不足'].includes(answer.status))throw Error(question.id+'的status须为证据支持/部分支持/证据不足');
      if(!Array.isArray(answer.citations)||answer.citations.some((id)=>!sourceIds.has(id)))throw Error(question.id+'引用了未知来源');
      if(!Array.isArray(answer.evidence))throw Error(question.id+'缺少evidence数组；无逐字引文时显式传[]');
      if(field==='userQuestionAnswers'&&(!Array.isArray(answer.relatedQuestionIds)||!answer.relatedQuestionIds.length||answer.relatedQuestionIds.some((id)=>!contract.questions.some((q)=>q.id===id))))throw Error(question.id+'缺少有效relatedQuestionIds研究问题映射');
    }
  }
  return report;
}

export function unapprovedDerivedValues(report,evidence) {
  const allowed=(evidence.competitorRows || []).flatMap((row)=>row.metricValues || []).filter((m)=>m.status==='derived'&&m.formula&&m.inputs?.length&&m.verification?.method==='deterministic_calculation').map((m)=>Number(m.numericValue ?? m.value));
  const text=JSON.stringify({summary:report.executiveSummary,answers:report.userQuestionAnswers || report.questionAnswers,routes:report.technologyDeepDives,recommendations:report.recommendations});
  return [...new Set([...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:Wh\s*\/\s*kg|瓦时\s*\/\s*千克)/gi)].map((match)=>Number(match[1])).filter((value)=>!allowed.some((n)=>Number.isFinite(n)&&Math.abs(n-value)<0.06)))];
}

export function evidenceForWriting(evidence) {
  const value=structuredClone(evidence);
  value.excludedFacts=(value.claims || []).filter((claim)=>claim.type==='公开事实'&&claim.verification?.status!=='supported').map((claim)=>({claim:claim.claim,reason:claim.verification?.reason || '未核验'}));
  value.claims=(value.claims || []).filter((claim)=>claim.type!=='公开事实'||claim.verification?.status==='supported');
  for(const row of value.competitorRows || [])row.metricValues=(row.metricValues || []).map((metric)=>{
    // Raw observations remain in persisted evidence; they are not approved report facts.
    const {observations,scopeVariants,...head}=metric;
    if(metric.status==='curated')return head;
    if(metric.status==='disclosed'&&metric.verification?.status!=='supported'){const catalog=metric.catalogObservations?.find(item=>item.status==='curated');return catalog?{...catalog,note:catalog.note+'；其他来源尚未核验通过。'}:{metric:metric.metric,metricId:metric.metricId,status:'pending_verification',note:metric.verification?.reason || '本轮未核验通过'};}
    if(!['disclosed','derived'].includes(metric.status))return {metric:metric.metric,metricId:metric.metricId,status:metric.status,note:metric.note,catalogValues:metric.catalogObservations||[]};
    return head;
  });
  delete value.audit;
  return value;
}
