import {sameProduct} from './product-registry.js?v=e9968bcba1cb9548';
import {metricDefinition,normalizeRegion} from './metric-schema.js?v=e9968bcba1cb9548';
import {catalogDisplayName} from '../../../public/product-identity.js?v=e9968bcba1cb9548';
// Copy typed catalog fields directly; never ask a model to invent missing columns.
export function catalogEvidence(sources,registry=[]){
  const rows=[];
  for(const source of sources){
    const record=source.provider==='team_catalog'&&source.catalogRecord;
    if(!record)continue;
    const name=catalogDisplayName(record);
    const entity=registry.find(product=>product.exact&&sameProduct(product.display,name));if(!entity)continue;
    const charge=record.electricalInput?.acFastCharge;
    const chargeIsTime=typeof charge==='string'&&/\d[\d.,–—-]*\s*(?:h(?:ours?)?\b|min(?:utes?)?\b|小时|分钟|时)/i.test(charge);
    const fields=[['电池容量',record.metrics?.capacityWh,'Wh',record.metrics?.capacityLabel],['持续功率',record.metrics?.ratedPowerW??record.metrics?.acPowerW,'W',record.metrics?.powerLabel],['重量',record.metrics?.weightKg,'kg',record.metrics?.weightLabel],['电芯体系',null,'',record.metrics?.chemistryLabel||record.battery?.cellChemistry],[chargeIsTime?'充电时间':'AC充电输入',null,'',charge],['扩展能力',null,'',record.battery?.expansion],['防护等级',null,'',record.mechanics?.ingressProtection],['循环寿命',null,'',record.battery?.cycleLife],['质保',null,'',record.compliance?.warranty]];
    if(Number.isFinite(record.referencePrice?.amount))fields.push(['价格',record.referencePrice.amount,record.referencePrice.currency||'',record.referencePrice.note||'']);
    for(const region of record.regions?.length?record.regions:['unknown']){
      const metricValues=fields.flatMap(([metric,number,unit,label])=>{
        if(metric==='价格'&&normalizeRegion(record.referencePrice?.market)!==normalizeRegion(region))return [];
        const numeric=Number.isFinite(number)&&number>0?number:null;
        if(numeric===null&&(typeof label!=='string'||!label.trim()))return [];
        const part=/扩容电池|电池包/.test(record.category||'')?'pack':/逆变器|充电器|太阳能板/.test(record.category||'')?'accessory':'whole_unit';
        const ambiguousMass=metric==='重量'&&/逆变器|电池另计|电池包|模组/.test(label||'');
        const checked=metric==='价格'?record.referencePrice?.checkedDate:record.verifiedDate;
        const hasValue=metric==='防护等级'?/IP\s*\d{2}/i.test(label||''):metric==='质保'?/\d\s*(?:年|year)/i.test(label||''):metric==='AC充电输入'?/\d[\d,.]*\s*k?W\b/i.test(label||''):metric==='充电时间'?chargeIsTime:false;
        const unknown=numeric===null&&!hasValue&&/未公开|未标注|未披露|未列|未定位|未注明|不详|待补充|待核实|未知/.test(label||'');
        return [{metric,metricId:metricDefinition(metric).id,value:unknown?'':ambiguousMass?label:numeric??label,unit:ambiguousMass?'':unit,numericValue:ambiguousMass?null:numeric,product:entity.display,component:ambiguousMass?'unknown':part,measureBasis:ambiguousMass||part==='accessory'?'unknown':part,region:normalizeRegion(region),configuration:['bare_unit','bundle','refurbished'].includes(record.configuration)?record.configuration:'unknown',condition:label||'规格库未补充测量条件',status:unknown?'not_found':'curated',basis:'team_catalog',sourceIds:[source.id],catalogProductId:record.id,catalogVerifiedDate:checked||null,officialUrl:record.officialUrl,catalogValueLabel:label||'',note:(unknown?'规格库记录为未知，不能当已知参数：':'规格库已收录，部门整理来源，非官方独立验证；')+(checked?'记录复核 '+checked+'；':'')+'地区 '+region+'；配置 '+(record.configuration||'未注明')+'。'+(label||''),verification:{status:'catalog_record',method:'typed_catalog_field',reason:'按准确型号复制规格库原字段，不代表官方核验通过。'}}];
      });
      rows.push({competitor:entity.display,productId:entity.id,evidenceIds:[source.id],metricValues});
    }
  }
  return {claims:[],competitorRows:rows,conflicts:[],gaps:[]};
}
