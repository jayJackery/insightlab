import {digest} from '../../domain/evidence/source-document.js?v=0d401f7edfb044fc';
import {mapConcurrent} from './concurrency.js?v=0d401f7edfb044fc';
import {evidenceGaps} from '../../domain/evidence/evidence-gaps.js?v=0d401f7edfb044fc';

export async function auditAnswers({report,contract,evidence,model,modelIdentity='unknown',checkpoint={},persist=()=>{}}){
  const {technologyOverview,keyFindings,answerAudit,quality,generatedAt,...clean}=report;
  const signature=digest(JSON.stringify(['answer-review-v2',modelIdentity,contract,evidence,clean]));
  if(checkpoint.signature!==signature){checkpoint.signature=signature;checkpoint.batches={};}
  checkpoint.batches ||= {};
  const allQuestions=[...(contract.userQuestions||[]),...(contract.questions||[])];
  const jobs=[];
  for(let i=0;i<allQuestions.length;i+=4)jobs.push({key:'questions-'+i,questions:allQuestions.slice(i,i+4),topics:[]});
  const routes=clean.technologyDeepDives||[];
  for(let i=0;i<routes.length;i+=2)jobs.push({key:'topics-'+i,questions:[],topics:routes.slice(i,i+2).map((route,index)=>({index:i+index,route}))});
  const gaps=evidenceGaps(evidence,contract.originalInput||{});
  for(let i=0;i<gaps.length;i+=8)jobs.push({key:'gaps-'+i,questions:[],topics:[],gaps:gaps.slice(i,i+8)});
  jobs.push({key:'cross-section',questions:[],topics:[],cross:true});
  const validate=(job,value)=>{
    if(!Array.isArray(value.questions)||!Array.isArray(value.technicalTopics)||!Array.isArray(value.findings))throw Error('复核分段缺少必要数组。');
    for(const q of job.questions)if(value.questions.filter(x=>x.questionId===q.id&&['answered','partial','missing'].includes(x.status)).length!==1)throw Error('复核未对问题 '+q.id+' 返回唯一决定。');
    for(const t of job.topics)if(value.technicalTopics.filter(x=>x.topicIndex===t.index&&['deep','shallow'].includes(x.status)).length!==1)throw Error('复核未对技术主题 '+t.index+' 返回唯一决定。');
    if(job.gaps&&(!Array.isArray(value.gapDecisions)||job.gaps.some(gap=>value.gapDecisions.filter(x=>x.id===gap.id&&['not_used','conflict_unused','conditional_inference','used_unverified','insufficient_information'].includes(x.status)).length!==1)))throw Error('缺口复核必须逐项返回唯一决定。');
    if(value.findings.some(x=>!['blocking','warning'].includes(x.severity)||typeof x.message!=='string'))throw Error('复核发现缺少有效严重性或说明。');
  };
  for(const job of jobs)if(checkpoint.batches[job.key])try{validate(job,checkpoint.batches[job.key]);}catch{delete checkpoint.batches[job.key];}
  const active=new Set();
  const save=async()=>{checkpoint.progress={completed:jobs.filter(job=>checkpoint.batches[job.key]).length,total:jobs.length,active:[...active]};await persist(checkpoint.progress);};
  await save();
  await mapConcurrent(jobs,2,async job=>{
    if(checkpoint.batches[job.key])return;
    active.add(job.key);await save();
    try{
      const ids=new Set(job.questions.map(q=>q.id));
      const selected=job.cross||job.gaps?clean:{...clean,userQuestionAnswers:(clean.userQuestionAnswers||[]).filter(a=>ids.has(a.questionId)),questionAnswers:(clean.questionAnswers||[]).filter(a=>ids.has(a.questionId)),technologyDeepDives:job.topics.map(t=>t.route)};
      const value=await model([{role:'system',content:'独立复核研发报告，不能仅因篇幅或引用数量而通过。只允许已核验证据支持具体型号事实；工程推断须标明前提。逐项对照未核验事实，即使正文改写了措辞，只要仍以确定事实使用就必须标blocking；不得仅凭引用编号或字面不一致放行。检查错误型号、地区或部件混淆、成本与售价混淆、错误公式、无依据的结论及未回答的问题。只返回JSON：questions:[{questionId,status:answered/partial/missing,reason}], technicalTopics:[{topicIndex,status:deep/shallow,reason}], findings:[{severity:blocking/warning,message}], revisionTargets:[段落标识]；不涉及的数组返回[]。'},
        {role:'user',content:JSON.stringify({contract,questions:job.questions,topicIndexes:job.topics.map(t=>t.index),report:selected,evidence:job.gaps?undefined:evidence,gaps:job.gaps?.map(({id,kind,product,metric,text,reason})=>({id,kind,product,metric,text,reason})),crossSection:!!job.cross})+'\n逐个检查给定问题和主题；跨章节模式逐条对照用户的原始问题及其中每个具体技术方向，检查全文摘要、答案、章节和建议是否覆盖且相互一致；任何指定方向如果缺少实际技术分析而只有范围说明，必须标为blocking。缺口批次必须另外返回 gapDecisions:[{id,status,reason}]，逐项判断：not_used 未用于正文，conflict_unused 冲突未用于确定结论，conditional_inference 已明确前提且没有声称该型号采用，used_unverified 被用作无依据的确定结论，insufficient_information 无法判断。即使措辞不同也要判断语义；不能确定时用 insufficient_information。缺少拆解可以给出明确边界的工程推断，不应虚构产品实现。'}],{stage:'答案与工程适用性复核 '+job.key,arrays:['questions','technicalTopics','findings'],maxTokens:3500,timeoutMs:120000,reasoning:'low',thinkingPhase:'review',validate:value=>validate(job,value)});
      validate(job,value);checkpoint.batches[job.key]=value;await save();
    }finally{active.delete(job.key);await save();}
  });
  const values=jobs.map(job=>checkpoint.batches[job.key]);
  const questions=allQuestions.map(q=>values.flatMap(v=>v.questions).find(v=>v.questionId===q.id)||{questionId:q.id,status:'missing',reason:'未返回审查结果'});
  const technicalTopics=routes.map((_,index)=>values.flatMap(v=>v.technicalTopics).find(v=>v.topicIndex===index)||{topicIndex:index,status:'shallow',reason:'未返回主题深度审查'});
  const findings=values.flatMap(v=>v.findings),revisionTargets=[...new Set(values.flatMap(v=>Array.isArray(v.revisionTargets)?v.revisionTargets:[]).filter(x=>typeof x==='string'))];
  const gapDecisions=values.flatMap(v=>Array.isArray(v.gapDecisions)?v.gapDecisions:[]);
  return {status:questions.every(q=>q.status==='answered')&&technicalTopics.every(t=>t.status==='deep')&&!findings.some(f=>f.severity!=='warning')&&gaps.every(g=>gapDecisions.some(d=>d.id===g.id&&['not_used','conflict_unused','conditional_inference'].includes(d.status)))?'passed':'needs_review',questions,technicalTopics,findings,gapDecisions,revisionTargets,checkedAt:new Date().toISOString()};
}
