import {digest} from './source-document.js?v=8e1e00bb1d41da9f';
import {metricLabels} from '../../../public/metric-labels.js?v=8e1e00bb1d41da9f';
const safeUrl=value=>{try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const text=value=>typeof value==='string'?value:'';
function actionFor(subject,reason){
 const value=subject+' '+reason;
 if(/寿命|循环|cycles|70%|80%/i.test(value))return '找到该准确型号、同地区的循环测试条件：循环次数、剩余容量阈值（70%或80%）、温度、充放电倍率和放电深度。条件一致前不按次数排寿命优劣。';
 if(/价格|质保|保修|渠道/.test(value))return '打开对应型号的同地区销售页/保修条款，记录日期、币种、含税与否、裸机或套装、售卖渠道、保修年限及注册条件。不要用另一地区或促销渠道消除冲突。';
 if(/UPS|切换|医疗/i.test(value))return '查对应型号手册的切换时间及负载限制，记录测试模式；如用于敏感设备，取得设备端允许中断时间，并在目标负载实测，不能由10ms或20ms直接断言适用。';
 if(/充电|快充|SOC|温度/.test(value))return '核对充电起止SOC、AC/光伏模式、输入功率、温度及App开关条件。统一0–100%或相同SOC窗口后再比较时长；功率值不能代替充电时间。';
 if(/扩展|扩容/.test(value))return '在准确代际型号的手册中确认扩展电池接口、兼容电池及最大总容量；确认是整机原生能力，不能沿用同系列其他型号的扩展能力。';
 if(/IP\d|三防|防护|防水/.test(value))return '找到准确型号的防护声明/测试报告，确认等级属于整机还是电池包，及端口盖闭合、插线和运行状态；不能从部件等级外推整机防水。';
 if(/专利|认证|证书|标准合规|UL2743|62619|38\.3/.test(value))return '取得对应厂商/准确型号的专利公开号或认证证书、报告编号与适用范围，核对申请人、结构权利要求、产品/部件及版本。仅标准名称或品牌宣传不能证明该型号采用或认证通过。';
 if(/PACK|pack|拓扑|电芯|BMS|维护|热管理|架构|结构|串并联/.test(value))return '寻找准确型号拆解照片、连接/采样图、电芯标识或维修手册；核对串并联、连接工艺、BMS/热路径及可拆接口。通用论文仅作原理，不能证明竞品已采用；缺样件时保留为设计假设。';
 if(/容量|功率|重量|峰值/.test(value))return '核对准确型号、代际、地区和裸机/套装；分别确认标称/可用容量、额定连续/峰值功率及峰值持续时间、整机净重。已有同口径规格库值无需重复查官网，实际冲突才需补证。';
 if(/优先|改进|排序|代价|收益/.test(value))return '补充目标场景、约束与对应样机/实验依据，分别列技术收益、成本/重量代价和验证条件；将补资料工作与产品改进排序分开，不能把共同特性当我方差距。';
 return '针对下面所列的具体不足，补充对应准确型号与工况的原始资料或实验记录；给出可定位摘录及适用条件。资料仍不足时，收窄该结论而非补猜测值。';
}
// Read projection only: never rewrites the historical report or promotes its quality.
export function reviewDiagnostics(task){
 const {report={},research={},evidence={}}=task,sources=research.sources||[],items=[],seen=new Set();
 const add=({subject,statement,reason,sourceIds=[],target=null})=>{
  if(!reason||seen.has([subject,reason].join('|')))return;seen.add([subject,reason].join('|'));
  const links=[...new Set(sourceIds)].map(id=>sources.find(s=>s.id===id)).filter(Boolean).flatMap(s=>[{id:s.id,title:s.displayTitle||s.title,url:safeUrl(s.url)},...(s.officialUrl?[{id:s.id+'-official',title:'该型号官网 / 手册入口',url:safeUrl(s.officialUrl)}]:[])]).filter(s=>s.url);
  items.push({id:'R'+digest([subject,reason,target?.join('.')||''].join('|')).slice(0,12),subject,statement:statement||'本轮未形成可直接用于决策的结论。',reason,action:actionFor(subject,reason),sources:links,target});
 };
 for(const [index,answer] of (report.userQuestionAnswers||[]).entries()){
  const audit=report.answerAudit?.questions?.find(q=>q.questionId===answer.questionId);
  if(answer.kind!=='证据支持'||audit&&audit.status!=='answered')add({subject:answer.questionId+' · '+(answer.question||'原始问题'),statement:answer.text,reason:audit?.reason||'该答案只得到部分证据支持。',sourceIds:answer.citations,target:['userQuestionAnswers',index,'text']});
 }
 for(const check of evidence.audit?.checks||[])if(check.status!=='supported')add({subject:[check.product,check.metric||'事实核验'].filter(Boolean).join(' · '),statement:check.text||check.claim,reason:check.reason||'原始证据尚不足以支持此项。',sourceIds:[...(check.sourceIds||[]),...(check.support||[]).map(s=>s.sourceId)]});
 for(const row of evidence.competitorRows||[])for(const metric of row.metricValues||[]){
  if(!metricLabels([metric.metric]).length)continue;
  if(['conflict','not_comparable','not_found','not_disclosed'].includes(metric.status)||metric.verification?.status==='needs_review'&&metric.status!=='curated')add({subject:row.competitor+' · '+metric.metric,statement:metric.value?String(metric.value)+(metric.unit?' '+metric.unit:''):'该项本轮没有可比值',reason:metric.verification?.reason||metric.note||'缺少同口径参数。',sourceIds:metric.sourceIds});
 }
 for(const [index,route] of (report.technologyDeepDives||[]).entries()){
  const audit=report.answerAudit?.technicalTopics?.find(t=>t.topicIndex===index);
  if(audit&&audit.status!=='deep')add({subject:'技术主题 · '+route.heading,statement:route.lead||route.designProblem,reason:audit.reason,sourceIds:route.sourceIds,target:route.lead?['technologyDeepDives',index,'lead']:null});
 }
 for(const finding of report.answerAudit?.findings||[])add({subject:finding.severity==='blocking'?'结论使用限制':'分析需补充',statement:finding.message,reason:finding.message,sourceIds:[...(text(finding.message).match(/\bS\d+\b/g)||[])]});
 if(!items.length&&task.quality?.publishable===false)add({subject:'报告验收记录',statement:'报告保留原版本，不代表已按当前规则验收。',reason:'尚无可自动定位的具体复核记录。应用结论前请逐项确认关键答案与原文，或创建新研究完成当前规则审查。'});
 return items;
}
// The user should resolve a few consequential decisions, not the model's entire audit log.
export function reviewChecklist(task){
 const report=task.report||{},compact=value=>String(value||'').replace(/[\s\p{P}\p{S}]/gu,''),body=compact(JSON.stringify({executiveSummary:report.executiveSummary,userQuestionAnswers:report.userQuestionAnswers,questionAnswers:report.questionAnswers,productApplications:report.productApplications,technologyDeepDives:report.technologyDeepDives,recommendations:report.recommendations}));
 // Rejected extraction candidates are process diagnostics, not statements the user must verify.
 const all=reviewDiagnostics(task).filter(item=>item.subject!=='事实核验'||compact(item.statement).length>20&&body.includes(compact(item.statement))),chosen=[];
 all.sort((a,b)=>Number(b.subject==='结论使用限制')-Number(a.subject==='结论使用限制')||Number(/分析需补充/.test(b.subject))-Number(/分析需补充/.test(a.subject)));
 const rules=[
  {title:'扩容结论：接口扩展不等于电池扩容',match:/SDC.*(?:扩容电池|能力未确认)|扩容.*SDC/,statement:'涉及“本档产品均无扩展”的判断，尤其是DJI Power 1000的SDC / SDC Lite接口。',reason:'接口存在不能直接证明支持扩容电池；未确认，也不等于不支持。',action:'若扩容影响选型，只需确认DJI Power 1000是否明确支持指定扩容电池。SDC接口存在不能证明电池可扩容；未确认前，也不能把未知写成不支持。'},
  {title:'快充差距：确认比较模式一致',match:/充电时间比较混用|混用终点和模式|标准.*慢于.*快充/,action:'只需确认影响快充优劣判断的同型号测试：同一SOC起止、标准/应急模式、温度及App条件。条件不一致时保留条件式判断，不做速度排名。'},
  {title:'峰值功率：统一定义后再判断带载能力',match:/峰值定义跨厂不一致|峰值功率.*(?:未列|量化差距)|峰值.*不能省略/,statement:'涉及用峰值功率判断电机等负载的启动能力。',reason:'厂商的峰值持续时长和增强模式定义不同，不能仅比较瓦数。',action:'只有目标负载需要启动冲击功率时，核对准确型号的峰值、持续时长和负载类型；额定连续功率与X-Boost不可代替峰值，不同持续时长不直接排名。'},
  {title:'循环寿命：不要混用次数和终止阈值',match:/循环寿命数值冲突|4000次.*无来源支持|两者均标注4000/,action:'仅在按寿命决定选型时，核对对应型号的循环次数、剩余容量阈值及工况。70%与80%终点不同，暂不排寿命优劣。'},
  {title:'技术采用：区分产品证据与通用推演',match:/标题暗示有pack级实证|参考设计冒充|电芯承载.*(?:错误|不成立|矛盾)/,action:'通用机理与条件式设计建议可直接阅读。只有要据此认定某具体型号采用了PACK/BMS结构时，才需补该准确型号的拆解、结构图或手册证据。'},
  {title:'价格与质保：只在采购决策前确认',match:/整机保修5年|价格与质保.*(?:冲突|未完成)/,statement:'涉及价格高低、质保长短及采购推荐。',reason:'现有记录涉及不同地区、渠道和注册条件，不能直接当作同口径采购依据。',action:'如用于采购或商业比较，确认目标地区、同日期裸机价与质保注册条件；技术原理分析无需为此重新核验全部规格。'},
 ];
 for(const rule of rules){const item=all.find(x=>!chosen.some(c=>c.id===x.id)&&rule.match.test(x.reason));if(!item)continue;const reason=rule.reason||(item.reason.length>160?item.reason.slice(0,159)+'…':item.reason);const statement=rule.statement||(item.statement.length>180?item.statement.slice(0,179)+'…':item.statement);chosen.push({...item,subject:rule.title,originalSubject:item.subject,statement,reason,action:rule.action});}
 // For other subject areas retain only explicit dangerous or contradictory conclusions.
 if(!chosen.length)for(const item of all.filter(x=>/错误归因|不成立|直接冲突|危险|安全风险|型号错配|mismatch/i.test(x.reason))){if(chosen.length>=5)break;chosen.push({...item,reason:item.reason.slice(0,240),statement:item.statement.slice(0,280)});}
 return chosen.slice(0,5).map(item=>{
  if(!item.sources.length){
   const matcher=/快充/.test(item.subject)?/charge_time|充电/:/扩容/.test(item.subject)?/expand|扩展/:/峰值/.test(item.subject)?/power_surge|峰值/:/寿命/.test(item.subject)?/cycle|寿命/:/价格|质保/.test(item.subject)?/price|warranty|价格|质保/:/BMS|电芯|安全/;
   const mentioned=(task.research?.productRegistry||[]).filter(p=>p.exact&&compact(item.statement+' '+item.reason).includes(compact(p.display)));
   const rows=(task.evidence?.competitorRows||[]).filter(row=>!mentioned.length||mentioned.some(p=>compact(row.competitor).includes(compact(p.display))));
   const ids=new Set(rows.flatMap(row=>(row.metricValues||[]).filter(m=>matcher.test(m.metricId||m.metric)).flatMap(m=>m.sourceIds||[])));
   item.sources=(task.research?.sources||[]).filter(s=>ids.has(s.id)&&safeUrl(s.url)).sort((a,b)=>Number(b.sourceType==='official')-Number(a.sourceType==='official')).slice(0,3).flatMap(s=>[{id:s.id,title:s.displayTitle||s.title,url:safeUrl(s.url)},...(s.officialUrl&&safeUrl(s.officialUrl)?[{id:s.id+'-official',title:'对应型号官网 / 手册入口',url:safeUrl(s.officialUrl)}]:[])]);
  }
  return {...item,sources:item.sources.slice(0,3)};
 });
}
export function editableReportTargets(report){
 const targets=[];
 const names={executiveSummary:'核心结论',userQuestionAnswers:'原始问题答案',questionAnswers:'研究问题答案',keyFindings:'关键发现',productApplications:'产品与应用',baselineImplications:'对自家产品的启示',recommendations:'建议与优先级',technologyDeepDives:'技术方案与路线',trends:'趋势',opportunitiesAndRisks:'机会与风险'};
 function walk(value,path,label){if(typeof value==='string'&&value.trim()&&!['sourceIds','citations','evidence','questionId','productId','kind','basis','implementationBasis','formula'].includes(String(path.at(-1)))){targets.push({id:path.join('.'),path,label:label+' · '+(value.length>48?value.slice(0,48)+'…':value),text:value});return;}if(Array.isArray(value)){value.forEach((v,i)=>{if(!['citations','sourceIds','evidence','relatedQuestionIds'].includes(String(path.at(-1))))walk(v,[...path,i],label+' '+(i+1));});return;}if(value&&typeof value==='object')for(const key of ['text','lead','summary','implication','points','principle','architecture','implementation','tradeoffs','validation'])if(value[key]!=null)walk(value[key],[...path,key],label);}
 for(const [key,label] of Object.entries(names))if(report?.[key]!=null)walk(report[key],[key],label);
 return targets;
}
