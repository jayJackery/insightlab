import {randomUUID} from './shims/crypto.js';
import {presentTask} from '../domain/research/task-presentation.js';
function noCredentials(value,depth=0){
  if(depth>100)throw Error('备份嵌套层级异常。');
  if(!value||typeof value!=='object')return;
  for(const [key,item] of Object.entries(value)){
    if(/^(?:DEEPSEEK_API_KEY|OPENAI_API_KEY|TAVILY_API_KEY|api[_-]?key|authorization|password|token)$/i.test(key))throw Error('备份包含凭据字段，禁止导入。请使用本工具的报告备份。');
    if(/(?:url|href)$/i.test(key)&&typeof item==='string'&&item.trim()){try{const url=new URL(item);if(!/^https?:$/.test(url.protocol)||url.username||url.password)throw Error();}catch{throw Error('备份包含不安全或无效的网址，未导入。');}}
    noCredentials(item,depth+1);
  }
}
export function createBackup(runtime){
  const payload={format:'insightlab-browser-backup',version:1,exportedAt:new Date().toISOString(),buildId:runtime.runtime.buildId,tasks:runtime.repository.rawTasks()};
  const raw=runtime.redact(JSON.stringify(payload));noCredentials(JSON.parse(raw));return new Blob([raw],{type:'application/json;charset=utf-8'});
}
export async function importBackup(file,runtime){
  if(!runtime.workspace.writable)throw Error(runtime.workspace.reason);
  if(runtime.busy())throw Error('调研正在执行，请结束后再导入备份。');
  if(file.size>50*1024*1024)throw Error('备份不能超过50MB。');
  let value;try{value=JSON.parse(await file.text());}catch{throw Error('备份不是有效的JSON文件。');}
  if(value.format!=='insightlab-browser-backup'||value.version!==1||!Array.isArray(value.tasks)||value.tasks.length>200)throw Error('备份格式或版本不支持，单次最多导入200条。');
  noCredentials(value);
  const now=new Date().toISOString(),entries=value.tasks.map(task=>{
    if(!task||typeof task.title!=='string'||task.title.length>500||typeof task.input?.subject!=='string'||!task.input.subject.trim()||task.input.subject.length>1000||task.research!=null&&typeof task.research!=='object'||task.report!=null&&typeof task.report!=='object'||task.evidence!=null&&typeof task.evidence!=='object')throw Error('备份中的研究记录不完整，未执行导入。');
    const copy={...task,id:randomUUID(),status:task.report?'needs_review':task.research?.plan?'plan_ready':'failed',phaseStatus:task.report?'needs_review':task.research?.plan?'completed':'failed',phaseIndex:task.report?4:0,createdAt:now,updatedAt:now,error:'从备份导入，原记录保留；尚未按当前规则重新验收。',research:{...task.research,runtime:{workflowVersion:'backup-import',buildId:'unverified'},backupImport:{originalId:task.id,importedAt:now,originalBuildId:task.research?.runtime?.buildId}},report:task.report?{...task.report,workflowVersion:'imported/unverified',answerAudit:{...task.report.answerAudit,status:'needs_review',staleAfterUserRevision:true,findings:[{severity:'blocking',message:'备份导入内容尚未按当前规则重新核验。'}]}}:null};
    try{presentTask(copy);}catch{throw Error('备份的报告/证据结构不支持，未执行导入。');}return copy;
  });
  for(const task of entries){runtime.repository.createTask({id:task.id,title:task.title,input:task.input,status:task.status,research:task.research,createdAt:now});runtime.repository.update(task.id,{report:task.report,evidence:task.evidence||null,phaseIndex:task.phaseIndex,phaseStatus:task.phaseStatus,error:task.error});}
  await runtime.repository.flush();return entries.length;
}
