import { createHash } from "../browser/shims/crypto.js?v=69935587b51cd156";
import { contentBalance } from "../domain/research/engineering-policy.js?v=69935587b51cd156";
import { normalizeEngineeringRoute } from '../domain/research/engineering-detail.js?v=69935587b51cd156';
import {resolveResearchFocus,focusDescription} from '../../public/research-focus.js?v=69935587b51cd156';
import {VERIFIED_PRODUCT_ALIASES} from '../domain/evidence/product-registry.js?v=69935587b51cd156';
import {mapConcurrent,STAGE_CONCURRENCY} from '../application/research/concurrency.js?v=69935587b51cd156';

const groups = ["principle", "architecture", "implementation", "tradeoffs", "validation"];
// A numbered list of explicit technical directions is part of the user's
// contract. An extra scope chapter must not crowd out any of those directions.
export function explicitDirectionOutline(text,outline,plan,sourceIds,focus) {
  if(focus?.mode!=='technical')return outline;
  const labels=[...String(text||'').matchAll(/^\s*\d+[.、]\s*([^\n：:]{2,20})[：:]/gmu)].map(m=>m[1].trim());
  if(labels.length<2||labels.length>focus.maximumTopics||new Set(labels).size!==labels.length)return outline;
  return labels.map(label=>{
    const existing=outline.find(topic=>String(topic.heading||'').toLowerCase().includes(label.toLowerCase()));
    if(existing)return existing;
    const matching=plan.questions.map((q,i)=>String(q).toLowerCase().includes(label.toLowerCase())?'Q'+(i+1):null).filter(Boolean);
    return {heading:label+'：产品结构、工程取舍与验证',questionIds:matching.length?matching:plan.questions.map((_,i)=>'Q'+(i+1)),sourceIds:[...sourceIds]};
  });
}
// Authors see only passages that survived independent fact/identity review.
// The original sources are retained separately for deterministic quote checks.
export function approvedWritingSources(sources,evidence) {
  const supports=new Map();
  const collect=item=>{for(const quote of item?.verification?.support || [])if(quote?.sourceId&&quote?.quote){const list=supports.get(quote.sourceId)||[];list.push(quote.quote);supports.set(quote.sourceId,list);}};
  for(const claim of evidence.claims || [])if(claim.type==='公开事实'&&claim.verification?.status==='supported')collect(claim);
  for(const row of evidence.competitorRows || [])for(const metric of row.metricValues || [])if(metric.verification?.status==='supported')collect(metric);
  return sources.map(({id,title,url,sourceType,relevance,publishedAt})=>({id,title,url,sourceType,relevance,publishedAt,approvedPassages:[...new Set(supports.get(id)||[])]}));
}
export async function writeTechnicalRoutes({ inputText, plan, sources, evidence, research, persist, model }) {
  inputText+='\n规格边界：证据中status=curated的字段已由规格库收录，待官网复核，不是本轮没找到参数。技术原理/三防结构未明确时只写该细节未知，不抹掉已收录的容量、额定功率等。严格区分AC200L与AC200PL、代际及地区。当前同档范围与跨档参考：'+JSON.stringify(plan.competitorSelection||{});
  const focus=research.contract?.focus || resolveResearchFocus({analysisFocus:plan.analysisFocus});
  const products=(research.contract?.products || []).filter(product=>product.exact);
  const stableEvidence=structuredClone(evidence);
  if (stableEvidence.audit) delete stableEvidence.audit.checkedAt;
  const signature = createHash("sha256").update(JSON.stringify(['approved-writing-v2',focus,products,plan.questions, sources.map((s) => [s.id, s.url, s.content]), stableEvidence])).digest("hex");
  const writingSources=approvedWritingSources(sources,evidence);
  if (research.technicalCheckpoint?.signature !== signature) research.technicalCheckpoint = { signature, routes: [] };
  const checkpoint = research.technicalCheckpoint;
  const sourceIds = new Set(sources.map((s) => s.id));
  if(!checkpoint.outline&&(!focus.maximumTopics||(!focus.minimumTopics&&!sources.some(source=>source.engineeringRelevant))))checkpoint.outline=[];
  if (!checkpoint.outline) {
    const value = await model([
      { role: "system", content: '本次侧重：'+focusDescription(focus)+'依据来源规划'+focus.minimumTopics+'至'+focus.maximumTopics+'个相互独立、直接回应问题的技术主题。产品侧重且无相关技术证据可返回空routes。有已确认基准时对准基准和竞品准确型号的技术差异；未设置或未确认基准时围绕原问题的原理、架构、实现与已识别产品展开，不要求补填，不编相对基准差距，不写脱离产品的百科综述；通用原理明确为参考。覆盖工作原理、系统架构、实现、取舍和验证。仅返回JSON：routes:[{heading,questionIds:[Q1等],sourceIds:[给定来源ID]}]。只拟目录，不写正文，不能声称未知产品已采用。' },
      { role: "user", content: inputText + "\n研究问题：" + JSON.stringify(plan.questions.map((question,i) => ({questionId:"Q"+(i+1),question}))) + "\n证据：" + JSON.stringify(evidence) + "\n来源和已核验摘录：" + JSON.stringify(writingSources) },
    ], { stage: "技术章节规划", arrays: ["routes"], maxTokens: 3000 });
    checkpoint.outline = value.routes.filter((route) => typeof route?.heading === "string" && Array.isArray(route.questionIds) && route.questionIds.length && route.questionIds.every((id)=>plan.questions[Number(String(id).slice(1))-1] && /^Q\d+$/.test(id)) && Array.isArray(route.sourceIds) && route.sourceIds.some((id) => sourceIds.has(id))).slice(0,focus.maximumTopics);
    if (checkpoint.outline.length < focus.minimumTopics) throw Error('当前分析侧重需要至少'+focus.minimumTopics+'个有依据的技术主题，现有证据不足。');
    persist();
  }
  const explicit=explicitDirectionOutline(research.contract?.originalQuestions,checkpoint.outline,plan,sourceIds,focus);
  if(JSON.stringify(explicit)!==JSON.stringify(checkpoint.outline)){
    const old=checkpoint.outline,oldRoutes=checkpoint.routes||[];
    checkpoint.outline=explicit;
    checkpoint.routes=explicit.map(topic=>{const index=old.findIndex(previous=>JSON.stringify(previous)===JSON.stringify(topic));return index<0?null:oldRoutes[index]||null;});
    persist();
  }
  const write = async (topic, index, minimumCharacters = focus.topicCharacters,reviewFeedback='') => {
    const selected = writingSources.filter((source) => topic.sourceIds.includes(source.id));
    const relevant = selected.length ? selected : writingSources;
    let failure = '';
    for (let attempt=0;attempt<2;attempt++) {
    const value = await model([
      { role: "system", content: "你撰写一个研发技术主题的完整工程详解。正文目标" + minimumCharacters + "至" + (minimumCharacters+300) + "个中文字，信息密度优先，不能重复句凑长度。必须讲清因果机理与能量/信号/热/力的路径、组成部件和接口、制造或控制实现步骤、设计参数的约束、故障模式和验证实验。原理和架构各2至3点，实现3至5个有顺序的步骤，权衡与验证各2至3点，每点" + (focus.mode==="product"?"20至50":"50至100") + "字。数值、器件型号和产品已采用的做法必须有给定来源；通用原理、专利方案与具体产品事实分别写，缺电路图或拆解时禁止猜元件、尺寸及拓扑。若提出工程推演，应明确待验证。每点附来源ID，可加粗关键术语。只返回JSON对象：heading,questionIds,lead,principle:[原理],architecture:[架构与接口],implementation:[步骤],tradeoffs:[收益代价条件],validation:[测什么如何测通过条件的来源及故障模式],implementationBasis:documented或engineering_proposal,knownLimits:[待验证边界],sourceIds:[给定来源ID]。证据不足写出准确缺口，不虚构补齐。" },
      { role: "user", content: inputText + "\n只展开这个主题：" + JSON.stringify(topic) + "\n研究问题：" + JSON.stringify(plan.questions) + "\n结构化证据：" + JSON.stringify(evidence) + "\n来源和已核验摘录：" + JSON.stringify(relevant) + '\n另外必须返回designProblem（本主题解决的具体研发问题）、systemPath（用→描述部件、接口及能量/信号/热/力流，写明是参考原理路径还是产品已证实路径）、designDecisions:[{condition:场景和约束,benefit:收益及机理,cost:代价与故障风险,decision:条件式选型建议及来源}]至少2项、validationPlan:[{failureMode:故障模式,conditions:激励/工况/对照组,measurement:观测量及测法,criterion:通过判据或待项目定义,basis:判据的来源ID及适用范围，未知则明确待定义}]至少2项。tradeoffs和validation由这两张表生成，无需重复写。不要把通用测试条目当产品认证结论。无依据的数值、测试阈值、具体控制算法禁止编造。' + (failure?'\n上次结构问题，逐项修正：'+failure:'') },
    ].map((message,index)=>index===1?{...message,content:message.content+'\n分析侧重：'+focusDescription(focus)+'\n基准状态：'+JSON.stringify({baselineProduct:research.contract?.baselineProduct,requestedBaseline:research.contract?.requestedBaseline,status:research.contract?.baselineResolution})+'\n无已确认基准时comparisonImplication写该方案对目标场景的意义，不编相对自家差距。\n准确产品实体：'+JSON.stringify(products)+'\n官方基础型号别名（不合并地区/批次）：'+JSON.stringify(VERIFIED_PRODUCT_ALIASES)+'\n必须返回productMappings数组，每个给定准确产品一项：{productId:给定ID,adoptionStatus:documented/proposal/unknown,summary:该型号采用何种方案或本轮未找到什么,comparisonImplication:相对基准的差异与影响,sourceIds:[来源ID],evidence:[{sourceId,quote:逐字原文}]}。documented只可用已核验的该型号事实，并提供逐字摘录；参考设计与专利只能写proposal，未知写unknown，不能用同品牌别的型号代替。正文每个架构/实现要点明确厂商型号或标明通用参考，不能只在最后挂型号。产品侧重时每点20至50字、仅保留能解释产品差异的技术，避免技术章节挤占产品内容。\n严格边界：产品CTB宣传不证明电芯承载；拆解能分离不证明用户可维修；扩展口不证明热插拔或并联协议。三款同为LFP不证明安全寿命差异主要来自BMS/热管理。Wh/kg只能引用证据表内status=derived且附formula的确定性结果，不自行估算。减重机理需拆分质量预算，没有各项质量就写待测量，不编占比。验证阈值无原文或项目规范时写待定义。'+(reviewFeedback?'\n独立复核要求重写：'+reviewFeedback:'')}:message), { stage: "技术详解 " + (index+1) + " " + topic.heading, arrays: ["principle","architecture","implementation","designDecisions","validationPlan", "productMappings","sourceIds", "knownLimits"], maxTokens: 6500,reasoning:'low' });
    try { return normalizeEngineeringRoute(value,topic,sourceIds,{products,sources}); }
    catch(error) { failure=error.message; }
    }
    throw Error(failure+'；其他主题检查点已保留。');
  };
  const activeTopics=new Map();
  const saveActivity=()=>{checkpoint.activeTopics=[...activeTopics].map(([index,heading])=>({index,heading}));checkpoint.concurrency=STAGE_CONCURRENCY.technicalWriting;research.currentActivity='技术详解 '+checkpoint.routes.filter(Boolean).length+'/'+checkpoint.outline.length+' 章已保存'+(activeTopics.size?' · 正在展开：'+[...activeTopics.values()].join(' / '):'');persist();};
  // Outline, evidence and product registry are frozen before independent writers start.
  await mapConcurrent(checkpoint.outline.map((topic,index)=>({topic,index})),STAGE_CONCURRENCY.technicalWriting,async({topic,index})=>{
    if(checkpoint.routes[index])return;
    activeTopics.set(index,topic.heading);saveActivity();
    try {checkpoint.routes[index]=await write(topic,index);}
    finally {activeTopics.delete(index);saveActivity();}
  });
  return { routes: checkpoint.routes, async reviseTopics(audit) {
    const topics=(audit.technicalTopics || []).filter((topic)=>topic.status==='shallow').slice(0,2);
    await mapConcurrent(topics,2,async(topic)=>{
      const index=topic.topicIndex;
      if(!checkpoint.outline[index])return;
      research.currentActivity='按独立复核深化技术主题 '+(index+1);persist();
      const revised=await write(checkpoint.outline[index],index,focus.topicCharacters,topic.reason+'；'+(audit.findings || []).map((item)=>item.message).join('；'));
      checkpoint.routes[index]=revised;persist();
    });
  },async ensureBalance(report) {
    // Never pad technical prose to reach a global percentage. Only an explicit user ratio is a gate.
    return contentBalance(report,focus);
  } };
}
