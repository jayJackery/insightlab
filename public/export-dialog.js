import {jumpToReview} from './report-review.js?v=983914e21674fb3e';
import {reportSections} from './report-sections.js?v=983914e21674fb3e';
const esc=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const presets={main:['summary','findings','technology','comparison','applications','baseline','trends','risks','recommendations','sources'],core:['summary','findings','baseline','recommendations','sources'],technical:['summary','technology','comparison','recommendations','sources'],product:['summary','findings','comparison','applications','baseline','recommendations','sources']};
export function openExportDialog({task,onExport}) {
 const catalog=reportSections(task),dialog=document.createElement('dialog'),trigger=document.activeElement;
 dialog.className='report-export-dialog';dialog.setAttribute('aria-labelledby','report-export-title');
 dialog.innerHTML='<form><header><div><small>WORD EXPORT</small><h2 id="report-export-title">选择导出内容</h2><p>按需选择章节，也可以只导出部分技术主题。</p></div><button type="button" class="export-close" aria-label="关闭导出选择">×</button></header><div class="export-body"><div class="export-presets"><button type="button" data-preset="all">完整报告</button><button type="button" data-preset="core">核心结论</button><button type="button" data-preset="technical">技术专题</button><button type="button" data-preset="product">产品对比</button><button type="button" data-preset="none">清空选择</button></div><div class="export-section-list">'+catalog.map(section=>'<div class="export-section-option"><label><input type="checkbox" data-section="'+section.id+'"><span><strong>'+esc(section.label)+'</strong><small>'+esc(section.description)+'</small></span></label>'+(section.topics?.length?'<details class="export-topic-list"><summary>选择技术子主题（'+section.topics.length+'）</summary>'+section.topics.map(topic=>'<label><input type="checkbox" data-topic="'+topic.index+'"><span>'+esc(topic.label)+'</span></label>').join('')+'</details>':'')+'</div>').join('')+'</div><p class="export-note">标题和报告质量标识自动保留。省略来源清单时，引用编号仍可直接打开原文。</p><p class="export-error" role="alert"></p></div><footer><span class="export-count" aria-live="polite"></span><div><button type="button" class="export-cancel">取消</button><button type="submit" class="primary">生成 Word 文件 ↗</button></div></footer></form>';
 const review=task.reviewChecklist||[];if(review.length){const notice=document.createElement('section');notice.className='review-export-reminder';notice.innerHTML='<strong>使用结论前，请留意 '+review.length+' 项复核事项</strong>'+review.slice(0,3).map(item=>'<p>'+esc(item.subject)+'：'+esc(item.action)+'</p>').join('')+'<button type="button" data-export-review>查看完整复核清单 →</button><p>本次按草稿导出；选择章节不会使待核验内容自动通过。</p>';dialog.querySelector('.export-note').before(notice);notice.querySelector('button').addEventListener('click',()=>{dialog.close();jumpToReview(review[0]?.id);});}
 document.body.append(dialog);
 const sectionInputs=[...dialog.querySelectorAll('[data-section]')],topicInputs=[...dialog.querySelectorAll('[data-topic]')],parent=dialog.querySelector('[data-section="technology"]'),submit=dialog.querySelector('[type="submit"]');
 const update=()=>{
   const selected=sectionInputs.filter(input=>input.checked),count=topicInputs.filter(input=>input.checked).length;
   dialog.querySelector('.export-count').textContent='已选 '+selected.length+' 个章节'+(parent?.checked&&topicInputs.length?' · '+count+' 个技术主题':'');
   submit.disabled=!selected.some(input=>!['sources','review','methods','limits'].includes(input.dataset.section));
   topicInputs.forEach(input=>input.disabled=!parent?.checked);
 };
 const applyPreset=name=>{sectionInputs.forEach(input=>{input.checked=name==='all'||(presets[name] || []).includes(input.dataset.section);input.indeterminate=false;});topicInputs.forEach(input=>input.checked=Boolean(parent?.checked));update();};
 dialog.addEventListener('change',event=>{
   if(event.target===parent){topicInputs.forEach(input=>input.checked=parent.checked);parent.indeterminate=false;}
   else if(event.target.matches('[data-topic]')){const count=topicInputs.filter(input=>input.checked).length;parent.checked=count>0;parent.indeterminate=count>0&&count<topicInputs.length;}
   update();
 });
 dialog.addEventListener('click',event=>{const preset=event.target.closest('[data-preset]');if(preset)applyPreset(preset.dataset.preset);if(event.target.closest('.export-close,.export-cancel')||event.target===dialog)dialog.close();});
 dialog.addEventListener('close',()=>{dialog.remove();trigger?.focus();},{once:true});
 dialog.querySelector('form').addEventListener('submit',async event=>{
   event.preventDefault();submit.disabled=true;submit.textContent='正在生成…';dialog.querySelector('.export-error').textContent='';
   try{await onExport({sections:sectionInputs.filter(input=>input.checked).map(input=>input.dataset.section),topicIndexes:parent?.checked?topicInputs.filter(input=>input.checked).map(input=>Number(input.dataset.topic)):[]});dialog.close();}
   catch(error){dialog.querySelector('.export-error').textContent=error.message;submit.textContent='生成 Word 文件 ↗';update();}
 });
 applyPreset('main');dialog.showModal();
}
