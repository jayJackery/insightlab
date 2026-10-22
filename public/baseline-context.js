// The original brief stays immutable. Only a catalog-validated identity is a baseline.
export function researchInput(input,plan={}){
  const selection=plan.competitorSelection;
  const scope=Array.isArray(plan.competitors)?{...input,competitors:plan.competitors.join('、')}:input;
  if(!selection?.requested)return scope;
  return {...scope,baselineProduct:selection.baselineStatus==='confirmed'?selection.reference.name:'',baselineRequest:input.baselineProduct||''};
}
