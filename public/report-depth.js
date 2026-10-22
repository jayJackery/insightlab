export const REPORT_LENGTHS={concise:'简洁',medium:'中等',rich:'丰富',auto:'Auto'};
const split=value=>String(value||'').split(/[；;？?\n]+/u).map(item=>item.trim()).filter(Boolean);
export function resolveReportDepth(input={}){
  const requested=Object.hasOwn(REPORT_LENGTHS,input.reportLength)?input.reportLength:'auto';
  const text=[input.subject,input.questions,input.metrics].filter(Boolean).join('；'),questions=split(input.questions||input.subject);
  const broad=/系统性|全面|行业现状|行业趋势|市场潜力|研究报告|调研报告|竞品分析|技术路线|技术洞察|架构.*实现|原理.*架构|机会.*风险|痛点.*解决|综合分析/iu.test(text);
  const comparison=/竞品|对比|相比|差距|横比|选型|比较/iu.test(text)||Boolean(input.competitors?.trim());
  const simple=questions.length<=2&&text.length<220&&!broad&&!comparison&&!/技术.{0,15}[%％]/u.test(text);
  const level=requested==='auto'?(simple?'concise':broad&&questions.length>=2||text.length>450?'rich':'medium'):requested;
  const route=level==='concise'&&simple?'answer':'research';
  const profiles={
    concise:{queryLimit:route==='answer'?2:3,maxSources:route==='answer'?6:10,searchRounds:1,queriesPerFollowup:1,repairRounds:1,repairQueries:1,reportTokens:route==='answer'?2800:4500,topicCharacters:300,minimumDocuments:1,characters:'约200–600字，按原问题直接回答'},
    medium:{queryLimit:5,maxSources:16,searchRounds:1,queriesPerFollowup:2,repairRounds:1,repairQueries:2,reportTokens:6500,topicCharacters:450,minimumDocuments:2,characters:'约1200–2500字，突出关键分析'},
    rich:{queryLimit:10,maxSources:30,searchRounds:2,queriesPerFollowup:4,repairRounds:2,repairQueries:6,reportTokens:10000,topicCharacters:650,minimumDocuments:2,characters:'完整研究，按问题展开，不重复凑篇幅'},
  };
  return {version:1,requested,level,label:REPORT_LENGTHS[level],route,...profiles[level],autoStart:route==='answer',reason:requested==='auto'?(simple?'问题集中且明确，采用精准检索后直接回答':level==='rich'?'涉及多个系统性研究问题，采用完整调研':'需要归纳分析，采用适中研究范围'):'按你选择的'+REPORT_LENGTHS[level]+'篇幅执行'+(route==='answer'?'精准问答':'研究流程')};
}
export function focusForDelivery(profile,delivery){
  if(delivery.route==='answer')return {...profile,minimumTopics:0,maximumTopics:0,minimumEngineeringDocuments:0,topicCharacters:0,delivery};
  if(delivery.level==='rich')return {...profile,delivery};
  const maximum=delivery.level==='concise'?1:2,minimum=profile.minimumTopics?Math.min(profile.minimumTopics,maximum):0;
  return {...profile,minimumTopics:minimum,maximumTopics:Math.min(profile.maximumTopics,maximum),minimumEngineeringDocuments:Math.min(profile.minimumEngineeringDocuments,delivery.level==='concise'?1:2),topicCharacters:delivery.topicCharacters,delivery};
}
export function focusedQueries(input,criteria=[]){
  const question=[input.subject,input.questions].filter(Boolean).join(' ').replace(/\s+/gu,' ').trim();
  const prefix=input.baselineProduct?input.baselineProduct+' ':'';
  const first=(prefix+question).slice(0,105);
  const second=(prefix+(criteria.length?criteria.join(' '):question.slice(0,65))+' official documentation technical specification').slice(0,125);
  return [...new Set([first,second])].filter(Boolean);
}
export function focusedCriteria(input){
  const text=[input.subject,input.questions,input.metrics].join(' '),map=[[/容量|capacity|\bWh\b/i,'电池容量'],[/额定|连续功率|rated|continuous/i,'持续功率'],[/重量|weight/i,'重量'],[/质保|保修|warranty/i,'质保'],[/充电.*(?:时间|多久)|充满|charging time/i,'充电时间'],[/防护|IP\d/i,'防护等级'],[/电芯|化学|chemistry/i,'电芯体系']];
  return [...new Set([...String(input.metrics||'').split(/[、，,；;]/u),...map.filter(([pattern])=>pattern.test(text)).map(([,label])=>label)])].filter(Boolean);
}
