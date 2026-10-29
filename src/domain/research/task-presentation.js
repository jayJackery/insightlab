import {reviewChecklist,editableReportTargets} from '../evidence/review-checklist.js?v=6cfce723d0abd3f5';
import {contentBalance} from './engineering-policy.js?v=6cfce723d0abd3f5';
import {evaluatePublication} from './publication-gate.js?v=6cfce723d0abd3f5';
import {metricPresentation} from '../evidence/metric-presentation.js?v=6cfce723d0abd3f5';
import {boundaryPresentation} from '../evidence/boundary-presentation.js?v=6cfce723d0abd3f5';
import {sourceDisplayTitle} from '../evidence/source-presentation.js?v=6cfce723d0abd3f5';
import {presentationProductsForTask,sameProduct} from '../evidence/product-registry.js?v=6cfce723d0abd3f5';
import {catalogDisplayName} from '../../../public/product-identity.js?v=6cfce723d0abd3f5';

// One read model for SQLite and IndexedDB; presentation never changes stored facts.
export function presentTask(raw) {
  const task=structuredClone(raw),{input,research,evidence,report}=task;
  for(const product of evidence?.competitorRows||[]){
    for(const metric of product.metricValues||[])metric.presentation=metricPresentation(metric);
    product.comparisonEligibility=research?.plan?.competitorSelection?.rows?.find(row=>sameProduct(row.name,product.competitor))||null;
  }
  if(evidence)evidence.boundaryPresentation=boundaryPresentation(evidence,research||{},report||{});
  for(const source of research?.sources||[])source.displayTitle=sourceDisplayTitle(source);
  if(research)research.presentationProducts=presentationProductsForTask({research,evidence}).map(product=>({...product,catalogRecords:(research.sources||[]).filter(source=>source.provider==='team_catalog'&&source.catalogRecord&&sameProduct(catalogDisplayName(source.catalogRecord),product.display)).map(source=>({sourceId:source.id,id:source.catalogProductId,regions:source.catalogRecord.regions||[],capacityWh:source.catalogRecord.metrics?.capacityWh,ratedPowerW:source.catalogRecord.metrics?.ratedPowerW??source.catalogRecord.metrics?.acPowerW,verifiedDate:source.catalogVerifiedDate}))}));
  if(report)report.contentBalance=contentBalance(report);
  task.quality=evaluatePublication({input,research:research||{},evidence:evidence||{},report});
  if(report&&['running','queued','planning'].includes(task.status))task.quality={...task.quality,status:'needs_review',publishable:false,issues:[...(task.quality.issues||[]).filter(issue=>issue.code!=='REVIEW_IN_PROGRESS'),{code:'REVIEW_IN_PROGRESS',message:'研究仍在进行或复核中；当前内容仅为待核验草稿。'}]};
  if(report){task.reviewChecklist=reviewChecklist({...task});task.reviewTargets=editableReportTargets(report);}
  return task;
}
