// Keep unanswered questions and user constraints in the audit trail rather
// than presenting them as discoveries. This does not modify saved reports.
export function presentableFinding(item) {
  if (!item || (item.kind || item.status) === '证据不足') return false;
  const q=String(item.question||'').trim();
  if(!q)return false;
  return !/^(?:仅研究|只研究|请生成|请撰写|技术方案绑定|应用前关键复核|优先使用|不得|不要|不猜|不编造|没有准确拆解证据时)/u.test(q);
}

export function selectResearchFindings(report={}) {
  const answers=Array.isArray(report.questionAnswers)&&report.questionAnswers.length?report.questionAnswers:(report.keyFindings||[]);
  return answers.filter(presentableFinding);
}
