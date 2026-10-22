import {randomUUID} from './shims/crypto.js';
import {normalizePlan,validateQueries} from '../../public/plan-utils.js';
import {resolveResearchFocus} from '../../public/research-focus.js';
import {comparisonInput} from '../domain/research/competitor-selection.js';
import {createReviewRevision} from '../application/research/review-feedback.js';
const fields=['subject','scenario','questions','baselineProduct','competitors','timeRange','metrics','purpose','analysisFocus','reportLength','capacityTolerance','powerTolerance'];
export function createTaskActions({repository,recommendCompetitors,enqueue,ready,writable}){
  const {createTask,update}=repository;
  async function create(input,research=null,title){
    ready();
    if(typeof input?.subject!=='string'||!input.subject.trim())throw Error('请填写分析对象。');
    const brief={};for(const field of fields)if(input[field]!==undefined){if(!['string','number'].includes(typeof input[field])||String(input[field]).length>20000)throw Error('需求字段过长或格式无效。');brief[field]=input[field];}
    const id=randomUUID();createTask({id,title:title||brief.subject.trim()+' 技术洞察',input:brief,status:'queued',research});
    await repository.flush();enqueue(id,'plan');return {id};
  }
  return {
    create,
    async recommend(body){
      if(typeof body.input?.subject!=='string')throw Error('请提供分析对象。');
      if(body.candidates!==undefined&&(!Array.isArray(body.candidates)||body.candidates.length>12||body.candidates.some(name=>typeof name!=='string'||name.length>200)))throw Error('最多选择12个准确竞品型号。');
      const task=body.taskId?repository.getTask(body.taskId):null;
      return recommendCompetitors({...body.input,...comparisonInput(body.input)},{...(body.candidates?{candidates:body.candidates}:{}),baselineRecords:task?.research?.baselineDiscovery?.records||[]});
    },
    async start(task,body){
      ready();if(task.status!=='plan_ready')throw Error('计划尚未准备好或已开始执行。');
      const raw={...task.research?.plan,...body.plan};validateQueries(raw.queries);
      const normalized=normalizePlan(raw,task.input),plan={...normalized,researchPolicy:{...raw.researchPolicy,version:6,focus:resolveResearchFocus({...task.input,analysisFocus:normalized.analysisFocus})}};
      const comparison=comparisonInput(body.comparison||plan.comparisonInput||task.input),selection=await recommendCompetitors({...task.input,...comparison},{candidates:plan.competitors,baselineRecords:task.research?.baselineDiscovery?.records||[]});
      if(selection.applies){
        if(selection.requiresConfirmation)throw Error(selection.reason);
        if(!selection.rows.length)throw Error('请先应用同档推荐，或填写准确竞品型号。');
        if(selection.rows.some(row=>row.status!=='comparable')&&body.allowCrossTier!==true)throw Error('部分型号跨档或未匹配，请调整竞品；确需保留时勾选跨档参考。');
        plan.comparisonInput=comparison;plan.competitorSelection={...selection,crossTierConfirmed:body.allowCrossTier===true};plan.comparisonScope={region:selection.reference.region,configuration:'bare_unit'};
      }
      update(task.id,{research:{...task.research,plan},status:'queued',phaseIndex:0,phaseStatus:'pending',error:null});
      await repository.flush();enqueue(task.id,'research');return {id:task.id};
    },
    async retry(task){
      ready();if(!['failed','needs_review'].includes(task.status))throw Error('只有失败或待核验研究可以重试。');
      if(task.research?.plan)validateQueries(task.research.plan.queries);
      update(task.id,{status:'queued',phaseStatus:'pending',error:null,...(!task.research?.plan?{phaseIndex:0}:{})});await repository.flush();enqueue(task.id,task.research?.plan?'research':'plan');return {id:task.id};
    },
    async replan(task){if(!['completed','failed','plan_ready','needs_review'].includes(task.status))throw Error('请等待当前研究结束。');return create({...task.input,analysisFocus:task.research?.plan?.analysisFocus??task.input.analysisFocus},{replannedFromTaskId:task.id},task.title);},
    async followup(task,body){if(typeof body.request!=='string'||!body.request.trim()||body.request.length>12000)throw Error('请填写不超过12000字的补充问题。');return create({...task.input,analysisFocus:task.research?.plan?.analysisFocus??task.input.analysisFocus,questions:[task.input.questions,'补充调研：'+body.request.trim()].filter(Boolean).join('\n')},{parentTaskId:task.id,supplementalRound:Number(task.research?.supplementalRound||0)+1},task.input.subject+' 补充调研');},
    async review(task,body){writable();const result=createReviewRevision(task,body,{repository,ownTask:()=>{},userId:'browser-workspace'});await repository.flush();return result;},
  };
}
