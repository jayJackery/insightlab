// The original brief stays immutable. Only a catalog-validated identity is a baseline.
export function researchInput(input,plan={}){
  const selection=plan.competitorSelection;
  if(!selection?.requested)return input;
  return {...input,baselineProduct:selection.baselineStatus==='confirmed'?selection.reference.name:'',baselineRequest:input.baselineProduct||''};
}
