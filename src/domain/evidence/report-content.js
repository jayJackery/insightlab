import { planList } from "../../../public/plan-utils.js?v=69935587b51cd156";
import {selectDocumentContext} from './source-document.js?v=69935587b51cd156';
import {parseProductName,sameProduct} from './product-registry.js?v=69935587b51cd156';
import {scopeObservations} from './comparison-scope.js?v=69935587b51cd156';

const unknown=(value)=>!value || /^(?:unknown|未注明|未知)$/i.test(String(value));
function comparableValue(metric) {
 const unit=String(metric.unit || '').toLowerCase().trim();
 const conversions={wh:['energy',1],kwh:['energy',1000],kg:['mass',1],g:['mass',0.001],w:['power',1],kw:['power',1000],cycles:['cycles',1],'次':['cycles',1],h:['time',1],'小时':['time',1],min:['time',1/60],'分钟':['time',1/60]};
 const number=Number(String(metric.value).replace(/[,\s]/g,''));
 if(Number.isFinite(number)&&conversions[unit])return conversions[unit][0]+':'+Number((number*conversions[unit][1]).toPrecision(12));
 return String(metric.value).normalize('NFKC').replace(/[,\s]/g,'').toLowerCase()+':'+unit;
}
function scopeConflicts(left,right) {
 return ['product','region','configuration','component','measureBasis','condition'].filter((field)=>{
   if(unknown(left[field])||unknown(right[field]))return false;
   if(field==='product')return !sameProduct(left[field],right[field]);
   if(field==='condition') {
     const percentages=(value)=>(String(value).match(/\d+(?:\.\d+)?\s*%/g) || []).map((v)=>v.replace(/\s/g,'')).join(',');
     // Free-text descriptions differing alone do not prove conflicting test conditions.
     return percentages(left[field])&&percentages(right[field])&&percentages(left[field])!==percentages(right[field]);
   }
   return left[field]!==right[field];
 });
}
const scopeCompleteness=(metric)=>['product','region','configuration','component','measureBasis','condition'].filter((key)=>!unknown(metric[key])).length;

