import {parseProductName} from '../evidence/product-registry.js?v=69935587b51cd156';
import {catalogDisplayName} from '../../../public/product-identity.js?v=69935587b51cd156';

const compact=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const modelKey=value=>compact(value).replace(/第?二代|二代|2代/gu,'v2').replace(/第?三代|三代|3代/gu,'v3').replace(/g(?=\d)/g,'gen').replace(/explorer|探索者|便携式|便携|户外电源|储能电源|移动电源|电源/gu,'');
function distance(a,b){
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length];
}
// Similarity discovers candidates only. It never establishes product identity.
export function findProductCandidates(products,query,limit=5){
  const raw=String(query||'').trim();if(!raw||raw.length>200)return [];
  const parsed=parseProductName(raw),key=modelKey(parsed.model),full=compact(raw),numbers=key.match(/\d+/g)||[];
  const found=new Map();
  for(const product of products){
    const name=catalogDisplayName(product),identity=parseProductName(name);
    if(parsed.brand&&identity.brand!==parsed.brand)continue;
    const candidate=modelKey(identity.model),candidateNumbers=candidate.match(/\d+/g)||[];
    if(numbers.some(number=>!candidateNumbers.includes(number)))continue;
    let score=0;
    if(!key&&parsed.brand)score=.6;
    else if(key===candidate)score=1;
    else if(key.length>=3&&(candidate.includes(key)||key.includes(candidate)))score=.84;
    else if(key.length>=4)score=1-distance(key,candidate)/Math.max(key.length,candidate.length);
    if(!parsed.brand&&full.length>=5)score=Math.max(score,1-distance(full,compact(name))/Math.max(full.length,compact(name).length));
    if(score<.6||(!numbers.length&&!parsed.brand&&score<.8))continue;
    const id=(identity.brand||product.brand)+':'+identity.model,previous=found.get(id);
    const variant={capacityWh:product.metrics?.capacityWh??null,ratedPowerW:product.metrics?.ratedPowerW??product.metrics?.acPowerW??null,regions:product.regions||[],verifiedDate:product.verifiedDate||null};
    if(previous){previous.variants.push(variant);continue;}
    found.set(id,{name,score,reason:score===1?'简称 / 型号词匹配':'近似名称候选，请确认代际与后缀',sourceUrl:product.referenceSourceUrl||'https://hellotech2.pages.dev/',variants:[variant]});
  }
  return [...found.values()].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,limit);
}
