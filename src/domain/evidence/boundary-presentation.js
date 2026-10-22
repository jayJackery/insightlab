// Local extraction notes describe one batch, not the final state of the whole study.
export function boundaryPresentation(evidence={},research={},report={}) {
  const current=[];
  for(const check of evidence.audit?.checks || [])if(check.status!=='supported')current.push({kind:'事实待核验',message:[check.product,check.metric,check.reason].filter(Boolean).join(' · '),sourceIds:[...new Set((check.support || []).map((item)=>item.sourceId).filter(Boolean))]});
  for(const question of research.coverageReview?.questions || [])if(question.status!=='answered')current.push({kind:'问题覆盖不足',message:question.questionId+' · '+(question.missing || question.question || '证据尚不充分'),sourceIds:[]});
  for(const finding of report.answerAudit?.findings || [])current.push({kind:finding.severity==='blocking'?'结论需修订':'结论边界',message:finding.message,sourceIds:[]});
  return {current,raw:{conflicts:evidence.conflicts || [],gaps:evidence.gaps || []},note:'提取批次的原始备注可能已被后续来源补齐，不代表当前全局缺口。当前未解决项以覆盖审查、事实核验与答案复核为准。'};
}
