// Presentation labels are not part of the manufacturer's model number.
export function cleanProductLabel(value){
  return String(value||'').normalize('NFKC').trim()
    .replace(/^(?:(?:候选(?:型号|竞品|产品)?|建议竞品|对比基准|自家产品)\s*[:：]\s*)+/u,'')
    .replace(/^\[(?:候选|待确认)\]\s*/u,'')
    .replace(/\([^)]*(?:非计划同档|仅技术参考|跨档参考)[^)]*\)/gu,'')
    .replace(/\((?:[^)]*(?:候选|自家|基准|待确认|示例))[^)]*\)/gu,'').trim();
}
export function catalogDisplayName(product){const name=String(product.name||'').trim(),brand=String(product.brand||'').trim();const token=brand.split(/\s+/u)[0];return token&&name.toLowerCase().startsWith(token.toLowerCase())?name:[brand,name].filter(Boolean).join(' ');}
