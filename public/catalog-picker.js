import {esc,safeHref} from './comparison-view.js';
import {catalogDisplayName,cleanProductLabel} from './product-identity.js';
import {sameProduct} from '../src/domain/evidence/product-registry.js';
const names=value=>String(value||'').split(/[、，,；;\n]/u).map(cleanProductLabel).filter(Boolean);
const compact=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const category=product=>/扩容|电池包/.test(product.category)?'扩容电池':/逆变器|控制器/.test(product.category)?'逆变器 / 控制器':/便携|户外/.test(product.category)?'便携储能':'家庭储能';
const capacityMatches=(product,range)=>{const value=product.specs?.capacityWh;return !range||range==='unknown'?!range||!value:value>Number(range.split(':')[0])&&value<=Number(range.split(':')[1]);};
let cachedFeed=null,pending=null;
async function feed(api){if(cachedFeed)return cachedFeed;if(!pending)pending=api('/api/catalog/spotlight').then(value=>{if(!Array.isArray(value.products)||!value.products.length)throw Error('规格库暂无可读取产品。');cachedFeed=value;return value;}).finally(()=>{pending=null;});return pending;}
export function setupCatalogPicker({api,getBaseline,onPlanApply}){
  let dialog=null,opener=null,scope='brief',data=null,products=[],selected=[],baseline='',limit=12;
  const selectedProduct=name=>selected.some(item=>sameProduct(item,name));
  const close=()=>{dialog?.close();opener?.focus();};
  function updateCount(){dialog.querySelector('[data-picker-count]').textContent='已选 '+selected.length+' / '+limit+' 款竞品';dialog.querySelector('[data-picker-selected]').innerHTML=selected.length?selected.map(name=>'<button type="button" data-picker-remove="'+esc(name)+'" aria-label="移除 '+esc(name)+'">'+esc(name)+' ×</button>').join(''):'<span>还未选择；也可不指定竞品，让研究按问题展开。</span>';}
  function render(){
    if(!data)return;
    const query=compact(dialog.querySelector('#catalog-product-query').value),kind=dialog.querySelector('#catalog-product-category').value,brand=dialog.querySelector('#catalog-product-brand').value,range=dialog.querySelector('#catalog-product-capacity').value;
    const rows=products.filter(group=>(!query||compact(group.name+' '+group.brand+(group.brand==='Jackery'?' 电小二 华宝新能':'')).includes(query))&&(!kind||group.variants.some(item=>category(item)===kind))&&(!brand||group.brand===brand)&&group.variants.some(item=>capacityMatches(item,range)));
    dialog.querySelector('[data-picker-results]').innerHTML='<p class="catalog-result-count">找到 '+rows.length+' 款型号 · 容量为标称容量，功率为额定连续功率</p><div class="catalog-picker-grid">'+rows.map(group=>{const protectedProduct=baseline&&sameProduct(group.name,baseline),checked=selectedProduct(group.name);return '<label class="catalog-picker-card'+(checked?' is-selected':'')+'"><input type="checkbox" data-picker-product="'+esc(group.name)+'"'+(checked?' checked':'')+(protectedProduct?' disabled':'')+'><div><strong>'+esc(group.name)+'</strong><small>'+esc(category(group.variants[0]))+(protectedProduct?' · 对比基准，单独保留':'')+'</small><ul>'+group.variants.map(item=>'<li><b>'+esc(item.specs?.capacityWh?item.specs.capacityWh+' Wh':'容量未收录')+' / '+esc(item.specs?.ratedPowerW?item.specs.ratedPowerW+' W':'连续功率未收录')+'</b><span>'+esc((item.regions||[]).join('/')||'地区未注明')+' · '+esc(item.verifiedDate||'日期未注明')+'</span></li>').join('')+'</ul><a href="'+esc(safeHref(group.variants[0].catalogUrl))+'" target="_blank" rel="noopener noreferrer">规格库整理记录 ↗</a></div></label>';}).join('')+'</div>'+(rows.length?'':'<p class="comparison-result-note">当前分类没有匹配产品，可清空型号关键词或切换分类。</p>');
    updateCount();
  }
  function showError(message){dialog.querySelector('[data-picker-error]').textContent=message;}
  async function open(button){
    opener=button;scope=button.dataset.openCatalog;
    if(dialog)dialog.remove();
    data=null;products=[];
    baseline=scope==='brief'?document.querySelector('#baselineProduct').value.trim():await getBaseline();
    selected=names(document.querySelector(scope==='brief'?'#competitors':'#plan-competitors').value).filter(name=>!baseline||!sameProduct(name,baseline));limit=baseline?11:12;
    dialog=document.createElement('dialog');dialog.className='catalog-picker-dialog';dialog.setAttribute('aria-labelledby','catalog-picker-title');
    dialog.innerHTML='<header><div><small>PRODUCT LIBRARY</small><h2 id="catalog-picker-title">从规格库选择竞品</h2><p>按类别、品牌和容量筛选，可多选；跨档型号仍可加入，研究前会标明。</p></div><button type="button" data-picker-close aria-label="关闭规格库">×</button></header><section class="catalog-picker-filters"><label>产品类别<select id="catalog-product-category"><option value="">所有类别</option>'+['便携储能','家庭储能','扩容电池','逆变器 / 控制器'].map(value=>'<option>'+value+'</option>').join('')+'</select></label><label>品牌<select id="catalog-product-brand"><option value="">所有品牌</option></select></label><label>容量档位<select id="catalog-product-capacity"><option value="">所有容量</option><option value="0:500">≤500 Wh</option><option value="500:1000">500–1000 Wh</option><option value="1000:2000">1000–2000 Wh</option><option value="2000:4000">2000–4000 Wh</option><option value="4000:Infinity">＞4000 Wh</option><option value="unknown">未收录容量</option></select></label><label>搜索型号<input id="catalog-product-query" type="search" placeholder="例如 C1000、DELTA、电小二"></label></section><div class="catalog-picker-body"><p data-picker-source>正在读取公开规格库…</p><div data-picker-results></div></div><section class="catalog-picker-selection" data-picker-selected></section><p class="catalog-picker-error" role="status" data-picker-error></p><footer><span data-picker-count></span><div><button type="button" data-picker-close>取消</button><button type="button" class="primary" data-picker-apply disabled>应用所选竞品</button></div></footer>';
    document.body.append(dialog);dialog.showModal();updateCount();
    dialog.addEventListener('click',async event=>{
      if(event.target.closest('[data-picker-close]'))return close();
      const remove=event.target.closest('[data-picker-remove]');if(remove){selected=selected.filter(name=>!sameProduct(name,remove.dataset.pickerRemove));render();return;}
      const apply=event.target.closest('[data-picker-apply]');if(!apply)return;
      apply.disabled=true;try{if(scope==='brief'){const input=document.querySelector('#competitors');input.value=selected.join('、');input.dispatchEvent(new Event('change',{bubbles:true}));}else await onPlanApply(selected);close();}catch(error){showError(error.message);}finally{apply.disabled=false;}
    });
    dialog.addEventListener('change',event=>{
      const checkbox=event.target.closest('[data-picker-product]');if(!checkbox)return render();
      showError('');const name=checkbox.dataset.pickerProduct;
      if(checkbox.checked&&!selectedProduct(name)){if(selected.length>=limit){checkbox.checked=false;showError('最多选择'+limit+'款竞品'+(baseline?'，基准另计。':'。'));return;}selected.push(name);}else if(!checkbox.checked)selected=selected.filter(item=>!sameProduct(item,name));
      render();
    });
    dialog.querySelector('#catalog-product-query').addEventListener('input',render);
    dialog.addEventListener('cancel',()=>opener?.focus());
    const active=dialog;
    try{data=await feed(api);if(dialog!==active||!dialog.open)return;products=[];for(const product of data.products){const name=catalogDisplayName(product),existing=products.find(group=>sameProduct(group.name,name));if(existing)existing.variants.push(product);else products.push({name,brand:product.brand||'未注明品牌',variants:[product]});}dialog.querySelector('#catalog-product-brand').innerHTML='<option value="">所有品牌</option>'+[...new Set(products.map(item=>item.brand))].sort().map(brand=>'<option>'+esc(brand)+'</option>').join('');dialog.querySelector('[data-picker-source]').textContent='来源：部门规格库 · '+(data.retrievedAt?data.retrievedAt.slice(0,10):'日期未注明')+' · '+(data.warning||'保留各产品记录的地区和复核日期，整理值不是本轮官网认证。');dialog.querySelector('[data-picker-apply]').disabled=false;render();}catch(error){if(dialog===active)showError('规格库暂时无法读取：'+error.message+'。仍可在计划中手动填写型号。');}
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-open-catalog]');if(button)open(button).catch(error=>{if(dialog)showError(error.message);});});
}
