import {digest} from './source-document.js?v=69935587b51cd156';
import {cleanProductLabel,catalogDisplayName} from '../../../public/product-identity.js?v=69935587b51cd156';

const brands=[['jackery','电小二','华宝新能'],['ecoflow','正浩创新','正浩'],['anker','ankersolix','安克创新','安克'],['bluetti','德兰明海','铂陆帝'],['dji','大疆'],['eaton'],['zendure']];
const compact=(value)=>String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export const VERIFIED_PRODUCT_ALIASES=[{brand:'anker',model:'f2000',aliases:['F2000','PowerHouse 767','767','A1780'],sourceUrls:['https://service.anker.com/article-description/Anker-SOLIX-F2000-Portable-Power-Station-PowerHouse-767-USER-MANUAL','https://www.ankersolix.com/f2000'],boundary:'仅基础型号对应；美国2400W和欧洲2300W等地区版本仍分开。拆解样机不代表所有批次，能拆开不等于厂商允许用户维修。'},{brand:'ecoflow',model:'delta3classic',aliases:['DELTA 3 Classic','EF-DL3-C'],sourceUrls:['https://manuals.ecoflow.com/cn/product/delta-3-classic?lang=zh_CN'],boundary:'官方手册中的基础型号别名；地区和功率版本仍须单独核对，不合并DELTA 3或Plus。'}];
export function parseProductName(value) {
  const display=cleanProductLabel(value);
  let model=compact(display), brand=null;
  for(const group of brands) {
    const alias=[...group].sort((a,b)=>b.length-a.length).find((item)=>model.startsWith(item));
    if(alias) {brand=group[0];model=model.slice(alias.length);const repeated=[...group].sort((a,b)=>b.length-a.length).find((item)=>model.startsWith(item));if(repeated)model=model.slice(repeated.length);break;}
  }
  if(brand==='anker') model=model.replace(/^solix/,'');
  if(brand==='anker') {
    // Remove only whitelisted labels around exact, officially confirmed tokens.
    const tokens=display.toLowerCase().replace(/拆解件型号|拆解型号|型号|拆解件|拆解|ankersolix|anker|powerhouse|solix/gu,' ').replace(/[\s\p{P}\p{S}]+/gu,' ').trim().split(/\s+/u);
    if(tokens.length && tokens.every((token)=>['f2000','767','a1780'].includes(token)))model='f2000';
  }
  // Explicit manufacturer alias, not a fuzzy similarity rule. US support manual:
  // service.anker.com/article-description/Anker-SOLIX-F2000-Portable-Power-Station-PowerHouse-767-USER-MANUAL
  if(brand==='anker' && ['767','powerhouse767','f2000powerhouse767','f2000767','767powerhouse','powerhouse767f2000','f2000拆解型号a1780powerhouse767','f2000a1780powerhouse767','f2000a1780'].includes(model)) model='f2000';
  // Manufacturer-hosted Explorer 2000 v2 US manual names JE-2000D explicitly.
  // https://r.jackery.net/productGuide/Jackery%20Explorer%202000%20v2%20User%20Manual.pdf
  if(brand==='jackery' && ['explorer2000v2je2000d','je2000d'].includes(model))model='explorer2000v2';
  // Official Classic manual names EF-DL3-C; it does not identify DELTA 3/Plus.
  if((!brand||brand==='ecoflow')&&['efdl3c','delta3classicefdl3c','efdl3cdelta3classic'].includes(model)){brand='ecoflow';model='delta3classic';}
  return {display,brand,model,exact:Boolean(model && /\d/.test(model) && !/同容量|系列|等|示例|候选型号|或|\bor\b/i.test(display))};
}
export function sameProduct(left,right) {
  const a=parseProductName(left),b=parseProductName(right);
  return Boolean(a.model&&b.model&&a.model===b.model&&(!a.brand||!b.brand||a.brand===b.brand));
}
export function presentationProducts(products=[]) {
  return products.filter(product=>product.exact).map(product=>{
    const group=brands.find(items=>items[0]===product.brand) || [];
    const aliases=VERIFIED_PRODUCT_ALIASES.find(item=>item.brand===product.brand&&item.model===product.model)?.aliases || [];
    const display=product.display.replace(/[（(](?:自家|基准|候选|待确认)[^）)]*[）)]/gu,'').trim();
    const highlightNames=[display,...aliases.filter(name=>!/^\d+$/.test(name)),...aliases.map(name=>product.brand+' '+name)];
    if(product.brand==='jackery'&&product.model==='explorer2000v2')highlightNames.push('Explorer 2000 v2','JE-2000D','JE2000D');
    if(product.brand==='ecoflow')highlightNames.push(display.replace(/^ecoflow\s*/i,''));
    return {...product,display,highlightNames:[...new Set(highlightNames)],brandNames:group};
  });
}
// Display-only identities from stored, explicitly branded records. This does not
// add products to the confirmed research scope or verify adoption/parameters.
export function presentationProductsForTask(task){
  const research=task.research||{},products=[...(research.contract?.products||research.productRegistry||[])];
  const names=[...(task.evidence?.competitorRows||[]).map(row=>row.competitor),...(research.sources||[]).filter(source=>source.provider==='team_catalog'&&source.catalogRecord).map(source=>catalogDisplayName(source.catalogRecord))];
  for(const name of names){const parsed=parseProductName(name);if(!parsed.exact||!parsed.brand)continue;const at=products.findIndex(product=>sameProduct(product.display,name));if(at>=0){if(!products[at].brand)products[at]={...products[at],...parsed};continue;}products.push({...resolveProduct(name,products),displayOnly:true});}
  return presentationProducts(products);
}
export function buildProductRegistry(input,plan) {
  const registry=[];
  const names=[{name:input.baselineProduct,baseline:true},...(String(input.competitors || '').split(/[、，,；;\n]/u)).map((name)=>({name})),...(plan.competitors || []).map((name)=>({name,candidate:true}))];
  for(const entry of names) {
    if(typeof entry.name!=='string'||!entry.name.trim())continue;
    const product=parseProductName(entry.name);
    // The user can explicitly name a baseline without digits; a brand alone is still a scope.
    if(entry.baseline&&product.model&&!/^(?:自家产品|我方产品|待补充|未提供)$/u.test(product.display))product.exact=true;
    const identity=(product.brand || 'unknown')+':'+product.model;
    const id='P'+digest(identity).slice(0,12);
    const existing=registry.find((item)=>item.id===id);
    if(existing) {existing.baseline ||= Boolean(entry.baseline);if(entry.baseline)existing.status='confirmed';continue;}
    registry.push({id,...product,baseline:Boolean(entry.baseline),status:!product.exact?'brand_scope':entry.baseline||!entry.candidate?'confirmed':'candidate'});
  }
  return registry;
}
export function resolveProduct(name,registry) {
  const parsed=parseProductName(name);
  const matches=registry.filter((product)=>product.exact&&sameProduct(product.display,name));
  if(matches.length===1)return {...matches[0],match:'exact'};
  return {...parsed,id:'P'+digest((parsed.brand||'unknown')+':'+parsed.model).slice(0,12),status:'unresolved',match:'unresolved',baseline:false};
}

