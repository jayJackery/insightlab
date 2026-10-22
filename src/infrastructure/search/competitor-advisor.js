import {loadCatalog} from '../../browser/catalog.js';
import {selectCompetitors,comparisonApplies} from '../../domain/research/competitor-selection.js';
export function createCompetitorAdvisor(options={}){
  return async(input,selection={})=>{
    if(!comparisonApplies(input))return selectCompetitors([],input,selection);
    try{const catalog=await loadCatalog(options);return {...selectCompetitors(catalog.products,input,selection),catalogStatus:catalog.status,retrievedAt:catalog.retrievedAt,warning:catalog.warning||''};}
    catch(error){return {status:'catalog_unavailable',applies:true,requiresConfirmation:true,rows:[],recommendations:[],reason:'规格库暂时不可读取，不能自动确认同档竞品：'+error.message};}
  };
}
