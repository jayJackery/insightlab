import {loadCatalog,CATALOG_URL} from '../../browser/catalog.js?v=8e1e00bb1d41da9f';

const text=(value,limit=220)=>typeof value==='string'?(value.trim().length>limit?value.trim().slice(0,limit)+'…':value.trim()):'';
function url(value,{image=false}={}){
  if(typeof value!=='string'||!value.trim())return '';
  try{const link=new URL(value,CATALOG_URL);if(link.protocol!=='https:'||link.username||link.password||(image&&link.origin!==new URL(CATALOG_URL).origin))return '';return link.href;}catch{return '';}
}
export function spotlightProduct(product){
  const metrics=product.metrics || {};
  const label=(value,number,unit)=>text(value,70)||(typeof number==='number'&&Number.isFinite(number)&&number>0?number+' '+unit:'本记录未列明');
  return {
    id:text(product.id,160),name:text(product.name,140),brand:text(product.brand,60),category:text(product.category,100),series:text(product.series,100),modelCode:text(product.modelCode,100),
    regions:Array.isArray(product.regions)?product.regions.filter(region=>typeof region==='string').slice(0,8):[],
    specs:{capacityWh:typeof metrics.capacityWh==='number'&&Number.isFinite(metrics.capacityWh)&&metrics.capacityWh>0?metrics.capacityWh:null,ratedPowerW:typeof (metrics.ratedPowerW??metrics.acPowerW)==='number'&&Number.isFinite(metrics.ratedPowerW??metrics.acPowerW)&&(metrics.ratedPowerW??metrics.acPowerW)>0?(metrics.ratedPowerW??metrics.acPowerW):null},
    imageUrl:url(product.imageUrl,{image:true}),officialUrl:url(product.officialUrl),catalogUrl:CATALOG_URL,verifiedDate:text(product.verifiedDate,30),
    metrics:[{label:'标称容量',value:label(metrics.capacityLabel,metrics.capacityWh,'Wh')},{label:'标注功率',value:label(metrics.powerLabel,metrics.ratedPowerW,'W')},{label:'重量',value:label(metrics.weightLabel,metrics.weightKg,'kg')}],
    tags:Array.isArray(product.tags)?product.tags.filter(tag=>typeof tag==='string').map(tag=>text(tag,80)).slice(0,4):[],
    features:[{label:'扩展方式',value:text(product.battery?.expansion)},{label:'防护说明',value:text(product.mechanics?.ingressProtection)}].filter(item=>item.value),
    chemistry:text(metrics.chemistryLabel,80),sourceNote:text(product.sourceNote),
  };
}
export function createCatalogSpotlight(options={}){
  let inFlight=null,memo=null,expires=0;
  return async()=>{
    if(memo&&Date.now()<expires)return memo;
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      const catalog=await loadCatalog(options);
      const products=catalog.products.map(spotlightProduct).filter(item=>item.id&&item.name);
      memo={sourceUrl:CATALOG_URL,sourceLabel:'部门产品规格库',retrievedAt:catalog.retrievedAt,status:catalog.status,warning:catalog.warning || '',products};
      expires=Date.now()+5*60*1000;return memo;
    })();
    try{return await inFlight;}finally{inFlight=null;}
  };
}
