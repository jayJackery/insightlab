import {reviewChecklist,editableReportTargets} from '../evidence/review-checklist.js?v=8e1e00bb1d41da9f';
import {contentBalance} from './engineering-policy.js?v=8e1e00bb1d41da9f';
import {evaluatePublication} from './publication-gate.js?v=8e1e00bb1d41da9f';
import {metricPresentation} from '../evidence/metric-presentation.js?v=8e1e00bb1d41da9f';
import {boundaryPresentation} from '../evidence/boundary-presentation.js?v=8e1e00bb1d41da9f';
import {sourceDisplayTitle} from '../evidence/source-presentation.js?v=8e1e00bb1d41da9f';
import {presentationProductsForTask,sameProduct} from '../evidence/product-registry.js?v=8e1e00bb1d41da9f';
import {catalogDisplayName} from '../../../public/product-identity.js?v=8e1e00bb1d41da9f';

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
  if(report){task.reviewChecklist=reviewChecklist({...task});task.reviewTargets=editableReportTargets(report);}
  return task;
}