export function mergeEvidence(batches,comparisonScope=null) {
  const result = { claims: [], competitorRows: [], conflicts: [], gaps: [] }, rows = new Map();
  for (const originalBatch of batches) {
    const batch=structuredClone(originalBatch);
    result.claims.push(...(batch.claims || [])); result.conflicts.push(...(batch.conflicts || [])); result.gaps.push(...(batch.gaps || []));
    for (const row of (Array.isArray(batch.competitorRows) ? batch.competitorRows : []).filter((row) => row && typeof row === "object")) {
      const product=parseProductName(row.competitor);
      const key = (product.brand || '')+':'+product.model; if (!product.model) continue;
      if (!rows.has(key)) rows.set(key, { ...row, metricValues: [], evidenceIds: [] });
      const target = rows.get(key);
      target.evidenceIds = [...new Set([...target.evidenceIds, ...(Array.isArray(row.evidenceIds) ? row.evidenceIds : [])])];
      for (const metric of (Array.isArray(row.metricValues) ? row.metricValues : []).filter((metric) => metric && typeof metric === "object")) {
        const existing = target.metricValues.find((item) => (item.metricId || item.metric) === (metric.metricId || metric.metric));
        if (!existing) target.metricValues.push({ ...metric, observations:[{...metric}] });
        else if (existing.status === "not_comparable") {
          existing.observations = [...(existing.observations || []),{...metric}];
          existing.sourceIds = [...new Set([...(existing.sourceIds || []),...(metric.sourceIds || [])])];
        }
        else if ((!['disclosed','curated'].includes(existing.status)&&['disclosed','curated'].includes(metric.status))||(existing.status==='curated'&&metric.status==='disclosed')) {
          const observations = [...(existing.observations || []),{...metric}];
          Object.assign(existing, metric, {observations});
        }
        else if (existing.status===metric.status && ['disclosed','curated'].includes(metric.status)) {
          existing.observations = [...(existing.observations || []),{...metric}];
          const scopeConflict=scopeConflicts(existing,metric).filter(field=>!(comparisonScope?.region==='all'&&field==='region'&&comparableValue(existing)===comparableValue(metric)));
          if (scopeConflict.length || comparableValue(existing)!==comparableValue(metric)) {
            const conflict = row.competitor + "的" + metric.metric + (scopeConflict.length?'口径不同（'+scopeConflict.join('、')+'）':'来源值不同')+"：" + existing.value + " " + (existing.unit || "") + " / " + metric.value + " " + (metric.unit || "");
            result.conflicts.push(conflict); existing.status = "not_comparable"; existing.note = conflict;
            existing.sourceIds=[...new Set([...(existing.sourceIds || []),...(metric.sourceIds || [])])];
          } else if(scopeCompleteness(metric)>scopeCompleteness(existing)) {
            const observations=existing.observations;Object.assign(existing,metric,{observations});
          }
          // Less specific matching observations stay in observations, not in the verified head's citations.
        }
        else existing.observations=[...(existing.observations||[]),{...metric}];
      }
    }
  }
  result.competitorRows = [...rows.values()];
  for(const row of result.competitorRows)for(const metric of row.metricValues)metric.catalogObservations=(metric.observations||[]).filter(item=>item.status==='curated');
  if(comparisonScope?.region==='all')result.comparisonScope=comparisonScope;
  if(comparisonScope&&comparisonScope.region!=='all') {
    const scopedConflicts=[];
    for(const row of result.competitorRows)for(let index=0;index<row.metricValues.length;index++) {
      const original=row.metricValues[index],{eligible,variants}=scopeObservations(original,row,comparisonScope);
      if(!eligible.length) {
        const knownElsewhere=(original.observations||[]).some(item=>['disclosed','curated','derived'].includes(item.status)&&String(item.value??'').trim());
        const missing=!knownElsewhere&&['not_found','not_disclosed'].includes(original.status);
        row.metricValues[index]={...original,status:missing?original.status:'not_comparable',note:missing?original.note:'本轮未找到符合'+comparisonScope.region+'裸机口径且主体一致的参数；其他地区/配置/主体观察值单列保存。',comparisonScope,scopeVariants:original.observations};
        continue;
      }
      const narrow=mergeEvidence(eligible.map((item)=>({competitorRows:[{competitor:row.competitor,metricValues:[item]}]})));
      const head=narrow.competitorRows[0].metricValues[0];
      row.metricValues[index]={...head,comparisonScope,scopeVariants:variants,observations:original.observations};
      scopedConflicts.push(...narrow.conflicts);
    }
    result.allScopeConflicts=result.conflicts;
    result.conflicts=[...batches.flatMap((batch)=>batch.conflicts || []),...scopedConflicts];
    result.comparisonScope=comparisonScope;
  }
  result.claims = result.claims.filter((item, i, all) => all.findIndex((other) => other.claim === item.claim) === i);
  for (const key of ["conflicts", "gaps"]) result[key] = [...new Set(result[key].filter((value) => typeof value === "string"))];
  return result;
}

export function normalizeCoverage(value, plan) {
  const questions = plan.questions || [];
  const entries = Array.isArray(value?.questions) ? value.questions : [];
  const technical = value?.technical || {};
  const gaps = planList(value?.technicalGaps, "questions", 8);
  const requiresTechnical=plan.researchPolicy?.focus?.minimumTopics !== 0;
  for (const [key, label] of [["principle", "工作原理"], ["implementation", "结构与实现步骤"], ["tradeoffs", "设计权衡与适用边界"], ["validation", "验证方法与失效模式"]]) {
    if (requiresTechnical && technical[key] !== true && !gaps.some((gap) => gap.includes(label))) gaps.push(label + "的证据仍不足");
  }
  return {
    questions: questions.map((question, i) => {
      const item = entries.find((entry) => entry?.questionId === "Q" + (i + 1));
      return { questionId: "Q" + (i + 1), question, status: ["answered", "partial", "missing"].includes(item?.status) ? item.status : "missing", missing: typeof item?.missing === "string" ? item.missing : "" };
    }),
    technicalGaps: requiresTechnical?[...new Set(gaps)]:[],
    missingSpecifications: (Array.isArray(value?.missingSpecifications) ? value.missingSpecifications : []).filter((item) => typeof item?.product === "string").map((item) => ({ product: item.product, metrics: planList(item.metrics, "criteria", 10) })),
    followupQueries: planList(value?.followupQueries, "queries", 8).filter((q) => Array.from(q).length <= 128),
  };
}

