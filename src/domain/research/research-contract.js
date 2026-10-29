import { createHash } from '../../browser/shims/crypto.js?v=983914e21674fb3e';
import {resolveResearchFocus} from '../../../public/research-focus.js?v=983914e21674fb3e';
import {buildProductRegistry} from '../evidence/product-registry.js?v=983914e21674fb3e';
import {EVIDENCE_REPAIR_LIMITS} from '../evidence/evidence-gaps.js?v=983914e21674fb3e';
import {comparisonScopeFromPlan} from '../evidence/comparison-scope.js?v=983914e21674fb3e';
import {resolveReportDepth} from '../../../public/report-depth.js?v=983914e21674fb3e';
import {researchInput} from '../../../public/baseline-context.js?v=983914e21674fb3e';

export const WORKFLOW_VERSION = 'rd-research/19';
export const CONTRACT_VERSION = 4;
export const REPORT_SCHEMA_VERSION = 5;
export const REQUIREMENTS_REVISION = 'RD-2026-10-22-v17';

// Dates and policy are data, not assumptions left for the writing model.
export function buildResearchContract(input, plan, now = new Date()) {
  const end = now.toISOString().slice(0, 10);
  const relative = /近\s*([1-9]\d?)\s*年/u.exec(input.timeRange || '近三年') || (/近三年/u.test(input.timeRange || '近三年') ? [null, '3'] : null);
  const startDate = new Date(now);
  if (relative) startDate.setUTCFullYear(startDate.getUTCFullYear() - Number(relative[1]));
  const delivery=resolveReportDepth({...input,reportLength:plan.reportLength??input.reportLength});
  const effective=researchInput(input,plan);
  return {
    version: CONTRACT_VERSION, workflowVersion: WORKFLOW_VERSION, requirementsRevision: REQUIREMENTS_REVISION,
    originalInput: structuredClone(input), originalQuestions: input.questions || input.subject,
    userQuestions: (input.questions || input.subject || '').split(/[；;？?\n]+/u).map((q)=>q.trim()).filter(Boolean).map((question,index)=>({id:'U'+(index+1),question,required:true})),
    questions: (plan.questions || []).map((question, index) => ({ id: 'Q' + (index + 1), question, required: true })),
    dateScope: relative ? { kind: 'rolling', start: startDate.toISOString().slice(0, 10), end, requested: input.timeRange || '近三年，优先最新' }
      : { kind: 'user_defined', requested: input.timeRange, end, needsInterpretation: true },
    baselineProduct: effective.baselineProduct || null,requestedBaseline:input.baselineProduct||null,
    baselineResolution:plan.competitorSelection?.baselineStatus||null,
    products:buildProductRegistry(effective,plan),comparisonScope:comparisonScopeFromPlan(plan),competitorSelection:plan.competitorSelection || null,evidenceRepairLimits:{...EVIDENCE_REPAIR_LIMITS,rounds:delivery.repairRounds,totalQueries:delivery.repairQueries,maxSources:delivery.maxSources},
    focus:resolveResearchFocus({...input,analysisFocus:plan.analysisFocus ?? input.analysisFocus,reportLength:plan.reportLength??input.reportLength}),delivery,
    requiredTechnicalSections: ['principle', 'architecture', 'implementation', 'tradeoffs', 'validation'],
    sourceRules: { publicOnly: true, catalog: 'https://hellotech2.pages.dev/', adjacentDomainsAreContextOnly: true },
    completionRule: 'all_required_checks_pass',
  };
}

export function contractFingerprint(contract) {
  return createHash('sha256').update(JSON.stringify(contract)).digest('hex');
}
