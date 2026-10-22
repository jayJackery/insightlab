import {knownCatalogMetrics,redundantCatalogQuery,excludeKnownSpecGaps} from '../../domain/research/catalog-policy.js';
import { fallbackQueries, validateQueries } from "../../../public/plan-utils.js";
import { deduplicateSources } from "../../infrastructure/search/search.js";
import { engineeringQueries } from "../../domain/research/engineering-policy.js";
import {enrichSource,independentDocumentCount} from '../../domain/evidence/source-document.js';
import {resolveResearchFocus} from '../../../public/research-focus.js';
import {mapConcurrent} from './concurrency.js';

const sourceTypes = new Set(["official", "standard", "paper", "patent", "media", "curated", "other"]);
const primaryTypes = new Set(["official", "standard", "paper", "patent"]);
const typeWeight = { official: 5, standard: 4, paper: 4, patent: 3, curated: 3, media: 2, other: 1 };
const meta = (source, reason) => ({ title: source.title, url: source.url, queries: source.queries || [], reason });

export function selectEvidenceSources(ranked, queries, limit = 30,technicalShare=0.4) {
  const selected = new Set(ranked.filter(source=>source.provider==='team_catalog'&&source.catalogRecord).slice(0,limit));
  for (const query of queries) {
    const source = ranked.find((item) => !selected.has(item) && item.queries?.includes(query));
    if (source&&selected.size<limit) selected.add(source);
    if (selected.size === limit) break;
  }
  const technicalTarget = Math.ceil(Math.min(limit, ranked.length) * technicalShare);
  for (const source of ranked.filter((source) => source.engineeringRelevant)) {
    if ([...selected].filter((source) => source.engineeringRelevant).length >= technicalTarget || selected.size >= limit) break;
    selected.add(source);
  }
  for (const source of ranked) { if (selected.size === limit) break; selected.add(source); }
  return ranked.filter((source) => selected.has(source));
}

function obviousMismatch(source, input) {
  const content = source.content || "";
  if (content.trim().length < 30) return "缺少可用于研究的正文或摘要";
  const subject = [input.subject, input.baselineProduct, input.competitors].filter(Boolean).join(" ");
  const result = [source.title, source.snippet, content.slice(0, 1500)].join(" ");
  if (!/JavaScript|TypeScript|编程|前端|对象|序列化/i.test(subject) && /\[object(?:,\s*|\s+)Object\]/i.test(result) && /JavaScript|Firefox|Sololearn|wtfjs|object.?object/i.test(result)) {
    const anchor = /便携储能|户外电源|电池包|portable power station|battery pack|jackery|ecoflow|anker/i;
    if (!anchor.test(result)) return "对象打印问题页面，与本次研究主题无关";
  }
  return "";
}

export async function inspectSources(candidates, input, review) {
  const rejected = [], toReview = [],catalog=[];
  for (const source of candidates) {
    if(source.provider==='team_catalog'&&source.catalogRecord){catalog.push({...source,relevance:'direct',sourceType:'curated',engineeringRelevant:false,relevanceReason:'准确型号已由规格库匹配，整理值保留并待官网复核。'});continue;}
    const reason = obviousMismatch(source, input);
    if (reason) rejected.push(meta(source, reason));
    else toReview.push({ ...source, candidateId: "C" + (toReview.length + 1) });
  }
  if (!toReview.length) return { accepted: catalog, rejected };
  const decisions = new Map();
  // Bound review context so later product queries do not get dropped by a token limit.
  for (let offset = 0; offset < toReview.length; offset += 24) {
    const reviewed = await review(toReview.slice(offset, offset + 24), input);
    if (!Array.isArray(reviewed?.decisions)) throw new Error("来源相关性审查未返回有效结果，已停止撰写报告。请重试资料检索阶段。");
    for (const item of reviewed.decisions) if (item && typeof item.id === "string") decisions.set(item.id, item);
  }
  const accepted = [...catalog];
  for (const source of toReview) {
    const decision = decisions.get(source.candidateId);
    if (!decision || !["direct", "context"].includes(decision.relevance)) {
      rejected.push(meta(source, typeof decision?.reason === "string" ? decision.reason : "未通过来源相关性审查")); continue;
    }
    const { candidateId, ...page } = source;
    accepted.push({ ...page, relevance: decision.relevance, engineeringRelevant: page.provider !== "team_catalog" && decision.engineeringRelevant === true, sourceType: page.provider === "team_catalog" ? "curated" : sourceTypes.has(decision.sourceType) ? decision.sourceType : "other", relevanceReason: typeof decision.reason === "string" ? decision.reason : "" });
  }
  accepted.sort((a, b) => (Number(b.relevance === "direct") - Number(a.relevance === "direct")) * 100 + ((typeWeight[b.sourceType] || 0) - (typeWeight[a.sourceType] || 0)) * 10 + ((b.providerScore || 0) - (a.providerScore || 0)));
  return { accepted, rejected };
}

