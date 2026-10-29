import {loadCatalog} from '../../browser/catalog.js?v=69935587b51cd156';
import {selectCompetitors,comparisonApplies} from '../../domain/research/competitor-selection.js?v=69935587b51cd156';
export function createCompetitorAdvisor(options={}){
  return async(input,selection={})=>{
    if(!comparisonApplies(input))return selectCompetitors([],input,selection);
    try{const catalog=await loadCatalog(options);const records=Array.isArray(selection.baselineRecords)?selection.baselineRecords:[];return {...selectCompetitors([...catalog.products,...records],input,selection),catalogStatus:catalog.status,retrievedAt:catalog.retrievedAt,warning:catalog.warning||''};}
    catch(error){if(error.code==='BASELINE_CHOICE_INVALID')throw error;return {...selectCompetitors([],{...input,baselineChoice:''},selection),status:'unanchored',applies:false,requested:true,requiresConfirmation:false,baselineStatus:input.baselineProduct?'unresolved':'absent',catalogStatus:'unavailable',reason:'规格库暂时不可读取，可继续调研；本次不自动确认同档竞品。'+error.message};}
  };
}
