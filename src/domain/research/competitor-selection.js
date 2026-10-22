import {parseProductName,sameProduct} from '../evidence/product-registry.js';
import {normalizeRegion} from '../evidence/metric-schema.js';
import {COMPARISON_DEFAULTS} from '../../../public/comparison-defaults.js';
import {catalogDisplayName} from '../../../public/product-identity.js';
export {COMPARISON_DEFAULTS};
export const comparisonApplies=input=>/储能|电池|户外电源|power station|battery/i.test([input.subject,input.baselineProduct].join(' '))&&Boolean(input.baselineProduct||input.competitors||/对比|竞品|竞争|产品.*哪些|型号|市场潜力/.test([input.subject,input.questions].join(' ')));
export function comparisonInput(value={}){
  const result={};
  for(const key of ['baselineCapacityWh','baselineRatedPowerW','capacityTolerance','powerTolerance']){
    if(value[key]===''||value[key]===undefined||value[key]===null)continue;
    const n=Number(value[key]);if(!Number.isFinite(n)||(key.endsWith('Tolerance')?(n<0||n>300):n<=0))throw Error('容量、额定功率须大于0，允许偏差须为0至300%。');result[key]=n;
  }
  if(value.comparisonRegion){const region=normalizeRegion(value.comparisonRegion);if(!['US','EU','UK','CN','JP','AU','CA','DE','FR'].includes(region))throw Error('请选择明确的比较地区。');result.comparisonRegion=region;}
  return result;
}
const positive=value=>{const number=Number(value);return Number.isFinite(number)&&number>0?number:null;};
const name=catalogDisplayName;
const capacity=product=>positive(product.metrics?.capacityWh);
const power=product=>positive(product.metrics?.ratedPowerW??product.metrics?.acPowerW);
const category=product=>/扩容电池|电池包|太阳能板|逆变器|充电器/.test(product.category||'')?'accessory':/便携|户外|portable/i.test(product.category||'')||product.segmentKey==='A'?'portable':product.category||'unknown';
const terms=value=>String(value||'').split(/[、，,；;\n]/u).map(value=>value.trim()).filter(Boolean);
const tolerance=(value,fallback)=>{const n=Number(value);return value!==''&&value!=null&&Number.isFinite(n)&&n>=0&&n<=300?n:fallback;};
export function selectCompetitors(products,input,selection={}){
  const candidates=selection.candidates;
  const applies=comparisonApplies(input);
  if(!applies)return {status:'not_applicable',applies:false,requiresConfirmation:false,rows:[],recommendations:[]};
  const policy={capacityTolerance:tolerance(input.capacityTolerance,COMPARISON_DEFAULTS.capacityTolerance),powerTolerance:tolerance(input.powerTolerance,COMPARISON_DEFAULTS.powerTolerance)};
  const baseline=parseProductName(input.baselineProduct),matches=products.filter(product=>sameProduct(name(product),baseline.display));
  let region=normalizeRegion(input.comparisonRegion||'unknown');
  const scoped=region!=='unknown'?matches.filter(product=>(product.regions||[]).some(item=>normalizeRegion(item)===region)):matches;
  const anchor=scoped.length===1?scoped[0]:null;
  if(region==='unknown'&&anchor?.regions?.length===1)region=normalizeRegion(anchor.regions[0]);
  const reference={name:input.baselineProduct||'自定义目标档位',capacityWh:positive(input.baselineCapacityWh)||capacity(anchor||{}),ratedPowerW:positive(input.baselineRatedPowerW)||power(anchor||{}),region,category:anchor?category(anchor):'portable',catalogProductId:anchor?.id||null,officialUrl:anchor?.officialUrl||null,basis:positive(input.baselineCapacityWh)||positive(input.baselineRatedPowerW)?'用户填写目标；不等于已核验产品参数':anchor?'部门规格库整理记录，保留地区与日期':'缺少基准'};
  if(anchor&&((positive(input.baselineCapacityWh)&&capacity(anchor)&&Math.abs(positive(input.baselineCapacityWh)/capacity(anchor)-1)>.01)||(positive(input.baselineRatedPowerW)&&power(anchor)&&Math.abs(positive(input.baselineRatedPowerW)/power(anchor)-1)>.01)))return {status:'reference_conflict',applies:true,requiresConfirmation:true,policy,reference,recommendations:[],rows:[],reason:'填写的基准参数与该地区规格库记录不同。请核对型号/代际/地区，或清空数值后使用库中记录；自定义目标请使用自定义基准名称。',catalogReference:{capacityWh:capacity(anchor),ratedPowerW:power(anchor)}};
  if(!reference.capacityWh||!reference.ratedPowerW||region==='unknown')return {status:'needs_reference',applies:true,requiresConfirmation:true,policy,reference,recommendations:[],rows:[],reason:'请先确认基准容量、额定连续功率和地区。库内多版本不能自动选一个；不得随机跨档选型。',baselineOptions:matches.map(product=>({name:name(product),regions:product.regions,capacityWh:capacity(product),ratedPowerW:power(product)}))};
  const classify=product=>{
    const c=capacity(product),p=power(product),capacityDeviation=c===null?null:(c/reference.capacityWh-1)*100,powerDeviation=p===null?null:(p/reference.ratedPowerW-1)*100;
    const reasons=[];
    if(category(product)!==reference.category)reasons.push('产品类别不同');
    if(!(product.regions||[]).some(value=>normalizeRegion(value)===region))reasons.push('缺少当前地区记录');
    if(c===null||p===null)reasons.push('容量或额定功率未收录');
    if(c!==null&&Math.abs(capacityDeviation)>policy.capacityTolerance)reasons.push('容量偏差 '+capacityDeviation.toFixed(1)+'%');
    if(p!==null&&Math.abs(powerDeviation)>policy.powerTolerance)reasons.push('额定功率偏差 '+powerDeviation.toFixed(1)+'%');
    return {name:name(product),catalogProductId:product.id,capacityWh:c,ratedPowerW:p,region,capacityDeviation,powerDeviation,status:reasons.length?'cross_tier':'comparable',reason:reasons.join('；')||'类别、地区及两项额定指标均在确认阈值内',officialUrl:product.officialUrl||'',catalogUrl:'https://hellotech2.pages.dev/',verifiedDate:product.verifiedDate||null,distance:c&&p?Math.abs(Math.log(c/reference.capacityWh))+Math.abs(Math.log(p/reference.ratedPowerW)):Infinity};
  };
  const scopes=terms(input.competitors),explicit=scopes.filter(value=>parseProductName(value).exact),brands=scopes.filter(value=>!parseProductName(value).exact);
  const eligible=products.filter(product=>!sameProduct(name(product),reference.name)).filter(product=>!baseline.brand||parseProductName(name(product)).brand!==baseline.brand||brands.some(scope=>parseProductName(scope).brand===baseline.brand)).filter(product=>!brands.length||brands.some(scope=>{const a=parseProductName(scope),b=parseProductName(name(product));return a.brand?a.brand===b.brand:String(product.brand||'').toLowerCase().includes(scope.toLowerCase());})).map(classify).filter(row=>row.status==='comparable').sort((a,b)=>a.distance-b.distance);
  const recommendations=[],seen=new Set();
  for(const item of eligible){const identity=parseProductName(item.name),key=identity.brand||item.name;if(seen.has(key)||recommendations.some(row=>sameProduct(row.name,item.name)))continue;seen.add(key);recommendations.push(item);if(recommendations.length===3)break;}
  const requested=[...new Set(Array.isArray(candidates)?candidates:explicit)].filter(value=>!sameProduct(value,reference.name));
  const rows=requested.map(value=>{
    const found=products.filter(product=>sameProduct(name(product),value));
    const target=found.find(product=>(product.regions||[]).some(item=>normalizeRegion(item)===region));
    if(!target)return {name:parseProductName(value).display,status:found.length?'region_unavailable':'unmatched',reason:found.length?'规格库已收录其他地区版本；当前地区尚待复核':'规格库未匹配到准确型号，不能猜测参数',catalogUrl:'https://hellotech2.pages.dev/'};
    return {...classify(target),explicit:explicit.some(item=>sameProduct(item,value))};
  });
  return {status:'ready',applies:true,requiresConfirmation:false,policy,reference,recommendations,rows,explicitNames:explicit,automatic:!explicit.length||brands.length>0,reason:'容量与额定连续功率分别按阈值筛选；不使用峰值、升压带载功率或扩容套装容量。'};
}