// Detect misplaced categorical facts in simple product comparison tables.
export function tableProductIssues(metric,sources) {
  const product=metric.product, tokens=String(metric.value || '').match(/\bIP\s*\d{2}\b|UL\s*94\s*[- ]?\s*(?:5VA|5VB|V-?0|V-?1|V-?2)/gi) || [];
  if(!tokens.length)return [];
  const issues=[];
  for(const source of sources) for(const table of source.document?.blocks || []) {
    if(table.kind!=='table')continue;
    const compactToken=(value)=>compact(value);
    for(const token of tokens) {
      const tokenKey=compactToken(token);
      const hasToken=(cell)=>compactToken(cell).includes(tokenKey);
      if(!table.rows.some((row)=>row.some(hasToken)))continue;
      if(table.ambiguous) {issues.push({code:'TABLE_AMBIGUOUS',sourceId:source.id,blockId:table.id,message:'表格含合并单元格或不完整行列，无法确定'+token+'所属对象。'});continue;}
      const columns=table.header.map((name,index)=>sameProduct(name,product)?index:-1).filter((index)=>index>=0);
      const matchingRows=table.rows.filter((row)=>row.some((cell)=>sameProduct(cell,product)));
      if(!columns.length&&!matchingRows.length)continue;
      const supported=columns.some((index)=>table.rows.some((row)=>hasToken(row[index] || ''))) || matchingRows.some((row)=>row.some(hasToken));
      if(!supported)issues.push({code:'TABLE_PRODUCT_MISMATCH',sourceId:source.id,blockId:table.id,message:token+'出现在其他产品的单元格，不能归入'+product+'。'});
    }
  }
  return issues;
}
