import {randomUUID} from '../../browser/shims/crypto.js?v=983914e21674fb3e';
import {reviewChecklist,editableReportTargets} from '../../domain/evidence/review-checklist.js?v=983914e21674fb3e';
// No model calls. User statements remain unverified and cannot pass publication.
export function createReviewRevision(task,request,{repository,ownTask,userId}){
 if(!task.report||!['completed','needs_review','failed'].includes(task.status))throw Error('请等待研究结束后再提交复核结果。');
 const item=reviewChecklist(task).find(item=>item.id===request.itemId);if(!item)throw Error('复核项已变化，请刷新后重新选择。');
 const target=editableReportTargets(task.report).find(target=>target.id===request.targetId);if(!target)throw Error('请选择报告中需要修订的具体段落。');
 const required=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(label+'须填写且不能超过'+max+'字。');return value.trim();};
 const revisedText=required(request.revisedText,'修订文字',12000),quote=required(request.quote,'原文摘录或实测记录',6000),note=required(request.note,'复核说明',3000);
 let sourceUrl;try{const u=new URL(request.sourceUrl);if(!/^https?:$/.test(u.protocol)||u.username||u.password)throw Error();sourceUrl=u.href;}catch{throw Error('请填写可打开的HTTP/HTTPS资料链接；无需上传文件或密钥。');}
 const report=structuredClone(task.report),research=structuredClone(task.research||{}),evidence=structuredClone(task.evidence||{}),now=new Date().toISOString();
 let node=report;for(const key of target.path.slice(0,-1))node=node[key];node[target.path.at(-1)]=revisedText;
 if(target.path[0]==='userQuestionAnswers'||target.path[0]==='questionAnswers'||target.path[0]==='keyFindings'){
  const answer=report[target.path[0]][target.path[1]];answer.kind='用户复核 · 待独立核验';answer.citations=[];answer.evidence=[];
  for(const key of ['userQuestionAnswers','questionAnswers','keyFindings'])if(key!==target.path[0])for(const linked of report[key]||[])if(linked.questionId&&linked.questionId===answer.questionId){linked[target.path.at(-1)]=revisedText;linked.kind=answer.kind;linked.citations=[];linked.evidence=[];}
 }
 report.manualRevisions=[...(report.manualRevisions||[]),{itemId:item.id,subject:item.subject,targetId:target.id,label:target.label,before:target.text,after:revisedText,sourceUrl,quote,note,createdAt:now,status:'user_supplied_unverified'}];
 report.answerAudit={...(report.answerAudit||{}),status:'needs_review',staleAfterUserRevision:true,findings:[...(report.answerAudit?.findings||[]),{severity:'blocking',message:'报告包含用户提交的复核修订，尚未经独立审查。不得沿用原文的通过记录。'}]};
 report.generatedAt=now;delete report.quality;
 research.reviewRevision={parentTaskId:task.id,createdAt:now,itemId:item.id,targetId:target.id};
 const id=randomUUID();repository.createTask({id,title:task.title.replace(/ · 复核修订$/u,'')+' · 复核修订',input:task.input,status:'needs_review',research,createdAt:now});ownTask(id,userId);
 repository.update(id,{evidence,report,phaseIndex:4,phaseStatus:'needs_review',error:'用户复核修订已保存；原报告保留，修订文字尚未独立核验。'});return {id};
}
