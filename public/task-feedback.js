import {stageModel} from './waiting-room.js?v=0d401f7edfb044fc';
import {modelFailureHelp} from './model-diagnostics.js?v=0d401f7edfb044fc';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const active=task=>['running','planning','queued'].includes(task?.status);
const states=new Map();
let bar=null,observer=null,current=null,openTask=null,online=true;
const setText=(node,value)=>{if(node&&node.textContent!==String(value))node.textContent=value;};
function actionModel(task){
  const editable=task.permissions?.canEdit!==false;
  if(task.status==='plan_ready')return {kind:'attention',icon:'!',title:editable?'下一步：确认研究计划':'研究计划等待创建者确认',text:'请检查研究问题、基准型号、同档竞品与检索范围。确认后才会开始资料搜索。',label:'检查并确认计划',action:'plan'};
  if(task.status==='failed'){
    let text=String(task.error||'当前阶段未完成，已保存可用的阶段结果。');
    const help=modelFailureHelp(task);if(help)text+=' '+help;
    if(/来源.*审查/.test(text)&&/截断|长度上限/.test(text)){
      const saved=Object.keys(task.research?.searchCheckpoint?.completedQueries||{}).length;
      text+=' '+(saved?'已保存'+saved+'条查询结果；重试会继续未完成的审查，复用成功查询。':'此旧版本未保存原始搜索结果，不能仅凭来源数量恢复；重试可能重新检索。新版会逐查询、逐批保存。');
    }
    return {kind:'error',icon:'!',title:'研究已中断，需要处理后重试',text,label:'查看原因与重试入口',action:'error'};
  }
  if(task.status==='needs_review'||(task.status==='completed'&&task.quality?.publishable===false))return {kind:'attention',icon:'!',title:task.quality?.status==='legacy_unverified'?'历史报告可阅读 · 尚未按当前规则验收':'报告已生成 · 草稿待核验',text:'可以先阅读与导出草稿；尚有证据或内容问题需要处理，完整原因保存在质量说明中。',label:'查看草稿与待核验项',action:'review'};
  if(task.status==='completed')return {kind:'success',icon:'✓',title:'报告已完成',text:'报告已保存到本机，可以阅读、核对来源或按章节导出 Word。',label:'查看报告',action:'report'};
  return null;
}
export function renderTaskAction(task){
  if(task.report&&["needs_review","completed"].includes(task.status))return "";
  const model=actionModel(task);if(!model)return '';
  const second=task.status==='completed'&&task.report?'<button type="button" data-feedback-action="export" data-feedback-task="'+esc(task.id)+'">选择章节导出 Word</button>':['needs_review','failed'].includes(task.status)&&task.permissions?.canEdit!==false?'<button type="button" data-feedback-action="retry" data-feedback-task="'+esc(task.id)+'">'+(task.status==='failed'?'从已保存阶段重试':'继续研究与核验')+'</button>':'';
  return '<section class="task-next-action '+model.kind+'" aria-label="当前需要的操作"><span class="feedback-icon" aria-hidden="true">'+model.icon+'</span><div><h2>'+esc(model.title)+'</h2><p>'+esc(model.text)+'</p></div><div class="next-action-buttons"><button class="feedback-primary" type="button" data-feedback-action="'+model.action+'" data-feedback-task="'+esc(task.id)+'">'+model.label+'</button>'+second+'</div></section>';
}
function measure(){const view=document.querySelector('#task-view');if(view)view.style.setProperty('--pinned-progress-height',bar&&!bar.hidden?Math.ceil(bar.getBoundingClientRect().height)+10+'px':'0px');}
function ensureBar(){
  if(bar?.isConnected)return;
  const view=document.querySelector('#task-view');if(!view)return;
  bar=document.createElement('aside');bar.className='pinned-progress';bar.hidden=true;bar.setAttribute('aria-label','固定研究进度');
  bar.innerHTML='<div class="pinned-progress-main"><span class="pinned-status-icon" aria-hidden="true"></span><div class="pinned-copy"><strong data-pinned-title role="status" aria-live="polite"></strong><span data-pinned-activity></span></div><div class="pinned-summary"><strong data-pinned-count></strong><small data-pinned-caption></small></div><button type="button" data-feedback-action="progress">查看详细进度 ↓</button></div><div class="pinned-meter" role="progressbar" aria-label="当前环节进度"><span></span></div>';
  view.prepend(bar);if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(measure);observer.observe(bar);}else window.addEventListener('resize',measure);
}
function paintBar(){
  if(!bar||!current)return;
  const task=current,model=stageModel(task),next=actionModel(task),running=active(task);
  const title=!online&&running?'连接中断 · 正在重连':running?(task.status==='queued'?'任务排队中':String(model.phase+1).padStart(2,'0')+' / 05 · '+model.title):next?.title||'等待操作';
  bar.dataset.kind=!online&&running?'offline':running?'running':next?.kind||'attention';
  setText(bar.querySelector('[data-pinned-title]'),title);
  const activity=!online&&running?'暂未取得最新状态，下方保留上次保存的进度。':running?model.activity:next?.text||'';
  setText(bar.querySelector('[data-pinned-activity]'),activity);bar.querySelector('[data-pinned-activity]').title=activity;
  const research=task.research||{},count=research.searchProgress?.sourceCount??research.sources?.length??0;
  setText(bar.querySelector('[data-pinned-count]'),count+' 条来源');
  setText(bar.querySelector('[data-pinned-caption]'),running?model.label:'结果已保存到本机');
  setText(bar.querySelector('.pinned-status-icon'),running?'':next?.icon||'!');
  const button=bar.querySelector('button');button.dataset.feedbackTask=task.id;button.dataset.feedbackAction=running?'progress':next?.action||'progress';setText(button,running?'查看详细进度 ↓':next?.label||'查看详情');
  const meter=bar.querySelector('.pinned-meter'),fraction=running&&online?model.fraction:null;
  meter.hidden=!running;meter.classList.toggle('is-indeterminate',running&&online&&fraction===null);meter.classList.toggle('is-offline',!online);
  if(fraction!==null){meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.setAttribute('aria-valuenow',String(Math.round(fraction*100)));meter.firstElementChild.style.width=Math.round(fraction*100)+'%';}else {meter.removeAttribute('aria-valuenow');meter.firstElementChild.style.width='';}
  meter.setAttribute('aria-valuetext',online?model.label:'连接中断，显示上次进度');measure();
}
function notify(task,model){
  let region=document.querySelector('#task-notifications');if(!region){region=document.createElement('div');region.id='task-notifications';region.className='task-notifications';region.setAttribute('role','status');region.setAttribute('aria-live','polite');region.setAttribute('aria-atomic','true');document.body.append(region);}
  region.dataset.task=task.id;
  region.innerHTML='<section class="task-notice '+model.kind+'" aria-label="研究状态通知"><span class="feedback-icon" aria-hidden="true">'+model.icon+'</span><div><h2>'+esc(model.title)+'</h2><p class="notice-task-name">'+esc(task.title||task.input?.subject||'当前研究')+'</p><p>'+esc(model.text)+'</p><button type="button" class="feedback-primary" data-feedback-action="'+model.action+'" data-feedback-task="'+esc(task.id)+'">'+model.label+' →</button></div><button type="button" class="notice-close" data-feedback-dismiss aria-label="关闭通知">×</button></section>';
}
export function updateTaskFeedback(task,{onOpenTask}={}){
  const previous=states.get(task.id);states.set(task.id,{status:task.status,active:active(task)});openTask=onOpenTask||openTask;online=true;
  const next=actionModel(task),changed=previous?.status!==task.status;
  if(previous?.active&&changed&&next)notify(task,next);
  const notices=document.querySelector('#task-notifications');if(active(task)&&changed&&notices?.dataset.task===task.id)notices.replaceChildren();
  current=task;ensureBar();if(bar){bar.hidden=!active(task);paintBar();}
}
export function setTaskFeedbackConnection(value){online=value;paintBar();}
export function clearTaskFeedback(){states.clear();current=null;observer?.disconnect();observer=null;bar?.remove();bar=null;document.querySelector('#task-notifications')?.remove();document.querySelector('#task-view')?.style.removeProperty('--pinned-progress-height');}
function scrollToTarget(selector){
  const target=document.querySelector(selector);if(!target)return false;
  for(let parent=target;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  target.scrollIntoView({block:'start',behavior:'auto'});return true;
}
document.addEventListener('click',async event=>{
  if(event.target.closest('[data-feedback-dismiss]')){document.querySelector('#task-notifications')?.replaceChildren();return;}
  const button=event.target.closest('[data-feedback-action]');if(!button)return;
  const id=button.dataset.feedbackTask,action=button.dataset.feedbackAction;button.disabled=true;
  try{
    await openTask?.(id);document.querySelector('#task-notifications')?.replaceChildren();
    if(action==='export'){document.querySelector('#export')?.click();return;}
    if(action==='retry'){document.querySelector('#retry')?.click();return;}
    if(action==='plan'){scrollToTarget('.plan-review');return;}
    if(action==='error'){scrollToTarget('.task-next-action.error')||scrollToTarget('#task-content .error');return;}
    if(action==='review'||action==='report'){document.querySelector('[data-report-tab="report"]')?.click();scrollToTarget(action==='review'?'.quality-notice':'.report-title')||scrollToTarget('.report');return;}
    scrollToTarget('#task-content .progress');
  }catch{button.disabled=false;return;}
  finally{if(button.isConnected)button.disabled=false;}
});
