import {parseProductName,sameProduct} from '../evidence/product-registry.js?v=983914e21674fb3e';
import {COMPARISON_DEFAULTS} from '../../../public/comparison-defaults.js?v=983914e21674fb3e';
import {catalogDisplayName} from '../../../public/product-identity.js?v=983914e21674fb3e';
import {findProductCandidates} from './product-candidates.js?v=983914e21674fb3e';
export {COMPARISON_DEFAULTS};
export const comparisonApplies=input=>/储能|电池|户外电源|power station|battery|Jackery|EcoFlow|Anker|Bluetti|Zendure|DJI Power/i.test([input.subject,input.baselineProduct].join(' '))&&Boolean(input.baselineProduct||input.competitors||/对比|竞品|竞争|产品.*哪些|型号|市场潜力/.test([input.subject,input.questions].join(' ')));
export function comparisonInput(value={}){
  const result={referenceMode:'automatic',comparisonRegion:'all'};
  if(value.baselineChoice!==undefined){if(typeof value.baselineChoice!=='string'||value.baselineChoice.length>200)throw Error('所选基准型号格式无效。');result.baselineChoice=value.baselineChoice.trim();}
  for(const key of ['capacityTolerance','powerTolerance']){
    if(value[key]===''||value[key]===undefined||value[key]===null)continue;
    const number=Number(value[key]);if(!Number.isFinite(number)||number<0||number>300)throw Error('允许偏差须为0至300%。');result[key]=number;
  }
  return result;
}
const positive=value=>{const number=Number(value);return Number.isFinite(number)&&number>0?number:null;};
const name=catalogDisplayName;
const capacity=product=>positive(product.metrics?.capacityWh);
const power=product=>positive(product.metrics?.ratedPowerW??product.metrics?.acPowerW);
const category=product=>/扩容电池|电池包|太阳能板|逆变器|充电器/.test(product.category||'')?'accessory':/便携|户外|portable/i.test(product.category||'')||product.segmentKey==='A'?'portable':product.category||'unknown';
const terms=value=>String(value||'').split(/[、，,；;\n]/u).map(value=>value.trim()).filter(Boolean);
const tolerance=(value,fallback)=>{const n=Number(value);return value!==''&&value!=null&&Number.isFinite(n)&&n>=0&&n<=300?n:fallback;};
const version=product=>({name:name(product),catalogProductId:product.id,capacityWh:capacity(product),ratedPowerW:power(product),regions:product.regions||[],category:category(product),officialUrl:product.officialUrl||'',sourceUrl:product.referenceSourceUrl||'https://hellotech2.pages.dev/',verifiedDate:product.verifiedDate||null,basis:product.referenceSourceUrl?'official_excerpt':'team_catalog',capacityQuote:product.capacityQuote,powerQuote:product.powerQuote});
export function selectCompetitors(products,input,selection={}){
  if(!comparisonApplies(input))return {status:'not_applicable',applies:false,requiresConfirmation:false,rows:[],recommendations:[]};
  const policy={version:3,referenceMode:'automatic',regionScope:'all',capacityTolerance:tolerance(input.capacityTolerance,COMPARISON_DEFAULTS.capacityTolerance),powerTolerance:tolerance(input.powerTolerance,COMPARISON_DEFAULTS.powerTolerance)};
  const baselineOptions=findProductCandidates(products,input.baselineProduct),requested=parseProductName(input.baselineProduct);
  let matches=requested.exact?products.filter(product=>sameProduct(name(product),requested.display)):[];
  const identities=new Set(matches.map(product=>{const item=parseProductName(name(product));return item.brand+':'+item.model;}));
  if(identities.size>1)matches=[];
  if(input.baselineChoice){
    const choice=baselineOptions.find(item=>item.name===input.baselineChoice);
    if(!choice)throw Object.assign(Error('所选型号不再属于当前名称的候选，请重新选择，或暂不确认继续调研。'),{code:'BASELINE_CHOICE_INVALID'});
    matches=products.filter(product=>name(product)===choice.name);
  }
  const baseline=parseProductName(matches[0]?name(matches[0]):input.baselineProduct);
  const anchors=matches.filter(product=>capacity(product)&&power(product)&&category(product)!=='accessory'),versions=anchors.map(version);
  const common=key=>versions.length&&versions.every(item=>item[key]===versions[0][key])?versions[0][key]:null;
  const reference={name:matches[0]?name(matches[0]):input.baselineProduct||'未设置基准',capacityWh:common('capacityWh'),ratedPowerW:common('ratedPowerW'),region:'all',category:anchors[0]?category(anchors[0]):'portable',catalogProductId:anchors.length===1?anchors[0].id:null,officialUrl:anchors[0]?.officialUrl||null,variants:versions,basis:versions.length?'自动匹配真实记录；所有地区版本分别保留，不混搭容量与连续功率':'尚无可靠的同档筛选参数'};
  reference.ranges=versions.map(item=>({regions:item.regions,capacityMinWh:Math.max(0,item.capacityWh*(1-policy.capacityTolerance/100)),capacityMaxWh:item.capacityWh*(1+policy.capacityTolerance/100),powerMinW:Math.max(0,item.ratedPowerW*(1-policy.powerTolerance/100)),powerMaxW:item.ratedPowerW*(1+policy.powerTolerance/100)}));
  const baselineStatus=matches.length?'confirmed':!input.baselineProduct?'absent':baselineOptions.length?'needs_confirmation':'unresolved';
  const resolution={requested:true,baselineStatus,baselineOptions,requestedName:input.baselineProduct||''};
  if(!versions.length)return {...resolution,status:'unanchored',applies:false,requiresConfirmation:false,policy,reference,recommendations:[],rows:[],reason:baselineStatus==='absent'?'未设置基准，可直接开展技术、行业或产品调研；本次不作相对基准的同档排名。':baselineStatus==='needs_confirmation'?'找到以下可能的型号。可选择确认，也可暂不确认继续调研；确认前不把候选参数当作基准。':'暂未取得可靠的基准规格，可继续围绕原问题调研；不猜容量、功率或同档排名。',canDiscover:baselineStatus==='confirmed'||baselineOptions.length===0&&requested.exact};
  const classify=product=>{
    const c=capacity(product),p=power(product);
    const comparisons=anchors.map(anchor=>{
      const capacityDeviation=c===null?null:(c/capacity(anchor)-1)*100,powerDeviation=p===null?null:(p/power(anchor)-1)*100;
      const reasons=[];if(category(product)!==category(anchor))reasons.push('产品类别不同');
      if(c===null||p===null)reasons.push('容量或额定连续功率未收录');
      if(c!==null&&Math.abs(capacityDeviation)>policy.capacityTolerance+1e-9)reasons.push('容量偏差 '+capacityDeviation.toFixed(1)+'%');
      if(p!==null&&Math.abs(powerDeviation)>policy.powerTolerance+1e-9)reasons.push('连续功率偏差 '+powerDeviation.toFixed(1)+'%');
      return {anchor,capacityDeviation,powerDeviation,reasons,distance:c&&p?Math.abs(Math.log(c/capacity(anchor)))+Math.abs(Math.log(p/power(anchor))):Infinity};
    }).sort((a,b)=>(Boolean(a.reasons.length)-Boolean(b.reasons.length))||a.distance-b.distance);
    const best=comparisons[0];
    return {...version(product),region:(product.regions||[]).join('/')||'未注明',capacityDeviation:best.capacityDeviation,powerDeviation:best.powerDeviation,status:best.reasons.length?'cross_tier':'comparable',reason:best.reasons.join('；')||'两项指标均在同一基准版本的允许偏差内；地区差异另列',comparedBaseline:version(best.anchor),catalogUrl:'https://hellotech2.pages.dev/',distance:best.distance};
  };
  const scopes=terms(input.competitors),explicit=scopes.filter(value=>parseProductName(value).exact),brands=scopes.filter(value=>!parseProductName(value).exact);
  const eligible=products.filter(product=>!sameProduct(name(product),reference.name)).filter(product=>!baseline.brand||parseProductName(name(product)).brand!==baseline.brand||brands.some(scope=>parseProductName(scope).brand===baseline.brand)).filter(product=>!brands.length||brands.some(scope=>{const a=parseProductName(scope),b=parseProductName(name(product));return a.brand?a.brand===b.brand:String(product.brand||'').toLowerCase().includes(scope.toLowerCase());})).map(classify).filter(row=>row.status==='comparable').sort((a,b)=>a.distance-b.distance);
  const withVersions=row=>({...row,versions:products.filter(product=>sameProduct(name(product),row.name)).map(version)});
  const recommendations=[],seen=new Set();
  for(const item of eligible){const identity=parseProductName(item.name),key=identity.brand||item.name;if(seen.has(key)||recommendations.some(row=>sameProduct(row.name,item.name)))continue;seen.add(key);recommendations.push(withVersions(item));if(recommendations.length===3)break;}
  const matchingProducts=[],matchingNames=new Set();
  for(const item of eligible){const product=parseProductName(item.name),key=(product.brand||'')+':'+product.model;if(matchingNames.has(key))continue;matchingNames.add(key);matchingProducts.push(withVersions(item));}
  const requestedCompetitors=[...new Set(Array.isArray(selection.candidates)?selection.candidates:explicit)].filter(value=>!sameProduct(value,reference.name));
  const rows=requestedCompetitors.map(value=>{
    const found=products.filter(product=>sameProduct(name(product),value));
    if(!found.length)return {name:parseProductName(value).display,status:'unmatched',reason:'所有地区规格库均未匹配到准确型号；需要自动补查，不能猜测参数',catalogUrl:'https://hellotech2.pages.dev/'};
    const target=found.map(classify).sort((a,b)=>(Boolean(a.status!=='comparable')-Boolean(b.status!=='comparable'))||a.distance-b.distance)[0];
    return {...withVersions(target),explicit:explicit.some(item=>sameProduct(item,value))};
  });
  return {...resolution,status:'ready',applies:true,requiresConfirmation:false,policy,reference,recommendations,matchingProducts,matchingCount:matchingProducts.length,rows,explicitNames:explicit,automatic:!explicit.length||brands.length>0,reason:'自动读取基准参数，在所有地区内按容量与额定连续功率筛选；不使用峰值、输入功率或扩容套装容量。不同地区版本保留，不代表电压、认证与价格可直接横比。'};
}
