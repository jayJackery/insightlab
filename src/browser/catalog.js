import {CATALOG_DATA_URL,parseCatalog,requestedProducts,matchProducts,catalogSources} from '../infrastructure/search/catalog-records.js?v=7860f20d981283d9';
import {readVirtualFile,saveVirtualFile} from './storage.js?v=7860f20d981283d9';
export * from '../infrastructure/search/catalog-records.js?v=7860f20d981283d9';
let pending=null,memo=null,expires=0;
export async function loadCatalog(){
  if(memo&&Date.now()<expires)return memo;
  if(pending)return pending;
  pending=(async()=>{
    let cached;try{cached=JSON.parse(readVirtualFile('catalog.json'));}catch{}
    try{
      const response=await fetch(CATALOG_DATA_URL,{signal:AbortSignal.timeout(7000),credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const raw=await response.text();if(raw.length>8000000)throw Error('规格库文件过大');
      const products=parseCatalog(raw);if(!products.length)throw Error('规格库没有可读取产品');
      const data={products,retrievedAt:new Date().toISOString()};saveVirtualFile('catalog.json',JSON.stringify(data));memo={...data,status:'live'};expires=Date.now()+6*3600000;
    }catch{
      const response=await fetch(new URL('../../assets/catalog-snapshot.json',import.meta.url)).catch(()=>null);
      if(!response?.ok&&!cached)throw Error('无法读取公开规格库和随网站提供的快照，请检查网络。');
      const bundled=response?.ok?await response.json():null;
      const data=cached&&(!bundled||Date.parse(cached.retrievedAt)>Date.parse(bundled.retrievedAt))?cached:bundled;
      if(!Array.isArray(data?.products)||!data.products.length)throw Error('规格快照不完整，请更新网站。');
      const age=Math.max(0,Date.now()-Date.parse(data.retrievedAt));
      memo={...data,status:'stale_cache',warning:'规格库实时读取未成功，使用'+data.retrievedAt.slice(0,10)+'的公开规格快照'+(age>7*86400000?'（已超过7天）':'')+'；保留各产品原复核日期，不能视为当前官网数据。'};expires=Date.now()+5*60000;
    }
    return memo;
  })();
  try{return await pending;}finally{pending=null;}
}
export async function lookupSpecifications(input,plan,{names=requestedProducts(input,plan)}={}){
  if(!names.length)return {sources:[],matchedProducts:[],unmatchedProducts:[],status:'not_needed'};
  const catalog=await loadCatalog(),{matches,missing}=matchProducts(catalog.products,names);
  return {status:catalog.status,retrievedAt:catalog.retrievedAt,warning:catalog.warning,matchedProducts:matches.map(p=>({id:p.id,name:p.name,regions:p.regions||[],metrics:p.metrics,officialUrl:p.officialUrl,verifiedDate:p.verifiedDate})),unmatchedProducts:missing,sources:catalogSources(matches,catalog.retrievedAt)};
}
