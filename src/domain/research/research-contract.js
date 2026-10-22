import { createHash } from '../../browser/shims/crypto.js';
import {resolveResearchFocus} from '../../../public/research-focus.js';
import {buildProductRegistry} from '../evidence/product-registry.js';
import {EVIDENCE_REPAIR_LIMITS} from '../evidence/evidence-gaps.js';
import {comparisonScopeFromPlan} from '../evidence/comparison-scope.js';

export const WORKFLOW_VERSION = 'rd-research/15';
export const CONTRACT_VERSION = 4;
export const REPORT_SCHEMA_VERSION = 5;
export const REQUIREMENTS_REVISION = 'RD-2026-10-21-v12';

// Dates and policy are data, not assumptions left for the writing model.
export function buildResearchContract(input, plan, now = new Date()) {
  const end = now.toISOString().slice(0, 10);
  const relative = /近\s*([1-9]\d?)\s*年/u.exec(input.timeRange || '近三年') || (/近三年/u.test(input.timeRange || '近三年') ? [null, '3'] : null);
  const startDate = new Date(now);
  if (relative) startDate.setUTCFullYear(startDate.getUTCFullYear() - Number(relative[1]));
  return {
    version: CONTRACT_VERSION, workflowVersion: WORKFLOW_VERSION, requirementsRevision: REQUIREMENTS_REVISION,
    originalInput: structuredClone(input), originalQuestions: input.questions || input.subject,
    userQuestions: (input.questions || input.subject || '').split(/[；;？?\n]+/u).map((q)=>q.trim()).filter(Boolean).map((question,index)=>({id:'U'+(index+1),question,required:true})),
    questions: (plan.questions || []).map((question, index) => ({ id: 'Q' + (index + 1), question, required: true })),
    dateScope: relative ? { kind: 'rolling', start: startDate.toISOString().slice(0, 10), end, requested: input.timeRange || '近三年，优先最新' }
      : { kind: 'user_defined', requested: input.timeRange, end, needsInterpretation: true },
    baselineProduct: input.baselineProduct || null,
    products:buildProductRegistry(input,plan),comparisonScope:comparisonScopeFromPlan(plan),competitorSelection:plan.competitorSelection || null,evidenceRepairLimits:EVIDENCE_REPAIR_LIMITS,
    focus:resolveResearchFocus({...input,analysisFocus:plan.analysisFocus ?? input.analysisFocus}),
    requiredTechnicalSections: ['principle', 'architecture', 'implementation', 'tradeoffs', 'validation'],
    sourceRules: { publicOnly: true, catalog: 'https://hellotech2.pages.dev/', adjacentDomainsAreContextOnly: true },
    completionRule: 'all_required_checks_pass',
  };
}

export function contractFingerprint(contract) {
  return createHash('sha256').update(JSON.stringify(contract)).digest('hex');
}
