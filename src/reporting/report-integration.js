import {createHash} from '../browser/shims/crypto.js?v=7860f20d981283d9';
import {mapConcurrent} from '../application/research/concurrency.js?v=7860f20d981283d9';
import {reportPromptForFocus} from './report-prompt.js?v=7860f20d981283d9';
import {validateReportAnswers} from '../domain/research/report-validation.js?v=7860f20d981283d9';

const sectionGroups=[['executiveSummary','scopeAndMethod','methodNotes'],['baselineImplications','productApplications'],['trends','opportunitiesAndRisks','recommendations']];
const recoverable=new Set(['MODEL_TIMEOUT','MODEL_NETWORK','MODEL_STREAM_INCOMPLETE','MODEL_TRUNCATED','MODEL_JSON_INVALID','MODEL_SCHEMA_INVALID','MODEL_EMPTY']);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function integrateReportBatches({inputText,contract,plan,routes,evidence,sources,modelIdentity,research,persist,model}){
  const valid=new Set(sources.map(source=>source.id));
  const metadata=sources.map(({id,title,url,publishedAt,sourceType})=>({id,title,url,publishedAt,sourceType}));
  const signature=hash(['report-integration-v1',modelIdentity,contract,plan,routes,evidence,metadata]);
  if(research.reportIntegration?.signature!==signature)research.reportIntegration={version:1,signature,batches:{}};
  const state=research.reportIntegration;state.batches ||= {};
  const jobs=[];
  for(const [field,questions] of [['userQuestionAnswers',contract.userQuestions],['questionAnswers',contract.questions]]){
    const saved=Object.entries(state.batches).filter(([key])=>key.startsWith(field+'-')).map(([,batch])=>batch);
    for(let offset=0;offset<questions.length;offset++){
      const key=field+'-single-'+offset,question=questions[offset];
      if(!state.batches[key]){
        const answer=saved.flatMap(batch=>batch?.value?.answers||[]).find(item=>item.questionId===question.id);
        if(answer)state.batches[key]={value:{answers:[answer]},reused:true};
      }
      jobs.push({key,kind:'answers',field,questions:[question]});
    }
  }
  for(const [index,fields] of sectionGroups.entries()){
    if(index!==2){jobs.push({key:'sections-'+index,kind:'sections',fields});continue;}
    // The combined trends/risks/recommendations response has exceeded model
    // limits in real runs. Preserve any successful older grouped checkpoint.
    const old=state.batches['sections-2']?.value;
    for(const field of fields){
      const key='sections-2-'+field;
      if(!state.batches[key]&&Array.isArray(old?.[field]))state.batches[key]={value:{[field]:old[field]},reused:true};
      jobs.push({key,kind:'sections',fields:[field]});
    }
  }
  const validAnswer=(answer,question,field)=>answer?.questionId===question.id&&typeof answer.answer==='string'&&Boolean(answer.answer.trim())&&['证据支持','部分支持','证据不足'].includes(answer.status)&&Array.isArray(answer.citations)&&answer.citations.every(id=>valid.has(id))&&Array.isArray(answer.evidence)&&(field!=='userQuestionAnswers'||Array.isArray(answer.relatedQuestionIds)&&answer.relatedQuestionIds.length>0&&answer.relatedQuestionIds.every(id=>contract.questions.some(q=>q.id===id)));
  const validate=(job,value)=>{
    if(job.kind==='answers'){
      if(!Array.isArray(value.answers)||value.answers.length!==job.questions.length||job.questions.some(q=>value.answers.filter(a=>validAnswer(a,q,job.field)).length!==1))throw Error('分段必须逐一返回有效问题答案和引用。');
    }else for(const field of job.fields)if(field==='executiveSummary'?typeof value[field]!=='string'||!value[field].trim():!Array.isArray(value[field]))throw Error('报告分段缺少字段 '+field);
  };
  const active=new Set();
  const save=async()=>{state.progress={completed:jobs.filter(job=>state.batches[job.key]).length,total:jobs.length,reused:jobs.filter(job=>state.batches[job.key]?.reused).length,active:[...active]};research.currentActivity='报告整合 '+state.progress.completed+'/'+state.progress.total+' 段已保存'+(active.size?' · 正在处理 '+[...active].join('、'):'');await persist();};
  for(const job of jobs)if(state.batches[job.key]){try{validate(job,state.batches[job.key].value);state.batches[job.key].reused=true;}catch{delete state.batches[job.key];}}
  await save();
  await mapConcurrent(jobs,2,async job=>{
    if(state.batches[job.key])return;
    active.add(job.key);await save();
    try{
      const instruction=job.kind==='answers'?'只返回JSON对象 {"answers":[...]}，仅回答给定的问题，每项含questionId、answer、status、implication、citations、evidence；U答案还须有relatedQuestionIds。不得漏题或虚构事实。':'只返回JSON对象，且仅包含以下字段：'+job.fields.join('、')+'。executiveSummary是非空字符串，其他字段均为数组；不需要的章节返回空数组。';
      const payload={input:inputText,questions:job.questions||[],allResearchQuestions:contract.questions,confirmedPlan:plan,technicalRoutes:routes,evidence,sources:metadata};
      let value,feedback='';
      for(let attempt=0;attempt<2;attempt++){
        try{value=await model([{role:'system',content:reportPromptForFocus(contract.focus,contract.delivery)+'\n本次为分段任务，下面的限定优先：'+instruction+(feedback?'\n上次校验失败：'+feedback+'。请逐项修正并返回完整有效JSON。':'')},{role:'user',content:JSON.stringify(payload)}],{stage:'报告整合 '+job.key,maxTokens:4000,maxAttempts:1,timeoutMs:90000,validate:v=>validate(job,v)});validate(job,value);break;}
        catch(error){if(attempt||!recoverable.has(error.code))throw error;feedback=String(error.message||'输出格式错误').slice(0,300);research.currentActivity='报告整合 '+job.key+' 未完成，正在重试该段';await persist();}
      }
      state.batches[job.key]={value,reused:false,completedAt:new Date().toISOString()};await save();
    }finally{active.delete(job.key);await save();}
  });
  const report={userQuestionAnswers:[],questionAnswers:[]};
  for(const job of jobs){const value=state.batches[job.key].value;if(job.kind==='answers')report[job.field].push(...value.answers);else for(const field of job.fields)report[field]=value[field];}
  validateReportAnswers(report,contract,valid);return report;
}
