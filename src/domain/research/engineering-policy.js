import {knownCatalogMetrics,catalogHas,redundantCatalogQuery} from './catalog-policy.js?v=7860f20d981283d9';
import { planList, validateQueries } from "../../../public/plan-utils.js?v=7860f20d981283d9";
import {resolveResearchFocus,focusDescription} from '../../../public/research-focus.js?v=7860f20d981283d9';
import {parseProductName} from '../evidence/product-registry.js?v=7860f20d981283d9';

const engineeringTerms = /原理|架构|电路|拓扑|控制|接口|工艺|拆解|热路径|失效|验证|schematic|architecture|topology|teardown|thermal|application note|failure|control loop/i;
const short = (text, n) => Array.from(text || "").slice(0, n).join("");
export function engineeringQueries(input,plan={}) {
  const battery = /储能|电池|电源|\bpack\b|power station|battery/i.test(input.subject || "");
  const subject = short(input.subject, 48);
  const models=planList([input.baselineProduct,...(plan.competitors || []),...String(input.competitors || '').split(/[、，,；;\n]/u)],'competitors',6).map(name=>parseProductName(name)).filter(product=>product.exact).map(product=>short(product.display,65)+' teardown architecture implementation technical manual');
  return [...models,...(battery ? [
    "portable power station battery pack BMS inverter architecture block diagram application note",
    "便携储能 电池包 成组 串并联 连接工艺 铜排 接触电阻 拆解",
    "site:ti.com TIDA-010208 battery pack BMS schematic design guide",
    "portable power station thermal design heat path derating teardown technical analysis",
    "便携储能 pack 绝缘 熔断 隔热 泄压 故障模式 验证 专利",
    "site:ti.com PMP41134 bidirectional SR-DAB power station design guide schematic",
  ] : ["工作原理 因果机制 技术论文", "系统架构 模块接口 数据流 技术手册", "核心实现 控制算法 工程应用笔记", "关键工艺 设计参数 实现细节", "设计权衡 失效模式 可靠性分析", "验证方法 测试条件 技术实测"].map((topic) => subject + " " + topic))];
}
export function applyEngineeringPolicy(plan, input, {catalogSources=[]}={}) {
  const known=knownCatalogMetrics(catalogSources,input,plan);
  const focus=resolveResearchFocus({...input,analysisFocus:plan.analysisFocus ?? input.analysisFocus});
  const delivery=plan.delivery||focus.delivery;
  if(delivery?.route==='answer')return {...plan,queries:validateQueries(plan.queries),researchPolicy:{version:7,catalogPolicy:'reuse_known_fields',focus,delivery,technicalQueries:[],technicalQueryShare:0},sourceStrategy:[...(plan.sourceStrategy||[]),'精准问答：只搜索原问题，不扩展行业、竞品或工程主题。']};
  const proposed = planList(plan.queries, "queries", 10).filter(query=>!redundantCatalogQuery(query,known));
  const technical = proposed.filter((query) => engineeringTerms.test(query));
  const total=delivery?.queryLimit||10,target=Math.ceil(total*focus.queryShare);
  const selected = planList([...technical, ...engineeringQueries(input,plan)], "queries", target);
  const products=[input.baselineProduct,...(plan.competitors || [])].filter(Boolean);
  const productQueries=products.map(name=>short(name.replace(/[（(].*$/u,''),65)+' use cases load compatibility application review');
  const rest=planList([...proposed.filter(query=>!engineeringTerms.test(query)&&!(/specifications|datasheet|规格|price|warranty/i.test(query)&&known.some(m=>query.toLowerCase().replace(/\s/g,'').includes(m.product.toLowerCase().replace(/\s/g,''))))),...productQueries], 'queries',10);
  const exactQueries=products.map(name=>parseProductName(name)).filter(product=>product.exact).flatMap(product=>{const missing=plan.criteria.filter(metric=>!catalogHas(known,product.display,metric));return missing.length?[short(product.display,65)+' '+short(missing.join(' '),40)+' specifications']:[];}).slice(0,5);
  const queries = validateQueries([...new Set([...exactQueries,...selected,...rest])].slice(0,total));
  const actualTechnical=queries.filter(query=>engineeringTerms.test(query));
  return { ...plan, queries, researchPolicy: { version: 6, catalogPolicy:"reuse_known_fields",catalogKnown:known.map(({product,metric,value,unit,region,catalogVerifiedDate})=>({product,metric,value,unit,region,catalogVerifiedDate})),focus, technicalQueries:actualTechnical,technicalQueryShare:actualTechnical.length/queries.length },
    sourceStrategy: [...(plan.sourceStrategy || []),focusDescription(focus),'先匹配部门规格库；准确型号/地区的已收录字段直接引用整理值和日期，不重复查官网；仅补查缺失、真实冲突和用户要求的技术依据。','技术主题对应准确厂商/型号，分别记录已证实采用、待验证设计选项与未知；不能用通用参考设计替代竞品证据。'] };
}
function text(value) {
  if (typeof value === "string") return value.replace(/\b[SCQ]\d+\b/g, "").replace(/https?:\/\/\S+/g, "").replace(/[\s\p{P}\p{S}]/gu, "");
  if (Array.isArray(value)) return value.map(text).join("");
  if (!value || typeof value !== "object") return "";
  return ["lead", "text", "answer", "implication", "points", "principle", "architecture", "implementation", "tradeoffs", "validation","productMappings","summary","comparisonImplication"].map((key) => text(value[key])).join("");
}
export function contentBalance(report,focus=report.analysisFocus) {
  const routes = report.technologyDeepDives || report.technologyOverview;
  const technicalCharacters = text(routes).length;
  const otherCharacters = text([report.executiveSummary, report.userQuestionAnswers || report.questionAnswers || report.keyFindings, report.productApplications, report.baselineImplications, report.trends, report.opportunitiesAndRisks, report.recommendations, report.competitorAnalysis]).length;
  const share = technicalCharacters / Math.max(1, technicalCharacters + otherCharacters);
  const enforced=focus?.enforceShare===true,range=focus?.targetRange;
  return { technicalCharacters, otherCharacters, technicalShare: share,mode:focus?.mode || 'historical',label:focus?.label || '沿用生成时需求',enforced,target:focus?.technicalTarget,targetRange:range,passed:!enforced || (Array.isArray(range)&&share>=range[0]&&share<=range[1]),
    definition: "技术章节正文 ÷ 主报告叙述正文（不计来源、指标矩阵、方法及边界附录）" };
}
