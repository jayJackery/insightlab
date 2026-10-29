import {parseProductName} from '../../domain/evidence/product-registry.js?v=6cfce723d0abd3f5';
import {catalogDisplayName} from '../../../public/product-identity.js?v=6cfce723d0abd3f5';

export const CATALOG_URL = "https://hellotech2.pages.dev/";
export const CATALOG_DATA_URL = new URL("data.js", CATALOG_URL).href;

// Read the JSON array only. Remote JavaScript is never executed.
export function parseCatalog(script) {
  const marker = /\bconst\s+PRODUCTS_DATA\s*=\s*/.exec(script);
  if (!marker) throw new Error("规格库未找到 PRODUCTS_DATA 数组");
  const start = marker.index + marker[0].length;
  if (script[start] !== "[") throw new Error("规格库数据格式发生变化");
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < script.length; i++) {
    const char = script[i];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') { quoted = true; continue; }
    if (char === "[") depth++;
    if (char === "]" && --depth === 0) {
      const products = JSON.parse(script.slice(start, i + 1));
      return products.filter((p) => p && typeof p.id === "string" && typeof p.name === "string");
    }
  }
  throw new Error("规格库数组不完整");
}
function modelKey(value) {
  return parseProductName(value).model;
}
export function requestedProducts(input, plan = {}) {
  return [...new Set([input.baselineProduct || "", ...(typeof input.competitors === "string" ? input.competitors.split(/[、，,；;\n]/u) : []), ...(plan.competitors || [])]
    .filter((name) => typeof name === "string").map((name) => name.replace(/[（(].*?[）)]/gu, "").replace(/加其他.*$/u, "").trim()).filter(Boolean))];
}
export function matchProducts(products, names) {
  const matches = [], missing = [];
  for (const name of names) {
    const key = modelKey(name);
    const brand = parseProductName(name).brand;
    const found = products.filter((product) => {
      const productBrand = parseProductName(catalogDisplayName(product)).brand;
      return key && (!brand || brand === productBrand) && (modelKey(product.name) === key || modelKey(catalogDisplayName(product)) === key);
    });
    if (!found.length) missing.push(name);
    for (const product of found) if (!matches.some((p) => p.id === product.id)) matches.push(product);
  }
  return { matches, missing };
}
export function catalogSources(products,retrievedAt){
  return products.map(product=>{
    const record={id:product.id,name:product.name,brand:product.brand,modelCode:product.modelCode,imageUrl:product.imageUrl,regions:product.regions,category:product.category,configuration:product.configuration || 'unknown',verifiedDate:product.verifiedDate,status:product.status,sourceNote:product.sourceNote,officialUrl:product.officialUrl,metrics:product.metrics,mechanics:product.mechanics,battery:product.battery,electricalOutput:product.electricalOutput,electricalInput:product.electricalInput,compliance:product.compliance,referencePrice:product.referencePrice};
    return {title:product.brand+' '+product.name+' · '+(product.regions||[]).join('/')+' · 部门规格库',url:CATALOG_URL,catalogProductId:product.id,catalogRecord:record,officialUrl:product.officialUrl,catalogVerifiedDate:product.verifiedDate || null,content:'部门整理记录，未由本应用独立核对官网；参数已收录不等于官方已核验，地区、配置和未知边界须保留。\n'+JSON.stringify(record,null,2),snippet:product.name+' '+JSON.stringify(product.metrics||{}),contentKind:'curated_record',provider:'team_catalog',sourceType:'curated',relevance:'direct',publishedAt:null,siteName:'部门产品规格库',queries:['规格库型号匹配：'+product.name],retrievedAt};
  });
}
