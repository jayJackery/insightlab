import {presentTask} from '../domain/research/task-presentation.js?v=8e1e00bb1d41da9f';
import {assertPublication} from '../domain/research/publication-gate.js?v=8e1e00bb1d41da9f';
import {mergeResearchState} from '../infrastructure/persistence/research-state.js?v=8e1e00bb1d41da9f';
import {taskRecords,saveTask,flushStorage} from './storage.js?v=8e1e00bb1d41da9f';
export function createBrowserRepository(){
  const rows=taskRecords();
  const getTask=id=>rows.has(id)?{...presentTask(rows.get(id)),permissions:{canEdit:true,canShare:false,shared:false}}:null;
  const update=(id,patch)=>{
    const current=rows.get(id);if(!current)throw Error('找不到研究记录。');
    const next=structuredClone({...current,...patch,updatedAt:new Date().toISOString()});
    if(patch.research)next.research=mergeResearchState(current.research||{},patch.research);
    if(next.status==='completed')next.report={...next.report,quality:assertPublication(next)};
    saveTask(next);
  };
  return {getTask,update,flush:flushStorage,
    createTask({id,title,input,status,research=null,createdAt=new Date().toISOString()}){if(rows.has(id))throw Error('研究ID已存在。');saveTask({id,title,input:structuredClone(input),status,research,report:null,evidence:null,phaseIndex:0,phaseStatus:'pending',error:null,createdAt,updatedAt:createdAt});},
    listTasks:()=>[...rows.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(row=>getTask(row.id)),
    rawTasks:()=>structuredClone([...rows.values()]),
    activeTask:()=>{const row=[...rows.values()].find(row=>['planning','queued','running'].includes(row.status));return row?{id:row.id,title:row.title,status:row.status,phaseIndex:row.phaseIndex}:null;},
    hasActive:()=>[...rows.values()].some(row=>['planning','queued','running'].includes(row.status)),
    recoverInterrupted(){for(const row of [...rows.values()])if(['planning','queued','running'].includes(row.status))update(row.id,{status:'failed',phaseStatus:'failed',error:'上次页面已中断；阶段检查点和查询预算已保留。请重新填写本页密钥，再从失败阶段重试。'});},
  };
}
