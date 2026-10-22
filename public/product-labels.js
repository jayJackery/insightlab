import {cleanProductLabel} from './product-identity.js';
const brands={jackery:['Jackery','电小二','华宝新能'],ecoflow:['EcoFlow','正浩创新','正浩'],anker:['Anker SOLIX','Anker','安克创新','安克'],bluetti:['BLUETTI','铂陆帝','德兰明海'],dji:['DJI','大疆'],eaton:['Eaton'],zendure:['Zendure']};
const key=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export function productLabel(product){
  const display=cleanProductLabel(product.display||product.competitor||product.name||''),group=brands[product.brand]||Object.values(brands).find(names=>names.some(name=>key(display).startsWith(key(name))));
  const brand=group?.[0]||'',aliases=[...(product.brandNames||[]),...(group||[])].sort((a,b)=>b.length-a.length);
  let model=display;for(const alias of aliases){if(model.toLowerCase().startsWith(alias.toLowerCase())){model=model.slice(alias.length).trim();break;}}
  if(brand==='Anker SOLIX')model=model.replace(/^SOLIX\s*/i,'');
  for(const alias of aliases)if(model.toLowerCase().startsWith(alias.toLowerCase())){model=model.slice(alias.length).trim();break;}
  return {brand,model:model||display,fullName:brand?[brand,model].filter(Boolean).join(' '):display};
}
function termsFor(products){
  const terms=[];
  for(const product of products){
    if(product.exact===false)continue;const label=productLabel(product);if(!label.brand)continue;
    const full=[product.display,label.fullName,...(product.highlightNames||[])].filter(value=>typeof value==='string'&&Object.values(brands).some(names=>names.some(name=>key(value).startsWith(key(name)))));
    for(const value of full)terms.push({name:cleanProductLabel(value),replacement:label.fullName,owner:product.id||key(label.fullName),full:true});
    const aliases=[label.model,...(product.highlightNames||[]).filter(value=>typeof value==='string'&&!full.includes(value))];
    if(label.brand==='Jackery')aliases.push(label.model.replace(/^(?:explorer|explore)\s*/i,''));
    for(const value of [...aliases])if(typeof value==='string')aliases.push(value.replace(/(\d)([a-z])/gi,'$1 $2'));
    for(const value of aliases)if(typeof value==='string'&&/\d/.test(value)&&value.trim().length>2){terms.push({name:value.trim(),replacement:label.fullName,owner:product.id||key(label.fullName),full:false});for(const brand of [label.brand,...(product.brandNames||[])])terms.push({name:brand+' '+value.trim(),replacement:label.fullName,owner:product.id||key(label.fullName),full:true});}
  }
  const owners=new Map();for(const term of terms){const k=key(term.name);if(!owners.has(k))owners.set(k,new Set());owners.get(k).add(term.owner);}
  return terms.filter(term=>owners.get(key(term.name)).size===1).sort((a,b)=>b.name.length-a.name.length);
}
export function qualifyProductMentions(value,products=[],contextBefore=''){
  const text=String(value??''),lower=text.toLowerCase(),terms=termsFor(products);let result='',cursor=0;
  while(cursor<text.length){
    const match=terms.find(term=>lower.startsWith(term.name.toLowerCase(),cursor)&&!(/[a-z0-9]/i.test(term.name[0])&&/[a-z0-9]/i.test(text[cursor-1]||''))&&!(/[a-z0-9]/i.test(term.name.at(-1))&&/[a-z0-9]/i.test(text[cursor+term.name.length]||''))&&!/^(?:[-_][a-z0-9]|\s+(?:pro|plus|max|mini|ultra|gen\s*\d|v\s*\d)\b)/i.test(text.slice(cursor+term.name.length)));
    if(match&&!match.full&&/\b(?:power|explorer|explore|delta|river|solix)\s*$/i.test(contextBefore+text.slice(0,cursor))){result+=text[cursor++];continue;}
    if(match){const before=(contextBefore+text.slice(0,cursor)).replace(/[*_]/g,'').trimEnd().toLowerCase(),branded=!match.full&&Object.values(brands).some(names=>names.some(brand=>before.endsWith(brand.toLowerCase())));result+=branded?text.slice(cursor,cursor+match.name.length):match.replacement;cursor+=match.name.length;}else result+=text[cursor++];
  }
  return result;
}
export function qualifyStructuredContent(value,products=[]){
  if(typeof value==='string')return qualifyProductMentions(value,products);
  if(Array.isArray(value))return value.map(item=>qualifyStructuredContent(item,products));
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,/^(?:quote|evidence|sourceIds|citations|url|productId)$/i.test(name)?item:qualifyStructuredContent(item,products)]));
}
