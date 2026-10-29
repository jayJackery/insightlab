import { validateQueries } from "../../../public/plan-utils.js?v=2c9b2e1b97170f03";
import {enrichSource,canonicalSourceUrl} from '../../domain/evidence/source-document.js?v=2c9b2e1b97170f03';
import {createRequestGate} from '../request-gate.js?v=2c9b2e1b97170f03';
const searchGate=createRequestGate(3);

const text = (value) => typeof value === "string" ? value.trim() : "";
const finite = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
export function normalizeResult(result, provider, query) {
  if (!result || typeof result !== "object") return null;
  let url;
  try { url = new URL(text(result.url)); if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null; } catch { return null; }
  const full = text(result.raw_content) || text(result.content);
  const summary = text(result.summary) || text(result.snippet);
  return enrichSource({
    title: text(result.title) || url.hostname, url: url.href,
    content: full || summary, contentKind: full ? (provider === "tavily" && !result.raw_content ? "search_excerpt" : "page_content") : "search_summary",
    snippet: text(result.snippet) || text(result.content) || summary,
    publishedAt: text(result.date) || text(result.published_date) || null,
    siteName: text(result.site_name) || url.hostname,
    provider, providerScore: finite(result.rerank_score ?? result.score), authority: finite(result.authority), queries: [query],
  });
}

export async function searchWeb(query, input = {}, { env = {}, fetchImpl = fetch, beforeRequest=()=>{} } = {}) {
  const [safeQuery] = validateQueries([query]);
  const provider = env.SEARCH_PROVIDER || (env.DEEPSEEK_API_KEY ? "deepseek" : "tavily");
  if (!["deepseek", "tavily"].includes(provider)) throw new Error("不支持的 SEARCH_PROVIDER；请使用 deepseek 或 tavily。");
  const key = provider === "deepseek" ? env.DEEPSEEK_API_KEY : env.TAVILY_API_KEY;
  if (!key) throw new Error("未配置 " + (provider === "deepseek" ? "DEEPSEEK_API_KEY" : "TAVILY_API_KEY") + "，请在后端启动终端配置搜索密钥。");
  const intent = Array.from([text(input.subject), text(input.questions)].filter(Boolean).join(" ")).slice(0, 128).join("");
  const payload = provider === "deepseek"
    ? { query: safeQuery, count: 6, need_content: true, ...(intent ? { ori_question: intent } : {}) }
    : { query: safeQuery, topic: "general", search_depth: "advanced", max_results: 6, include_raw_content: "markdown", include_published_date: true };
  let response,result;
  for(let attempt=0;attempt<2;attempt++) {
  ({response,result}=await searchGate.run(async()=>{
  await beforeRequest();
  const response = await fetchImpl(provider === "deepseek" ? "https://api.deepseek.com/v1/tools/search" : "https://api.tavily.com/search", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(60000),
  });
  const result = await response.json().catch(() => ({}));
  if(response.status===429){const delay=searchGate.rateLimited(response.headers.get('retry-after'));if(delay>30000)throw Error('搜索服务限流，已降为串行，请稍后从检查点重试。');}
  return {response,result};
  }));
  if(response.status!==429)break;
  }
  if (!response.ok) throw new Error(provider + " 搜索返回 " + response.status + "：" + (text(result.error?.message) || text(result.detail) || text(result.detail?.error) || "请求失败"));
  if (!Array.isArray(result.results)) throw new Error(provider + " 搜索响应缺少 results 数组，未继续生成报告。");
  return result.results.map((item) => normalizeResult(item, provider, safeQuery)).filter(Boolean);
}

export function canonicalUrl(value) {
  return canonicalSourceUrl(value);
}

export function deduplicateSources(sources) {
  const found = new Map();
  for (const original of sources) {
    let source,key; try { source=enrichSource(original); key=(source.document.documentId.startsWith('url:')?canonicalUrl(source.url):source.document.documentId+'::'+source.document.revision) + (source.catalogProductId ? "::" + source.catalogProductId : ""); } catch { continue; }
    const previous = found.get(key);
    const variant={url:source.url,contentHash:source.document.contentHash,snapshotRef:source.document.snapshotRef,revision:source.document.revision};
    if (!previous) { found.set(key, { ...source, variants:source.variants || [variant], queries: [...(source.queries || [])] }); continue; }
    const richer = (source.content || "").length > (previous.content || "").length ? source : previous;
    const variants=[...(previous.variants || []),...(source.variants || [variant])].filter((item,index,all)=>all.findIndex((other)=>other.url===item.url&&other.contentHash===item.contentHash)===index);
    found.set(key, { ...richer,...(previous.id?{id:previous.id}:{}),variants,queries: [...new Set([...(previous.queries || []), ...(source.queries || [])])] });
  }
  return [...found.values()];
}
