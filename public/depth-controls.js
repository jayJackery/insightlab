import {resolveReportDepth} from './report-depth.js?v=983914e21674fb3e';
export function setupDepthControls(){
  const form=document.querySelector('#reportLength')?.form,hint=document.querySelector('#delivery-hint');
  if(!form||!hint)return;
  const update=()=>{const input=Object.fromEntries(new FormData(form));if(!String(input.subject||'').trim()&&!String(input.questions||'').trim()){hint.textContent='选择篇幅后填写问题；Auto会根据问题复杂度选择精准问答或完整研究。';return;}const value=resolveReportDepth(input);hint.textContent=value.label+' · '+value.reason+'。'+value.characters+(value.autoStart?'；提交后直接执行，无需二次确认。':'；先确认研究计划再执行。');};
  form.addEventListener('input',update);form.addEventListener('change',update);form.addEventListener('reset',()=>setTimeout(update,0));update();
}