export function sourceContext(sources, plan, budget = 64000) {
  const keywords = [...new Intl.Segmenter("zh", { granularity: "word" }).segment((plan.questions || []).join(" "))].filter((x) => x.isWordLike && x.segment.length >= 2).map((x) => x.segment.toLowerCase());
  const allowance = Math.min(5000, Math.floor(budget / Math.max(1, sources.length)));
  return sources.map((source) => {
    const terms=[...new Set([...keywords,...(plan.competitors || []).flatMap((name)=>String(name).toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter((word)=>word.length>=3)])];
    const selected=selectDocumentContext(source,terms,allowance),excerpt=selected.content;
    return { id: source.id, title: source.title, url: source.url, publishedAt: source.publishedAt, relevance: source.relevance, sourceType: source.sourceType, contentKind: source.contentKind,
      officialUrl: source.officialUrl, catalogVerifiedDate: source.catalogVerifiedDate, documentId:selected.document.documentId,contentHash:selected.document.contentHash,parseStatus:selected.document.parseStatus,
      contentIsExcerpt:Boolean(source.fetchTruncated)||selected.blocks.length<selected.document.blocks.length||selected.blocks.some((block)=>block.truncated),
      tables:selected.blocks.filter((block)=>block.kind==='table').map(({id,header,rows,heading,ambiguous,line})=>({id,header,rows,heading,ambiguous,line})),
      omittedTables:selected.omittedTables,content:excerpt };
  });
}

export function normalizeQuestionAnswers(report, plan, validIds, prefix='Q') {
  const items = Array.isArray(report.questionAnswers) ? report.questionAnswers : [];
  return (plan.questions || []).map((question, index) => {
    const questionId = prefix + (index + 1), item = items.find((item) => item?.questionId === questionId);
    const citations = (Array.isArray(item?.citations) ? item.citations : []).filter((id) => validIds.has(id));
    return { questionId, question, text: typeof item?.answer === "string" && item.answer.trim() ? item.answer.trim() : "现有证据不足以回答这个问题，请查看技术章节中的已确认原理和待验证部分。",
      kind: !citations.length ? "证据不足" : ["证据支持", "部分支持", "证据不足"].includes(item?.status) ? item.status : "证据不足",
      citations, evidence: Array.isArray(item?.evidence) ? item.evidence : [],
      implication: typeof item?.implication === "string" ? item.implication : "" };
  });
}

export function reportLines(value) {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") return String(value).split(/\n+/).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(reportLines);
  return [value.heading || value.title || "", ...reportLines(value.lead), ...reportLines(value.points || value.text),
    ...[["principle", "工作原理"], ["architecture", "系统构成与接口"], ["implementation", "实现步骤"], ["tradeoffs", "设计取舍与适用条件"], ["validation", "验证方法与失效模式"], ["knownLimits", "证据边界与待验证项"]].flatMap(([key, label]) => value[key] ? [label, ...reportLines(value[key])] : []),
    ...(value.sourceIds?.length ? ["来源：" + value.sourceIds.join(", ")] : []),
    ...(value.table?.columns ? [value.table.columns.join(" | "), ...(value.table.rows || []).map((row) => row.join(" | "))] : [])].filter(Boolean);
}
