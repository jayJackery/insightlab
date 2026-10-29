import { contentBalance } from './engineering-policy.js?v=6cfce723d0abd3f5';
import { REPORT_SCHEMA_VERSION, WORKFLOW_VERSION, REQUIREMENTS_REVISION, contractFingerprint } from './research-contract.js?v=6cfce723d0abd3f5';
import {sameProduct} from '../evidence/product-registry.js?v=6cfce723d0abd3f5';
import {engineeringIssues} from './engineering-detail.js?v=6cfce723d0abd3f5';
import {unapprovedDerivedValues} from './report-validation.js?v=6cfce723d0abd3f5';

export function evaluatePublication({ input = {}, research = {}, evidence = {}, report }) {
  const issues = [];
  const add = (code, message, detail) => issues.push({ code, message, ...(detail ? { detail } : {}) });
  if (!report) return { status: 'not_ready', publishable: false, issues: [] };
  if (!research.contract || report.schemaVersion !== REPORT_SCHEMA_VERSION || report.workflowVersion !== WORKFLOW_VERSION) {
    return { status: 'legacy_unverified', publishable: false, issues: [{ code: 'VERSION_UNVERIFIED', message: '历史报告缺少当前需求契约和验收记录，保留阅读，不能视为已通过研发验收。' }], contentBalance: contentBalance(report) };
  }
  if(report.manualRevisions?.length)add('USER_REVISION','含用户复核修订，必须独立核验修订内容，不能沿用原验收结果。');
  const balance = contentBalance(report,research.contract.focus);
  const unsupportedCalculations=unapprovedDerivedValues(report,evidence);
  if(unsupportedCalculations.length)add('DERIVATION_UNVERIFIED','报告含未由确定性计算器支持的Wh/kg值：'+unsupportedCalculations.join('、'));
  const narrative=JSON.stringify({executiveSummary:report.executiveSummary,userQuestionAnswers:report.userQuestionAnswers,questionAnswers:report.questionAnswers,technologyDeepDives:report.technologyDeepDives,recommendations:report.recommendations});
  if(narrative.split(/[。；\n]/u).some(sentence=>/(?:均|都|两款|两者)[^。；]{0,18}(?:无公开拆解|没有公开拆解|不存在公开拆解)/u.test(sentence)&&!/本轮|本次|本批|本研究/u.test(sentence)))add('UNBOUNDED_ABSENCE','报告把本轮未找到的拆解资料写成普遍不存在，须改为本轮检索范围内的结果。');
  if (research.contract.requirementsRevision !== REQUIREMENTS_REVISION || report.contractSignature !== contractFingerprint(research.contract)) add('CONTRACT_CHANGED','报告与已保存的需求契约不一致，须重新验收。');
  if (!research.contract.questions?.length) add('QUESTIONS_MISSING','需求契约没有研究问题。');
  if(!research.contract.focus)add('FOCUS_MISSING','未保存本次确认的分析侧重点。');
  const selection=research.contract.competitorSelection;
  if(selection?.applies&&(selection.status!=='ready'||selection.rows?.some(row=>row.status!=='comparable')&&!selection.crossTierConfirmed))add('COMPARISON_UNCONFIRMED','竞品档位、地区或跨档参考尚未明确确认。');
  if (!balance.passed) add('TECHNICAL_SHARE', '技术正文当前为'+(balance.technicalShare*100).toFixed(1)+'%，尚未满足用户明确指定的区间'+(research.contract.focus?.targetRange || []).map(value=>Math.round(value*100)+'%').join('–')+'。');
  const sourceIds = new Set((research.sources || []).map((source) => source.id));
  const answers = report.questionAnswers || [];
  if (!research.contract.userQuestions?.length) add('ORIGINAL_QUESTIONS_MISSING','原始问题未保存在契约中。');
  for (const question of research.contract.userQuestions || []) {
    const answer=(report.userQuestionAnswers || []).find((item)=>item.questionId===question.id);
    const independentlyAnswered=report.answerAudit?.status==='passed'&&report.answerAudit.questions?.some(item=>item.questionId===question.id&&item.status==='answered');
    const reason=!answer?.text?.trim()?'缺少直接答案':!answer.relatedQuestionIds?.length||answer.relatedQuestionIds.some((id)=>!research.contract.questions.some((q)=>q.id===id))?'缺少有效的研究问题映射':!answer.citations?.length||answer.citations.some((id)=>!sourceIds.has(id))?'缺少有效来源':answer.kind!=='证据支持'&&!independentlyAnswered?'目前仅部分支持或证据不足，需要补齐关键证据':'';
    if(reason)add('ORIGINAL_QUESTION_INCOMPLETE',question.id+'原始问题'+reason+'。',question.question);
  }
  for (const question of research.contract.questions) {
    const answer = answers.find((item) => item.questionId === question.id);
    const independentlyAnswered=report.answerAudit?.status==='passed'&&report.answerAudit.questions?.some(item=>item.questionId===question.id&&item.status==='answered');
    if (!answer?.text?.trim() || answer.kind !== '证据支持'&&!independentlyAnswered || !answer.citations?.length || answer.citations.some((id) => !sourceIds.has(id))) {
      add('QUESTION_INCOMPLETE', question.id + '尚未形成证据支持的直接答案。', question.question);
    }
  }
  const routes = report.technologyDeepDives || [];
  if (routes.length < (research.contract.focus?.minimumTopics ?? 0)) add('TECHNICAL_DEPTH', '当前侧重需要至少'+research.contract.focus.minimumTopics+'个有依据的技术主题。');
  for (const route of routes) {
    for (const issue of engineeringIssues(route,sourceIds,(research.contract.products || []).filter(product=>product.exact))) add('ENGINEERING_DETAIL',(route.heading || '技术主题')+'：'+issue);
    for (const gap of route.completionGaps || []) add('ENGINEERING_DETAIL_UNRESOLVED',(route.heading || '技术主题')+'：'+gap+'；已保留草稿，需补充证据后再作为正式结论。');
    for (const group of research.contract.requiredTechnicalSections) {
      if (!Array.isArray(route[group]) || route[group].length < (group === 'implementation' ? 3 : 2)) add('TECHNICAL_STRUCTURE', (route.heading || '技术主题') + '的' + group + '不完整。');
    }
    if (!route.sourceIds?.length || route.sourceIds.some((id) => !sourceIds.has(id))) add('TECHNICAL_CITATIONS', (route.heading || '技术主题') + '缺少有效来源。');
  }
  if (research.searchQuality?.status !== 'passed') add('SEARCH_QUALITY', '检索来源尚未通过质量检查。');
  if (!research.coverageReview || research.coverageReview.questions?.some((q) => q.status !== 'answered')) add('QUESTION_COVERAGE', '来源覆盖审查仍有未回答的研究问题。');
  if (!evidence.audit || !Array.isArray(evidence.audit.checks) || !evidence.audit.checks.length || evidence.audit.checks.some(item=>!['supported','needs_review'].includes(item.status)) || !evidence.audit.checks.some(item=>item.status==='supported')) add('EVIDENCE_AUDIT', '事实与产品型号、部件和条件的核验尚未完成。');
  if((evidence.competitorRows||[]).some(row=>(row.metricValues||[]).some(metric=>metric.status==='curated'&&(metric.verification?.method!=='typed_catalog_field'||!metric.sourceIds?.some(id=>(research.sources||[]).some(source=>source.id===id&&source.provider==='team_catalog'&&source.catalogRecord))))))add('CATALOG_PROVENANCE','部分整理值缺少可定位的规格库原字段或来源，须补齐出处。');
  if (!Array.isArray(research.gapClassification)) add('GAP_CLASSIFICATION_MISSING','证据缺口尚未分类，不能确认未核验事实是否影响结论。');
  else if(research.gapClassification.some(item=>item.usedInReport))add('FACT_UNVERIFIED','报告仍包含尚未核验通过的事实，须修订或补充证据。');
  if(research.gapClassification?.some(item=>item.usedInReport===null))add('GAP_USAGE_UNRESOLVED','部分证据缺口尚未确认是否影响正文，不能作为已通过验收的结论。');
  if (!report.answerAudit || report.answerAudit.status !== 'passed') add('ANSWER_AUDIT', '答案与原始需求、证据和工程适用性的独立复核尚未通过。');
  if (routes.some((_,index)=>report.answerAudit?.technicalTopics?.find((item)=>item.topicIndex===index)?.status!=='deep')) add('SEMANTIC_DEPTH','至少一个技术主题未通过独立工程深度审查。');
  const baseline=research.contract.baselineProduct;
  if (baseline && !(evidence.competitorRows || []).some((row) => sameProduct(row.competitor,baseline))) add('BASELINE_MISSING', '缺少已确认的基准产品。');
  return { status: issues.length ? 'needs_review' : 'passed', publishable: issues.length === 0, issues, contentBalance: balance, checkedAt: new Date().toISOString(), workflowVersion: WORKFLOW_VERSION };
}

export function assertPublication(task) {
  const result = evaluatePublication(task);
  if (!result.publishable) throw new Error('报告未通过研发验收：' + result.issues.map((issue) => issue.message).join('；'));
  return result;
}
