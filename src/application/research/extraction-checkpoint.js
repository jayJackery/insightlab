import {createHash} from '../../browser/shims/crypto.js?v=983914e21674fb3e';
import {sourceContext} from '../../domain/evidence/report-content.js?v=983914e21674fb3e';

// The signature follows model-visible inputs, not storage/build metadata.
export function extractionInputSignature({inputText,plan,criteria,definitions,products,batch}) {
  const value=['evidence-extraction-v1',inputText,plan,criteria,definitions,products,sourceContext(batch,plan,batch.length===1?12000:16000)];
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function equivalentResearchScope(previous,current,previousPlan,currentPlan) {
  if(!previous||!current||!previousPlan||!currentPlan)return false;
  const fields=['originalInput','userQuestions','questions','dateScope','baselineProduct','requestedBaseline','baselineResolution','products','comparisonScope','focus','delivery','evidenceRepairLimits','requiredTechnicalSections','sourceRules','requirementsRevision'];
  const choose=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]??null]));
  const planFields=['questions','queries','criteria','competitors','analysisFocus','reportLength','comparisonScope'];
  const decision=value=>({applies:value?.competitorSelection?.applies??null,status:value?.competitorSelection?.status??null,crossTierConfirmed:value?.competitorSelection?.crossTierConfirmed??null,policy:value?.competitorSelection?.policy??null});
  return JSON.stringify(choose(previous,fields))===JSON.stringify(choose(current,fields))&&JSON.stringify(choose(previousPlan,planFields))===JSON.stringify(choose(currentPlan,planFields))&&JSON.stringify(decision(previous))===JSON.stringify(decision(current));
}

export function savedSearchDecision({research={},signature,workflowVersion,sameScope,evidence={},equivalentScope=false}) {
  if(!research.sources?.length||!['passed','limited'].includes(research.searchQuality?.status))return 'search';
  if(research.runtime?.workflowVersion===workflowVersion&&research.contractSignature===signature)return 'resume';
  if(research.runtime?.workflowVersion===workflowVersion&&sameScope&&equivalentScope)return 'resume';
  if(research.runtime?.workflowVersion==='rd-research/18'&&sameScope&&evidence.audit?.status==='passed')return 'resume';
  const version=Number(/^rd-research\/(\d+)$/.exec(research.runtime?.workflowVersion||'')?.[1]);
  return sameScope&&version>=6&&version<=19?'revalidate':'search';
}

// "needs_review" can be a complete set of fact decisions; reuse those
// decisions without treating uncertain facts as supported or publishable.
export function reusableAuditedEvidence(evidence={}) {
  const audit=evidence.audit;
  return audit?.version==='independent-fact-v7'&&['passed','needs_review'].includes(audit.status)&&Array.isArray(audit.checks)&&audit.checks.length>0&&audit.checks.every(check=>['supported','needs_review'].includes(check.status));
}
