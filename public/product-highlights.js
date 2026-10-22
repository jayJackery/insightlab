export function highlightSegments(text,products=[]) {
  const terms=[];
  for(const product of products) {
    for(const name of product.highlightNames || [product.display])if(typeof name==='string'&&name.trim().length>1)terms.push({name:name.trim(),productId:product.id,kind:'product'});
    for(const name of product.brandNames || [])if(name.length>1)terms.push({name,kind:'brand'});
  }
  terms.sort((a,b)=>b.name.length-a.name.length);
  const value=String(text || ''),lower=value.toLowerCase(),parts=[];let cursor=0,start=0;
  while(cursor<value.length) {
    const match=terms.find(term=>lower.startsWith(term.name.toLowerCase(),cursor)&&!(/[a-z0-9]/i.test(term.name[0])&&/[a-z0-9]/i.test(value[cursor-1] || ''))&&!(/[a-z0-9]/i.test(term.name.at(-1))&&/[a-z0-9]/i.test(value[cursor+term.name.length] || ''))&&!(term.kind==='product'&&/^(?:[-_][a-z0-9]|\s+(?:pro|plus|max|mini|ultra|gen\s*\d)\b)/i.test(value.slice(cursor+term.name.length))));
    if(!match){cursor++;continue;}
    if(cursor>start)parts.push({text:value.slice(start,cursor)});
    parts.push({text:value.slice(cursor,cursor+match.name.length),highlight:true,productId:match.productId,kind:match.kind});
    cursor+=match.name.length;start=cursor;
  }
  if(start<value.length)parts.push({text:value.slice(start)});
  return parts.length?parts:[{text:value}];
}
export function topicProductReferences(route,products=[]) {
  if(route.productMappings?.length)return {structured:true,items:route.productMappings.map(item=>({...item,product:products.find(product=>product.id===item.productId)})).filter(item=>item.product)};
  const body=JSON.stringify([route.heading,route.lead,route.designProblem,route.systemPath,route.principle,route.architecture,route.implementation]);
  const ids=new Set(highlightSegments(body,products).filter(part=>part.kind==='product').map(part=>part.productId));
  return {structured:false,items:products.filter(product=>ids.has(product.id))};
}
