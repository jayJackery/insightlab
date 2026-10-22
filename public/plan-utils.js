import {metricLabels} from './metric-labels.js?v=8e1e00bb1d41da9f';
import {cleanProductLabel} from './product-identity.js?v=8e1e00bb1d41da9f';
import {resolveReportDepth,REPORT_LENGTHS} from './report-depth.js?v=8e1e00bb1d41da9f';
import {researchInput} from './baseline-context.js?v=8e1e00bb1d41da9f';
const fields = {
  queries: ["query", "searchQuery", "search_query", "searchTerms", "search_terms", "keywords", "keyword", "q", "text"],
  questions: ["question", "questionText", "question_text", "text", "description"],
  competitors: ["name", "productName", "product_name", "product", "competitor", "company", "brand", "text"],
  criteria: ["metric", "name", "indicator", "label", "text"],
  assumptions: ["assumption", "text", "description", "statement"],
  sourceStrategy: ["strategy", "text", "description", "source", "type"],
};
export const corruptText = /\[object(?:,\s*|\s+)Object\]|^\s*(?:undefined|null)\s*$/i;

// Model output is untrusted structured data. Never use String(object) for a plan field.
export function planText(value, field, depth = 0) {
  if (depth > 4) return "";
  if (typeof value === "string") {
    const text = (field==='competitors'?cleanProductLabel(value):value).replace(/\s+/gu, " ").trim();
    return corruptText.test(text) ? "" : text;
  }
  if (Array.isArray(value)) return value.map((item) => planText(item, field, depth + 1)).filter(Boolean).join(field === "queries" ? " " : "、");
  if (!value || typeof value !== "object") return "";
  for (const key of fields[field] || ["text", "name", "description"]) {
    if (value[key] == null) continue;
    const text = planText(value[key], field, depth + 1);
    if (text) return text;
  }
  return "";
}

export function planList(values, field, limit = 12) {
  const entries = Array.isArray(values) ? values : typeof values === "string" ? values.split(/\r?\n/) : [];
  const found = new Set();
  return entries.map((item) => planText(item, field)).filter((text) => {
    if (!text || found.has(text.toLocaleLowerCase())) return false;
    found.add(text.toLocaleLowerCase()); return true;
  }).slice(0, limit);
}

export function validateQueries(values, limit = 10) {
  if (!Array.isArray(values) || !values.length) throw new Error("研究计划至少需要一条有效检索词。");
  for (const item of values) {
    const query = planText(item, "queries");
    if (!query) throw new Error("检索词存在空值、无法识别的对象或 [object Object]，请重新制定计划或修正检索词。");
    if (Array.from(query).length > 128) throw new Error("单条检索词不能超过128个字符，请拆分为具体问题。");
  }
  return planList(values, "queries", limit);
}

export function hasInvalidQueries(plan) {
  try { validateQueries(plan?.queries); return false; } catch { return true; }
}

const short = (text, length) => Array.from(text || "").slice(0, length).join("");
export function fallbackQueries(input) {
  const subject = short(planText(input.subject, "queries"), 75);
  const names = [planText(input.baselineProduct, "competitors"), ...String(input.competitors || "").split(/[、，,；;\n]/u)]
    .map((name) => name.replace(/[（(](?:必填|候选|已确认)[）)].*$/u, "").trim()).filter(Boolean);
  return planList([
    ...names.slice(0, 4).map((name) => short(name, 85) + " official specifications user manual battery"),
    subject + " 技术路线 结构 原理",
    subject + " 拆解 实测",
    subject + " 论文 专利 安全标准",
  ], "queries", 10).filter((query) => query.length && Array.from(query).length <= 128);
}

export function normalizePlan(raw, input = {}, { defaults = false } = {}) {
  const plan = {};
  plan.reportLength=Object.hasOwn(REPORT_LENGTHS,raw?.reportLength)?raw.reportLength:input.reportLength||'auto';
  plan.delivery=resolveReportDepth({...input,reportLength:plan.reportLength});
  for(const key of ['comparisonScope','competitorSelection','comparisonInput'])if(raw?.[key]&&typeof raw[key]==='object'&&!Array.isArray(raw[key]))plan[key]=structuredClone(raw[key]);
  plan.analysisFocus=['auto','technical','product','balanced'].includes(raw?.analysisFocus)?raw.analysisFocus:['auto','technical','product','balanced'].includes(input.analysisFocus)?input.analysisFocus:'auto';
  for (const field of Object.keys(fields)) plan[field] = planList(raw?.[field], field, field === "queries" ? 10 : 12);
  plan.queries = plan.queries.filter((query) => Array.from(query).length <= 128);
  if (defaults && !plan.queries.length) plan.queries = fallbackQueries(input);
  const requested = typeof input.metrics === "string" ? input.metrics.split(/[，,、;；\n]+/u) : [];
  const allCriteria=planList([...requested,...plan.criteria], "criteria",24);
  plan.criteria=metricLabels(allCriteria).slice(0,16);
  plan.sourceStrategy=planList([...plan.sourceStrategy,...allCriteria.filter(value=>!plan.criteria.includes(value))],"sourceStrategy",24);
  const baseline = planText(researchInput(input,plan).baselineProduct, "competitors");
  if(plan.competitorSelection?.requested&&baseline!==planText(input.baselineProduct,'competitors'))plan.competitors=plan.competitors.filter(name=>!(/自家产品|基准/u.test(name)&&cleanProductLabel(name)===cleanProductLabel(input.baselineProduct)));
  if (baseline) plan.competitors = [baseline + "（自家产品·对比基准）", ...plan.competitors.filter((name) => !name.includes(baseline))].slice(0, 12);
  if (defaults && !plan.sourceStrategy.length) plan.sourceStrategy = ["厂商官方规格与用户手册", "论文、专利及标准", "专业拆解与实测资料"];
  return plan;
}