// Search and source review finish before the evidence/report models see any material.
// Engineering coverage can trigger two targeted rounds, at most four queries each.
export async function executeSearchPlan({ input, plan, search, review, assessCoverage, lookupSpecs, fetchOfficial, onProgress = () => {}, now = () => new Date().toISOString() }) {
  const focus=plan.researchPolicy?.focus || resolveResearchFocus({...input,analysisFocus:plan.analysisFocus ?? input.analysisFocus});
  const initial = validateQueries(plan.queries);
  let candidates = [], inspected = { accepted: [], rejected: [] };
  const queryRuns = [], warnings = [], searchRounds = [];
  let repairRounds = 0;
  let coverageReview = null, specCatalog = null,officialLookups=[];
  const progress = (currentQuery = "", status = "searching") => onProgress({
    queryRuns: queryRuns.map((item) => ({ ...item })),
    searchProgress: { currentQuery, currentQueries:queryRuns.filter(item=>item.status==='running').map(item=>item.query), concurrency:3, completedQueries: queryRuns.filter((item) => item.status==='completed').length, totalQueries: queryRuns.length, sourceCount: status === "searching" ? candidates.length : inspected.accepted.length, independentDocumentCount:independentDocumentCount(inspected.accepted),candidateSourceCount: candidates.length },
    searchQuality: { status, candidateCount: candidates.length, acceptedCount: inspected.accepted.length, rejectedCount: inspected.rejected.length, repairRounds },
    rejectedSources: inspected.rejected,
    coverageReview, specCatalog,
    officialLookups,
  });
  const runBatch = async (queries, kind) => {
    queries = validateQueries(queries);
    const batch = queries.map((query) => ({ query, status: "pending", kind, round: repairRounds }));
    queryRuns.push(...batch);
    const beforeBatch=candidates.slice(),resultsByQuery=new Array(batch.length);
    await mapConcurrent(batch,3,async(item,index)=>{
      if(redundantCatalogQuery(item.query,knownCatalogMetrics(beforeBatch,input,plan))){item.status="completed";item.skipped=true;item.reason="准确型号/地区的请求字段已在规格库收录，直接复用，不重复官网检索";item.resultCount=0;await progress(item.reason);return;}
      item.status = "running";item.startedAt=now();await progress(item.query);
      try {
        const results = await search(item.query, input);
        if (!Array.isArray(results)) throw new Error("搜索服务没有返回结果数组");
        item.resultCount = results.length;
        resultsByQuery[index]=results;
        // Completion order must not decide which sources survive the limit.
        candidates = deduplicateSources([...beforeBatch,...resultsByQuery.flat()]).slice(0,132);
        item.status = "completed";
      } catch (error) { item.status = "failed"; item.error = error.message; warnings.push(item.query + "：" + error.message); }
      item.completedAt=now();await progress(item.query);
    });
    await progress("正在核对来源与研究问题的相关性", "reviewing");
    inspected = await inspectSources(candidates, input, review);
    searchRounds.push({ round: repairRounds, kind, queries, sourceCount: inspected.accepted.length, candidateCount: candidates.length, completedAt: now() });
    await progress("来源相关性检查已完成", "reviewing");
  };
  if(lookupSpecs){
    await progress('先匹配部门规格库中的基准和竞品型号','reviewing');
    try{const lookup=await lookupSpecs(input,plan);const {sources:catalogSources=[],...details}=lookup;specCatalog=details;candidates=deduplicateSources(catalogSources);if(lookup.warning)warnings.push(lookup.warning);if(fetchOfficial&&plan.verifyCatalog===true){await progress('沿规格库的官网链接核对原始资料','reviewing');const fetched=await fetchOfficial(catalogSources,{onProgress:async checks=>{officialLookups=checks;await progress('官网链接读取 '+checks.length+' 项','reviewing');}});officialLookups=fetched.checks;candidates=deduplicateSources([...candidates,...fetched.sources]);}}
    catch(error){specCatalog={status:'unavailable',reason:error.message};warnings.push(error.message);}
  }
  await runBatch(initial, "planned");
  const needsMore = () => independentDocumentCount(inspected.accepted) < 2 || !inspected.accepted.some((s) => s.relevance === "direct") || !inspected.accepted.some((s) => primaryTypes.has(s.sourceType));
  const checkCoverage = async () => {
    if (assessCoverage && inspected.accepted.length) {
      await progress("检查研究问题、技术实现细节与规格参数的证据覆盖", "reviewing");
      coverageReview = excludeKnownSpecGaps(await assessCoverage(selectEvidenceSources(inspected.accepted, queryRuns.map((run) => run.query), 36,focus.queryShare), input, plan),knownCatalogMetrics(inspected.accepted,input,plan));
      if (independentDocumentCount(inspected.accepted.filter((source) => source.engineeringRelevant)) < focus.minimumEngineeringDocuments) {
        coverageReview.technicalGaps = [...new Set([...(coverageReview.technicalGaps || []), '当前侧重需要至少'+focus.minimumEngineeringDocuments+'份原理/实现技术来源，需定向补查'] )];
      }
    }
  };
  await checkCoverage();
  if (lookupSpecs && (!specCatalog || specCatalog.status==='unavailable')) {
    await progress("正在部门规格库补查缺失参数", "reviewing");
    let lookup;
    try { lookup = await lookupSpecs(input, plan); }
    catch (error) { specCatalog = { status: "unavailable", reason: error.message }; warnings.push(error.message); }
    if (lookup) {
      const { sources: catalogSources = [], ...details } = lookup;
      specCatalog = details;
      if (lookup.warning) warnings.push(lookup.warning);
      candidates = deduplicateSources([...candidates, ...catalogSources]);
      inspected = await inspectSources(candidates, input, review);
      await checkCoverage();
    }
  }
  const maximumRounds = assessCoverage ? 2 : 1;
  for (let round = 1; round <= maximumRounds; round++) {
    if (!needsMore() && !coverageReview?.technicalGaps?.length && !coverageReview?.questions?.some((q) => q.status !== "answered")) break;
    const used = new Set(queryRuns.map((item) => item.query.toLowerCase()));
    const repairQueries = [...(coverageReview?.followupQueries || []), ...(focus.minimumTopics?engineeringQueries(input,plan):[]), ...fallbackQueries(input)].filter((query) => !used.has(query.toLowerCase())).filter((query, index, all) => all.indexOf(query) === index).slice(0, 4);
    if (!repairQueries.length) break;
    repairRounds = round; await runBatch(repairQueries, coverageReview?.technicalGaps?.length ? "technical_followup" : "automatic_followup");
    await checkCoverage();
  }
  const sources = selectEvidenceSources(inspected.accepted, queryRuns.map((run) => run.query),30,focus.queryShare).map((source, i) => ({ ...enrichSource(source),id: "S" + (i + 1), retrievedAt: source.retrievedAt || now() }));
  const directCount = sources.filter((source) => source.relevance === "direct").length;
  const primaryCount = sources.filter((source) => primaryTypes.has(source.sourceType)).length;
  const independentCount=independentDocumentCount(sources);
  const status = sources.length < 2 || independentCount < 2 || directCount === 0 ? "blocked" : primaryCount === 0 ? "limited" : "passed";
  const reason = status === "blocked" ? "检索结果不足：经过相关性审查和自动补查，仅保留" + sources.length + "条来源、" + independentCount + "份独立文档，其中" + directCount + "条直接相关。已停止报告生成，请调整检索词或检查搜索服务。" : status === "limited" ? "本轮未取得官方、论文、专利或标准等一手资料；产品规格和技术结论仍需核验。" : "已过滤无关结果；背景资料仅用于原理说明，不能证明具体产品参数。";
  if (status === "limited") warnings.push(reason);
  if (coverageReview?.technicalGaps?.length) warnings.push("补查后仍有技术证据缺口：" + coverageReview.technicalGaps.join("；") + "。报告必须说明已确认内容、工程推演与待验证项。");
  return {
    sources, rejectedSources: inspected.rejected, queryRuns, searchRounds, searchWarnings: warnings, coverageReview, specCatalog,officialLookups,
    searchQuality: { status, reason, candidateCount: candidates.length, relevantCount: inspected.accepted.length, acceptedCount: sources.length,independentDocumentCount:independentDocumentCount(sources), rejectedCount: inspected.rejected.length, directCount, primaryCount, repairRounds, checkedAt: now() },
    searchProgress: { currentQuery: status === "blocked" ? "可用来源不足，已停止" : "检索与相关性检查已完成", completedQueries: queryRuns.filter((item)=>item.status==='completed').length, totalQueries: queryRuns.length, sourceCount: sources.length,independentDocumentCount:independentDocumentCount(sources), candidateSourceCount: candidates.length },
  };
}

// Historical records remain intact; the UI can flag known broken queries immediately.
export function verifiedQuotes(entries, sources) {
  const index = new Map(sources.map((source) => [source.id, source]));
  const compact = (text) => String(text || '').replace(/\s+/gu, "").trim();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const source = index.get(entry?.sourceId);
    return source?.contentKind === "page_content" && typeof entry.quote === "string" && entry.quote.trim() && (compact(source.content).includes(compact(entry.quote))||(source.document?.blocks || []).some((block)=>compact(block.text).includes(compact(entry.quote))));
  }).map((entry) => {
    const source=index.get(entry.sourceId),quote=entry.quote.slice(0,1200);
    return {sourceId:entry.sourceId,quote,documentId:source.document?.documentId,contentHash:source.document?.contentHash,locations:(source.document?.blocks || []).filter((block)=>compact(block.text).includes(compact(quote))).map((block)=>({blockId:block.id,line:block.line,kind:block.kind,heading:block.heading}))};
  });
}
