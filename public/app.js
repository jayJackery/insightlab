import {renderApiUsage} from './api-usage.js?v=0d401f7edfb044fc';
import {selectResearchFindings} from './finding-presentation.js?v=0d401f7edfb044fc';
import {visibleComparisonRows} from './comparison-visibility.js?v=0d401f7edfb044fc';
import {metricLabels} from './metric-labels.js?v=0d401f7edfb044fc';
import {renderReviewChecklist,setupReportReview} from './report-review.js?v=0d401f7edfb044fc';
import {renderProductComparison,setupProductComparison} from './product-comparison.js?v=0d401f7edfb044fc';
import { normalizePlan, validateQueries, hasInvalidQueries } from "./plan-utils.js?v=0d401f7edfb044fc";

import {resolveResearchFocus,focusDescription} from './research-focus.js?v=0d401f7edfb044fc';
import {openExportDialog} from './export-dialog.js?v=0d401f7edfb044fc';
import {highlightSegments,topicProductReferences} from './product-highlights.js?v=0d401f7edfb044fc';
import {setupAccess,openTaskSharing} from './access.js?v=0d401f7edfb044fc';
import {renderWaitingRoom,mountWaitingRoom,setWaitingRoomConnection,setWaitingRoomVisible,stopWaitingRoom} from './waiting-room.js?v=0d401f7edfb044fc';
import {setupComparisonBrief,renderComparisonControls,readComparisonControls,setupComparisonActions} from './comparison-controls.js?v=0d401f7edfb044fc';
import {renderCatalogStatus} from './catalog-status.js?v=0d401f7edfb044fc';
import {renderTaskAction,updateTaskFeedback,setTaskFeedbackConnection,clearTaskFeedback} from './task-feedback.js?v=0d401f7edfb044fc';
import {qualifyProductMentions} from './product-labels.js?v=0d401f7edfb044fc';
import {setupDepthControls} from './depth-controls.js?v=0d401f7edfb044fc';
import {modelFailureHelp,renderModelDiagnostics} from './model-diagnostics.js?v=0d401f7edfb044fc';
setupDepthControls();
const $ = (selector) => document.querySelector(selector);
const state = { tasks: [], current: null, poll: null };
let sessionEpoch=0;
const phaseNames = ["需求拆解", "资料检索", "证据整理", "对比分析", "报告生成"];

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}
function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 3000);
}
async function api(path, options = {}) {
  const epoch=sessionEpoch;
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  if(epoch!==sessionEpoch&&!path.startsWith('/api/auth/'))throw Error('登录状态已改变，请重试。');
  const type = response.headers.get("content-type") || "";
  if (!response.ok) {
    const payload = type.includes("json") ? await response.json() : {};
    if(response.status===401&&!path.startsWith('/api/auth/'))document.dispatchEvent(new Event('session-expired'));
    throw new Error(payload.error || "请求失败");
  }
  return type.includes("json") ? response.json() : response.blob();
}
function setView(name) {
  setWaitingRoomVisible(name==='task');
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  $("#" + name + "-view").classList.add("active");
  $("#crumb").textContent = name === "home" ? "新建调研" : name === "history" ? "调研记录" : "研究详情";
  $("#nav-home").classList.toggle("active", name === "home");
  $("#nav-history").classList.toggle("active", name === "history");
  window.scrollTo(0, 0);
}
function taskStatus(task) {
  if (task.status === "completed" && hasCorruptSearch(task)) return ["检索无效", "failed"];
  if (task.status === "needs_review" || (task.report && task.quality?.publishable === false)) return [task.quality?.status === 'legacy_unverified' ? '历史报告待验收' : '待研发验收', 'review'];
  if (task.status === "completed") return ["已完成", "completed"];
  if (task.status === "failed") return ["需要重试", "failed"];
  if (task.status === "plan_ready") return ["计划待确认", "review"];
  if (task.status === "planning") return ["正在拆解需求", "running"];
  return [task.status === "queued" ? "排队中" : phaseNames[task.phaseIndex] || "处理中", "running"];
}
function hasCorruptSearch(task) { return Boolean(task.report && task.research?.plan && hasInvalidQueries(task.research.plan)); }
function renderSidebar() {
  $("#task-count").textContent = state.tasks.length;
  $("#sidebar-tasks").innerHTML = state.tasks.length
    ? state.tasks.slice(0, 5).map((task) => '<button class="sidebar-task" data-task="' + task.id + '">' + esc(task.title) + "</button>").join("")
    : '<div class="sidebar-empty">完成调研后会显示在这里</div>';
}
async function refreshTasks() {
  state.tasks = await api("/api/tasks");
  renderSidebar();
  if ($("#history-view").classList.contains("active")) renderHistory();
}
function renderHistory() {
  $("#history-list").innerHTML = state.tasks.length ? state.tasks.map((task) => {
    const status = taskStatus(task);
    return '<article class="history-card" data-task="' + task.id + '"><span class="h-mark">✳</span><div class="h-meta"><b>' +
      esc(task.title) + '</b><small>' + esc(task.input.subject) + " · " + formatDate(task.updatedAt) +
      '</small></div><span class="badge ' + status[1] + '">' + status[0] + "</span>›</article>";
  }).join("") : '<div class="empty">还没有调研记录。创建一次研究，报告会保存在本机。</div>';
}
function renderProgress(task) {
  if (task.status === "completed" && hasCorruptSearch(task)) return renderProgress({ ...task, status: "failed", phaseIndex: 1, error: "历史检索词被错误转换为 [object Object]，该次检索和报告无效。请重新制定研究计划。" });
  const steps = phaseNames.map((name, index) => {
    let cls = index < task.phaseIndex || task.status === "completed" || (task.status === "plan_ready" && index === 0) ? "done" : index === task.phaseIndex && task.status !== "failed" ? "current" : "";
    if (task.status === "failed" && index === task.phaseIndex) cls = "failed";
    const mark = cls === "done" ? "✓" : cls === "failed" ? "!" : ("0" + (index + 1)).slice(-2);
    return '<div class="phase ' + cls + '"><i>' + mark + "</i><span>" + name + "</span></div>";
  }).join("");
  const recovery = modelFailureHelp(task)||(hasCorruptSearch(task) ? "请点击“重新制定研究计划”，修复后的检索词需要重新确认。" : task.research?.searchQuality?.status === "blocked" ? "请检查实际检索词、被排除的来源与原因，再调整计划重试。" : task.phaseIndex >= 2 ? "已保存检索来源及完成的证据批次、技术主题。点击继续可复用已通过审查的阶段成果。" : "请根据上面的具体错误处理后重试；缺少密钥时请打开服务配置。");
  const error = task.status === "failed" ? '<div class="error"><b>本阶段未能完成：</b>' + esc(task.error) + '<br>' + recovery + '</div>' : "";
  let note = "正在分阶段执行，阶段产物会保存到本机。完成后自动显示报告。";
  let title = "正在执行";
  if (task.status === "plan_ready") { title = "等待确认研究计划"; note = "AI 已拟好研究计划。请先检查竞品范围和检索问题，可直接修改后再开始搜索。"; }
  if (task.status === "completed") { title = "已通过研发验收"; note = "研究已完成。请复核引用的原始来源，再将结论用于决策。"; }
  if (task.status === 'needs_review' || (task.status !== 'running' && task.report && task.quality?.publishable === false)) { title = '研究已保存 · 待验收'; note = task.error || '历史报告未按当前规则验收，请查看报告中的质量说明。'; }
  if(task.status==='running'&&task.report)note='正在重新核验和修订，下面保留的是上一版草稿；本轮完成后自动更新。';
  if (task.status === "failed") { title = "运行失败"; note = recovery; }
  const research = task.research || {};
  const live = research.searchProgress || {};
  const runs = research.queryRuns || [];
  const total = Number(live.totalQueries || runs.length || research.plan?.queries?.length || 0);
  const completed = Number(live.completedQueries ?? runs.filter((x) => x.status === "completed").length);
  const sourceCount = Number(live.sourceCount ?? research.sources?.length ?? 0);
  const round = Number(research.supplementalRound || 0);
  const autoRound = Number(research.searchQuality?.repairRounds || 0);
  const currentQuery = task.phaseIndex >= 2 && task.status === 'running' ? (task.phaseIndex===4?(research.currentActivity|| (research.contentRevision?.status==='running'?'按独立复核修订报告（第1/1轮）':'整合报告并进行独立复核')):task.phaseIndex===2&&research.evidenceProgress?.completed<research.evidenceProgress?.total?'证据整理：'+research.evidenceProgress.completed+'/'+research.evidenceProgress.total+' 条来源':research.currentActivity || '正在整理证据与技术分析') : task.status==='needs_review'?'本轮已结束，草稿有待核验':live.currentQuery || (task.status === "completed" ? "本轮检索已完成" : task.status === "failed" ? "本阶段已停止，请查看失败原因" : "等待检索开始");
  const queryView = '<div class="progress-insights"><div class="progress-stat"><small>当前检索问题</small><strong class="query-current">' + esc(currentQuery) + '</strong></div><div class="progress-stat"><small>已检索来源</small><strong>' + sourceCount + ' <em>条</em></strong></div><div class="progress-stat"><small>补查轮次</small><strong>' + (autoRound ? "自动补查 " + autoRound + " 轮" : round ? "第 " + round + " 轮" : "初始检索") + '</strong></div><div class="progress-stat"><small>搜索查询</small><strong>' + completed + ' <em>/ ' + total + '</em></strong></div></div>';
  const queries = runs.length ? '<details class="query-log"><summary>查看检索问题与状态</summary><ol>' + runs.map((item) => '<li><span class="query-status ' + esc(item.status || "pending") + '">' + ({ completed: "已完成", failed: "失败", running: "进行中", pending: "待检索" }[item.status] || "待检索") + "</span><span>" + esc(item.query) + (item.error ? ' <small>' + esc(item.error) + "</small>" : "") + "</span></li>").join("") + "</ol></details>" : "";
  return '<section class="progress"><div class="progress-title">研究工作流 · ' + title + '</div>'+renderWaitingRoom(task)+'<div class="phase-row">' + steps + "</div>" + queryView + queries + renderCatalogStatus(task) + renderSearchQuality(task) + error + renderModelDiagnostics(task) + '<div class="progress-note">' + note + "</div></section>";
}
function renderSearchQuality(task) {
  const quality = task.research?.searchQuality;
  if (!quality) return "";
  const rejected = task.research?.rejectedSources || [];
  return '<section class="search-quality ' + esc(quality.status) + '"><strong>来源相关性审查</strong><p>候选 ' + Number(quality.candidateCount || 0) + ' 条 · 保留 ' + Number(quality.acceptedCount || 0) + ' 条 · 排除 ' + Number(quality.rejectedCount || 0) + ' 条</p>' + (quality.reason ? '<p>' + esc(quality.reason) + '</p>' : '') + (rejected.length ? '<details><summary>查看被排除的来源与原因</summary><ul>' + rejected.map((source) => '<li><a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.title) + ' ↗</a><span>' + esc(source.reason) + '</span></li>').join("") + '</ul></details>' : '') + '</section>';
}
function focusOptions(value='auto') {
 return [['auto','根据原始问题自动识别'],['technical','技术原理、架构与实现'],['product','产品功能、场景与竞品差异'],['balanced','技术与产品综合分析']].map(([id,label])=>'<option value="'+id+'"'+(id===value?' selected':'')+'>'+label+'</option>').join('');
}
function renderPlan(task) {
  const plan = normalizePlan(task.research.plan, task.input);
  const selection=plan.competitorSelection,confirmed=selection?.baselineStatus==='confirmed';
  const baseline = task.input.baselineProduct ? '<div class="baseline-banner"><span data-plan-baseline-label>'+(confirmed?'已识别的对比基准':'原始产品名称 · 可确认型号，也可直接研究')+'</span><strong data-plan-baseline-name>' + esc(confirmed?selection.reference.name:task.input.baselineProduct) + "</strong></div>" : "";
  return '<section class="plan-review"><div class="plan-head"><div><small>RESEARCH PLAN · REVIEW BEFORE SEARCH</small><h2>先确认研究计划</h2><p>检查研究问题、竞品和检索范围；确认后才开始联网搜索。</p></div><span class="editable-mark">可编辑</span></div>' +
    baseline + '<p class="delivery-plan-note">'+esc(plan.delivery?.label||'Auto')+' · '+esc(plan.delivery?.reason||'按当前研究问题执行')+'</p>' + renderComparisonControls(task) + '<label class="plan-field">分析侧重点<select id="plan-focus" class="input">'+focusOptions(plan.analysisFocus)+'</select><small id="plan-focus-hint">'+esc(focusDescription(resolveResearchFocus({...task.input,analysisFocus:plan.analysisFocus})))+'</small></label><div class="plan-columns"><label>研究子问题<textarea id="plan-questions">' + esc((plan.questions || []).join("\n")) +
    '</textarea></label><label>竞品与对比对象<textarea id="plan-competitors">' + esc((plan.competitors || []).join("\n")) +
    '</textarea></label></div><label class="plan-field">检索关键词（每行一条）<textarea id="plan-queries">' + esc((plan.queries || []).join("\n")) +
    '</textarea><small>可补充产品名、技术路线、站点或删去无关关键词。</small></label><details class="plan-details"><summary>查看分析假设与资料策略</summary><div><b>分析假设</b><p>' +
    esc((plan.assumptions || []).join("；") || "无") + "</p><b>资料策略</b><p>" + esc((plan.sourceStrategy || []).join("、")) +
    '</p></div></details><button class="primary start-research" id="start-research">确认计划并开始调研 <b>↗</b></button></section>';
}
document.addEventListener('change',async event=>{if(event.target.id!=='plan-focus')return;try{const task=await api('/api/tasks/'+state.current);$('#plan-focus-hint').textContent=focusDescription(resolveResearchFocus({...task.input,analysisFocus:event.target.value}))+' 更改侧重后请一并检查下方问题和检索词，执行时使用你确认的查询。';}catch{}});
function citations(ids) {
  return (Array.isArray(ids) ? ids : []).map((id) => '<a class="cite" href="#source-' + encodeURIComponent(id) + '">[' + esc(id) + "]</a>").join("");
}
function safeNote(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(safeNote).filter(Boolean).join("；");
  if (typeof value === "object") {
    const preferred = ["message", "description", "detail", "issue", "claim", "title", "reason", "text", "note"];
    for (const key of preferred) if (value[key] != null) return safeNote(value[key]);
    return Object.entries(value).map(([key, item]) => key + "：" + safeNote(item)).join("；");
  }
  return String(value);
}
function reportText(value) {
  const text = safeNote(value);
  const tokens = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`|\bS\d+\b/g;
  let output = "", cursor = 0;
  for (const match of text.matchAll(tokens)) {
    output += esc(text.slice(cursor, match.index));
    if (match[2]) output += '<a href="' + esc(match[2]) + '" target="_blank" rel="noopener noreferrer">' + esc(match[1]) + ' ↗</a>';
    else if (match[3]) output += '<strong>' + reportText(match[3]) + '</strong>';
    else if (match[4]) output += '<code>' + esc(match[4]) + '</code>';
    else output += '<a class="cite cite-inline" href="#source-' + encodeURIComponent(match[0]) + '">' + match[0] + '</a>';
    cursor = match.index + match[0].length;
  }
  return output + esc(text.slice(cursor));
}
function reportPoint(text, index, kind = "") {
  const value = safeNote(text).trim().replace(/^[•·*\-]\s+/, "");
  if (!value) return "";
  const labelMatch = value.match(/^([^：:，。；]{2,22})[：:]\s*(.*)$/);
  const label = labelMatch ? labelMatch[1] : "";
  const content = labelMatch ? labelMatch[2] : value;
  return '<li class="report-point ' + (kind ? 'point-' + esc(kind) : "") + '"><p>' +
    (label ? '<strong>' + reportText(label) + '：</strong>' : '') + reportText(content) + '</p></li>';
}
function pointList(points, kind = "") {
  return '<ul class="report-points">' + points.map((point, i) => reportPoint(point, i, kind)).join("") + '</ul>';
}
function proseParagraphs(text) {
  const sentences = safeNote(text).match(/[^。！？]+[。！？]?/gu) || [];
  const paragraphs = [];
  let paragraph = "";
  for (const sentence of sentences) {
    if (paragraph && paragraph.length + sentence.length > 180) { paragraphs.push(paragraph); paragraph = ""; }
    paragraph += sentence;
  }
  if (paragraph) paragraphs.push(paragraph);
  return paragraphs.map((p) => '<p class="report-paragraph">' + reportText(p) + '</p>').join("");
}
function readingTable(columns, rows) {
  if (!Array.isArray(columns) || !columns.length || !Array.isArray(rows)) return "";
  return '<div class="table-wrap reading-table-wrap" tabindex="0" aria-label="可横向滚动的对比表格"><table class="reading-table"><thead><tr>' +
    columns.map((cell) => '<th scope="col">' + reportText(cell) + '</th>').join("") + '</tr></thead><tbody>' +
    rows.filter(Array.isArray).map((row) => '<tr>' + columns.map((_, i) => '<td>' + reportText(row[i] ?? "") + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>';
}
function markdownBlocks(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const output = [];
  let paragraph = [], points = [];
  const flush = () => {
    if (paragraph.length) output.push(proseParagraphs(paragraph.join(" ")));
    if (points.length) output.push(pointList(points));
    paragraph = []; points = [];
  };
  const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((s) => s.trim().replace(/\\\|/g, "|"));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^[-*_]{3,}$/.test(line)) { flush(); continue; }
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || "")) {
      flush(); const columns = cells(line), rows = []; i += 2;
      while (i < lines.length && lines[i].includes("|")) rows.push(cells(lines[i++]));
      i--; output.push(readingTable(columns, rows)); continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) { flush(); output.push('<h4 class="reading-heading">' + reportText(heading[1]) + '</h4>'); continue; }
    const item = line.match(/^(?:[-*+]\s+|\d+[.)、]\s+)(.*)$/);
    if (item) { if (paragraph.length) flush(); points.push(item[1]); continue; }
    if (points.length) flush();
    paragraph.push(line.replace(/^>\s?/, ""));
  }
  flush(); return output.join("");
}
function bodyBlocks(value) {
  if (Array.isArray(value)) {
    const cards = value.map((item, index) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const heading = safeNote(item.heading || item.title || item.label);
        const points = item.points || item.items || item.bullets || (item.text ? [item.text] : []);
        return '<section class="report-subsection">' + (heading ? '<h4>' + esc(heading) + '</h4>' : '') +
          (item.lead ? proseParagraphs(item.lead) : '') + pointList(Array.isArray(points) ? points : [points], item.kind) +
          (item.table ? readingTable(item.table.columns, item.table.rows) : '') + '</section>';
      }
      return pointList([item]);
    }).join("");
    return cards || '<p>公开资料未能确认。</p>';
  }
  const text = safeNote(value).trim();
  if (!text) return "<p>公开资料未能确认。</p>";
  if (/^\s*(?:#{1,6}\s|[-*+]\s|\|.+\|)/m.test(text)) return markdownBlocks(text);
  // Preserve legacy content, using headings and lists without boxing every sentence.
  const normalized = text.replace(/(^|[。！？；：:\n]|\s+)(\d{1,2}[）)、]\s*)/gu, "$1\n$2").replace(/([。！？；：:]|\s+)(?=(?:机会|风险|范围|方法|结论|主要限制|建议)\s*[：:])/g, "$1\n");
  const chunks = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const cards = [];
  for (const chunk of chunks) {
    const numbered = chunk.match(/^(\d{1,2})[）)、]\s*(.*)$/);
    const content = numbered ? numbered[2] : chunk.replace(/^[•·*\-]\s*/, "");
    const topic = content.match(/^([^：:，。；]{2,28})[：:]\s*(.*)$/);
    const heading = topic && (numbered || content.length > 90 || /^(机会|风险|范围|方法|结论|主要限制|建议)$/.test(topic[1])) ? topic[1] : "";
    const body = heading ? topic[2] : content;
    const parts = body.split(/[；;]+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1 || numbered) {
      cards.push('<section class="report-subsection">' +
        (heading ? '<h4>' + esc(heading) + '</h4>' : '') + pointList(parts) + '</section>');
    } else {
      cards.push((heading ? '<h4>' + esc(heading) + '</h4>' : '') + proseParagraphs(body));
    }
  }
  return cards.join("") || '<p>公开资料未能确认。</p>';
}
function metricList(task) {
  const criteria = task.research?.plan?.criteria;
  const parsed = Array.isArray(criteria) ? criteria.map((x) => typeof x === "string" ? x : safeNote(x.metric || x.name || x.label || x.text)).filter(Boolean) : [];
  const requested = (task.input.metrics || "").split(/[，,、;；\n]+/).map((x) => x.trim()).filter(Boolean);
  return [...new Set([...(requested.length ? requested : parsed), ...parsed])].slice(0, 10).length
    ? [...new Set([...(requested.length ? requested : parsed), ...parsed])].slice(0, 10)
    : ["容量", "持续功率", "峰值功率", "重量", "充电时间", "电芯体系", "扩展能力", "价格与质保"];
}
function rowMetric(row, metric, definitions = []) {
  const values = Array.isArray(row.metricValues) ? row.metricValues : [];
  const key=(value)=>safeNote(value).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
  const definition=definitions.find((item)=>[item.id,item.label,...(item.aliases || [])].some((name)=>key(name)===key(metric)));
  if(definition) {const value=values.find((item)=>item.metricId===definition.id);if(value)return value;}
  return values.find((item) => safeNote(item.metric).trim().toLowerCase() === metric.trim().toLowerCase()) || null;
}
function metricCell(item, row, metric, baseline) {
  if (baseline && !row.metricValues?.length && /请补充|待补充/.test(safeNote(row.specifications))) return '<span class="metric-state to-provide">待补充我方参数</span>';
  if (!item) return '<span class="metric-state not_found">本轮未找到该字段</span>';
  const status = item.presentation?.state || (item.verification?.status === 'needs_review' ? 'needs_review' : ["disclosed", "derived", "not_found", "not_disclosed", "not_comparable", "conflict"].includes(item.status) ? item.status : "not_disclosed");
  const label = item.presentation?.label || (['disclosed','derived'].includes(status) ? (status === 'derived' ? '计算值 · ' : '') + safeNote(item.value) + (item.unit ? " " + safeNote(item.unit) : "") : status === 'needs_review' ? '参数待核验' : ['not_found','not_disclosed'].includes(status) ? "本轮未找到" : "数据不可比");
  const note = item.presentation?.detail||item.note ? '<small>' + esc(safeNote(item.presentation?.detail||item.note)) + "</small>" : "";
  const detail = item.verification?.status==='needs_review' ? '<small>'+esc(item.verification.reason)+'</small>' : item.status==='derived' ? '<details><summary>查看计算依据</summary><p>'+esc(item.formula || '')+'</p>'+ (item.inputs || []).map((input)=>'<p>'+esc(safeNote(input.metric)+'：'+safeNote(input.value)+' '+safeNote(input.unit))+citations(input.sourceIds || [])+'</p>').join('')+'</details>' : '';
  return '<span class="metric-state ' + esc(status) + '">' + esc(label || metric) + "</span>" + (item.basis === "team_catalog" ? '<small class="catalog-label">部门整理值 · 请复核区域与日期</small>' : '') + note + detail + citations(item.presentation?.sourceIds||item.sourceIds || []);
}
function renderComparisonScope(rows,task) {
  const scope=task.evidence?.comparisonScope;
  if(!scope)return '';
  if(scope.region==='all')return '<p class="comparison-note"><strong>比较范围：所有地区</strong>。来源的地区、配置和条件分别保留；同型号不同数值按版本查看，不将输入功率、峰值或套装容量混作同档参数。</p>';
  const variants=rows.flatMap(row=>(row.metricValues || []).filter(metric=>metric.scopeVariants?.length).map(metric=>'<li><strong>'+esc(row.competitor+' · '+metric.metric)+'</strong><ul>'+metric.scopeVariants.map(value=>'<li>'+esc([value.product,value.region,value.configuration,safeNote(value.value)+' '+(value.unit || ''),value.condition].filter(Boolean).join(' · '))+citations(value.sourceIds || [])+'</li>').join('')+'</ul></li>'));
  return '<p class="comparison-note"><strong>当前比较口径：'+esc(scope.region)+' · 裸机</strong>。其他地区、配置与主体的观察值单列保留。</p>'+(variants.length?'<details class="scope-variants"><summary>其他口径的原始观察值（'+variants.length+' 组）</summary><p>这些值未按当前比较口径核验，不代表已证实的参数。</p><ul>'+variants.join('')+'</ul></details>':'');
}
function rawExtractionNotes(task) {
  const boundary=task.evidence?.boundaryPresentation;
  if(!boundary)return '';
  const notes=[...(boundary.raw?.conflicts || []),...(boundary.raw?.gaps || [])];
  return '<details class="process-block"><summary>提取批次原始备注（'+notes.length+'条）</summary><p>'+esc(boundary.note)+'</p><ul>'+notes.map(note=>'<li>'+esc(safeNote(note))+'</li>').join('')+'</ul></details>';
}
function renderTable(rows, task) {
  if (!Array.isArray(rows) || !rows.length) return '<div class="no-data">公开资料不足以形成可比表格。</div>';
  if (!rows.some((row) => row.metricValues?.length)) {
    return '<p class="comparison-note">这份历史报告保存了产品资料，尚未按统一指标核验。以下展示原有信息；定量比较需补充调研。</p>' +
      '<div class="legacy-product-list">' + rows.map((row) => '<details><summary>' + esc(safeNote(row.competitor)) + '<span>查看已保存资料 ＋</span></summary><div>' +
        (row.technology ? '<p><strong>技术路线：</strong>' + reportText(row.technology) + '</p>' : '') +
        (row.specifications ? '<p><strong>产品规格：</strong>' + reportText(row.specifications) + '</p>' : '') + citations(row.evidenceIds) + '</div></details>').join("") + '</div>';
  }
  const definitions=task.research?.metricDefinitions||[],metricKey=value=>safeNote(value).normalize('NFKC').toLowerCase().replace(/\s+/g,'');
  const metrics=[...new Map(metricLabels([...metricList(task),...rows.flatMap(row=>(row.metricValues||[]).map(item=>item.metric))]).map(label=>{const definition=definitions.find(item=>[item.id,item.label,...(item.aliases||[])].some(name=>metricKey(name)===metricKey(label)));return [definition?.id||label,definition?.label||label];})).values()];
  const baselineName = (task.input.baselineProduct || "").trim();
  const baselineId=task.research?.productRegistry?.find(product=>product.baseline)?.id;
  const isBaseline = (row) => baselineId && row.productId===baselineId || baselineName && safeNote(row.competitor).includes(baselineName);
  return renderProductComparison(visibleComparisonRows(rows,isBaseline),task,{metrics,findMetric:(row,metric)=>rowMetric(row,metric,definitions),isBaseline});
}
function sourceCard(source) {
  let domain = source.siteName || "";
  try { domain = domain || new URL(source.url).hostname.replace(/^www\./, ""); } catch {}
  const title = safeNote(source.displayTitle || source.title).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || "公开资料原文";
  return '<div class="source" id="source-' + encodeURIComponent(source.id) + '"><div><span class="source-id">' + esc(source.id) +
    "</span><span class=\"source-domain\">" + esc(domain) + '</span></div><a href="' + esc(source.url) +
    '" title="' + esc(title) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + "</a><small>" +
    (source.publishedAt ? "发布 " + esc(source.publishedAt.slice(0, 10)) + " · " : "") + "检索 " + esc((source.retrievedAt || "").slice(0, 10)) + '</small>' + (source.provider === "team_catalog" ? '<small class="catalog-label">部门整理 · 复核 ' + esc(source.catalogVerifiedDate || '日期未注明') + '</small>' + (source.officialUrl && /^https?:\/\//.test(source.officialUrl) ? '<a class="official-link" href="' + esc(source.officialUrl) + '" target="_blank" rel="noopener noreferrer">核对官网 ↗</a>' : '') : '') + (source.relevance === "context" ? '<small class="source-context-label">背景资料 · 不能证明目标产品参数</small>' : '') + '</div>';
}
function reportSection(title, content, id = "") {
  return '<section class="report-section"' + (id ? ' id="' + id + '"' : '') + '><h3>' + title + "</h3><div class=\"report-section-body\">" + bodyBlocks(content) + "</div></section>";
}
function renderProductMappings(route,products,sources) {
  const refs=topicProductReferences(route,products);
  if(!refs.items.length)return '';
  if(!refs.structured)return '<div class="topic-model-mentions"><small>正文提及的型号 · 采用关系待核验</small>'+refs.items.map(product=>'<span class="model-chip">'+esc(product.display)+'</span>').join('')+'</div>';
  const specs=product=>(product.catalogRecords||[]).slice(0,3).map(record=>'<small class="catalog-model-spec">规格库已收录 · '+esc((record.regions||[]).join('/'))+'<br>'+esc([record.capacityWh?record.capacityWh+' Wh':'',record.ratedPowerW?record.ratedPowerW+' W':''].filter(Boolean).join(' · ')||'基础字段待补')+'<br>部门整理，保留地区与日期 '+citations([record.sourceId])+'</small>').join('');
  return '<section class="topic-product-mappings"><h5>方案与具体型号对应</h5><p class="comparison-note">技术采用关系与基础规格分开核对；结构或拓扑未知，不表示容量、功率等规格没有记录。</p><div class="engineering-table-scroll"><table class="engineering-table"><thead><tr><th>厂商 / 型号与已收录规格</th><th>该技术方案的依据</th><th>相对基准的意义</th></tr></thead><tbody>'+refs.items.map(item=>'<tr><td><span class="model-chip">'+esc(item.product.display)+'</span>'+(item.product.baseline?'<small>对比基准</small>':'')+specs(item.product)+'</td><td><span class="adoption-badge '+esc(item.adoptionStatus)+'">'+({documented:'有原文依据 · 仍须结合核验',proposal:'待验证设计选项',unknown:'该技术采用关系尚未证实'}[item.adoptionStatus] || '待核验')+'</span>'+proseParagraphs(item.summary)+citations(item.sourceIds)+(item.evidence?.length?'<details><summary>查看该型号证据摘录</summary>'+quoteCards(item.evidence,sources)+'</details>':'')+'</td><td>'+proseParagraphs(item.comparisonImplication)+'</td></tr>').join('')+'</tbody></table></div></section>';
}
function highlightReportProducts(task) {
 const products=task.research?.presentationProducts || [];
 for(const root of document.querySelectorAll('.report')) {
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
   while(walker.nextNode())if(walker.currentNode.parentElement&&!walker.currentNode.parentElement.closest('mark,blockquote,code,.cite,.model-chip,.reading-tools,.quality-notice,button,input'))nodes.push(walker.currentNode);
   for(const node of nodes){if(node.parentElement.closest('.product-comparison,.source,.scope-variants,a'))continue;const qualified=qualifyProductMentions(node.textContent,products,node.previousSibling?.textContent||(node.parentElement.matches('strong,em')?node.parentElement.previousSibling?.textContent:'')||''),segments=highlightSegments(qualified,products);if(!segments.some(part=>part.highlight)){if(qualified!==node.textContent)node.textContent=qualified;continue;}const fragment=document.createDocumentFragment();for(const part of segments){if(!part.highlight){fragment.append(document.createTextNode(part.text));continue;}const mark=document.createElement('mark');mark.className='product-highlight '+part.kind;mark.textContent=part.text;fragment.append(mark);}node.replaceWith(fragment);}
 }
}
function renderTechnology(report, plan, preview = false, products = [], sources = new Map()) {
  const routes = report.technologyDeepDives;
  if (!Array.isArray(routes) || !routes.length) return report.technologyOverview?.length ? reportSection('技术方案与路线', report.technologyOverview, 'report-technology') : '';
  const groups = [['principle', '工作原理'], ['architecture', '系统构成与接口'], ['implementation', '实现步骤'], ['tradeoffs', '设计取舍与适用条件'], ['validation', '验证方法与失效模式']];
  return '<section class="report-section technical-section" id="report-technology"><h3>技术方案与路线</h3><p class="section-intro">从原理到实现，逐项说明设计约束与验证方法。</p>' + routes.map((route, i) => {
    if(preview&&Number.isInteger(route.checkpointIndex))i=route.checkpointIndex;
    const questions = (route.questionIds || []).map((id) => (plan?.questions || [])[Number(String(id).replace('Q', '')) - 1]).filter(Boolean);
    const decisions=Array.isArray(route.designDecisions)?route.designDecisions:[];
    const validation=Array.isArray(route.validationPlan)?route.validationPlan:[];
    const grid=(headers,rows)=>'<div class="engineering-table-scroll"><table class="engineering-table"><thead><tr>'+headers.map((text)=>'<th>'+esc(text)+'</th>').join('')+'</tr></thead><tbody>'+rows.map((row)=>'<tr>'+row.map((value)=>'<td>'+reportText(value || '')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
    return '<article class="technical-route" id="report-tech-route-' + (i+1) + '"><header><span class="route-number">技术主题 ' + String(i + 1).padStart(2, '0') + '</span><span class="implementation-basis">' + (preview ? '章节草稿 · 尚未复核' : route.implementationBasis === 'documented' ? '依据公开资料' : '工程推演 · 需验证') + '</span></header><h4>' + reportText(route.heading) + '</h4>' + (questions.length ? '<details class="route-question"><summary>关联研究问题（' + esc((route.questionIds || []).join('、')) + '）</summary>'+pointList(questions)+'</details>' : '') + (route.designProblem?'<p class="design-problem"><strong>设计问题</strong> '+reportText(route.designProblem)+'</p>':'') + proseParagraphs(route.lead || '') + renderProductMappings(route,products,sources) + (route.systemPath?'<div class="system-path"><strong>系统路径</strong><ul class="system-path-flows">'+route.systemPath.split(/[；;]/u).map((flow)=>'<li>'+reportText(flow)+'</li>').join('')+'</ul></div>':'') + groups.map(([key, label]) => {
      if(key==='tradeoffs'&&decisions.length) return '<section class="technical-detail"><h5>'+label+'</h5>'+grid(['适用条件','收益与代价','选型建议'],decisions.map((item)=>[item.condition,'收益：'+item.benefit+'\n代价：'+item.cost,item.decision]))+'</section>';
      if(key==='validation'&&validation.length) return '<section class="technical-detail"><h5>'+label+'</h5>'+grid(['失效 / 工况','观测与测法','判据及依据'],validation.map((item)=>[item.failureMode+'\n'+item.conditions,item.measurement,item.criterion+'\n依据：'+item.basis]))+'</section>';
      const values = Array.isArray(route[key]) ? route[key] : route[key] ? [route[key]] : [];
      return '<section class="technical-detail"><h5>' + label + '</h5>' + (values.length ? (key === 'implementation' ? '<ol class="implementation-steps">' + values.map((value) => '<li>' + reportText(safeNote(value)) + '</li>').join('') + '</ol>' : pointList(values)) : '<p class="proof-empty">本轮证据不足，需补查后确认。</p>') + '</section>';
    }).join('') + citations(route.sourceIds) + (route.knownLimits?.length ? '<details class="technical-limits"><summary>查看本主题的证据边界与待验证项</summary>' + pointList(route.knownLimits) + '</details>' : '') + '</article>';
  }).join('') + '</section>';
}
function sourceIndex(task) { return new Map((task.research?.sources || []).map((source) => [source.id, source])); }
function quoteCards(entries, sources) {
  return (entries || []).filter((entry) => entry && entry.sourceId && sources.has(entry.sourceId) && safeNote(entry.quote).trim()).map((entry) => {
    const source = sources.get(entry.sourceId);
    return '<div class="proof-quote"><blockquote>“' + esc(entry.quote) + '”</blockquote><div><span>' + esc(source.siteName || source.title) + ' · ' + esc(entry.sourceId) + '</span><a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a></div></div>';
  }).join("");
}
function sourceExcerpt(source) {
  const excerpt = safeNote(source.snippet).trim();
  if (!excerpt) return '<p class="proof-empty">本轮检索没有保存摘要摘录。请打开原始页面核对结论。</p>';
  return '<div class="proof-quote search-excerpt"><small>' + (source.contentKind === 'curated_record' ? '部门规格库整理记录 · 尚未独立核对官网' : '搜索结果摘要 · 不是逐字引文') + '</small><blockquote>' + esc(excerpt.slice(0, 700)) + (excerpt.length > 700 ? "…" : "") + '</blockquote></div>';
}
function renderDashboard(task) {
  const sources = task.research?.sources || [];
  const findings = task.report?.keyFindings || [];
  const rows = task.evidence?.competitorRows || [];
  const conflicts = Array.isArray(task.evidence?.conflicts) ? task.evidence.conflicts : [];
  const gaps = Array.isArray(task.evidence?.gaps) ? task.evidence.gaps : [];
  const metrics = metricList(task);
  const bars = rows.map((row) => {
    const baseline = (task.input.baselineProduct || "") && safeNote(row.competitor).includes(task.input.baselineProduct);
    const known = metrics.filter((metric) => ['disclosed','curated','derived'].includes(rowMetric(row, metric, task.research?.metricDefinitions || [])?.status)).length;
    const pct = row.metricValues?.length ? Math.round(known / metrics.length * 100) : 0;
    return '<div class="coverage-row"><span>' + esc(safeNote(row.competitor)) + '</span><div class="coverage-track"><i style="width:' + pct + '%"></i></div><strong>' + (row.metricValues?.length ? known + '/' + metrics.length : "待结构化") + '</strong>' + (baseline ? '<em>自家基准</em>' : "") + '</div>';
  }).join("");
  const coverage = rows.some((row) => row.metricValues?.length) ? '<details class="coverage-chart"><summary>查看对比指标的资料覆盖</summary><div class="coverage-title"><small>有记录的参数 / 关注指标数；含部门整理，保留地区与日期的规格库值，不代表产品评分</small></div>' + bars + '</details>' : '';
  return '<section class="insight-dashboard" aria-label="研究数据概览"><div class="dashboard-kpis"><div><small>检索来源</small><strong>' + sources.length + '<em> 条</em></strong></div><div><small>保存的发现</small><strong>' + findings.length + '<em> 项</em></strong></div><div><small>对比对象</small><strong>' + rows.length + '<em> 个</em></strong></div><a class="attention" href="#report-limits"><small>应用前复核</small><strong>' + (task.reviewChecklist?.length??(conflicts.length + gaps.length)) + '<em> 项</em></strong></a></div>' + coverage + '</section>';
}
function renderReport(task) {
  if (!task.report) return "";
  if (hasCorruptSearch(task)) return '<section class="search-invalid"><h1>检索词异常，本次报告不可用</h1><p>这次任务实际搜索了 <code>[object Object]</code>，得到的是 JavaScript 对象打印问题页面，与研究主题无关。原始记录已保留，报告不作为有效调研结果展示。</p><p>请点击上方“重新制定研究计划”，用原始需求建立新的任务，再检查具体产品名和检索问题。</p></section>';
  const report = task.report;
  const qualityNotice = task.quality && !task.quality.publishable ? '<section class="quality-notice" role="status"><strong>' + (task.quality.status === 'legacy_unverified' ? '历史报告 · 尚未通过当前研发验收' : '研究草稿 · 仍有问题待核验') + '</strong><p>以下内容可以阅读和复核，正式结论须通过逐问题、事实与技术深度检查。</p><p>下方只列少量影响决策的关键事项；完整机器审查记录见“研究过程”，不要求逐条人工处理。</p></section>' : '';
  const balance = report.contentBalance;
  const focus=task.research?.contract?.focus || report.analysisFocus;
  const quickAnswer=task.research?.contract?.delivery?.route==='answer';
  const balanceView = balance&&!quickAnswer ? '<div class="technical-balance"><div><strong>'+esc(focus?.label || '历史报告 · 篇幅参考')+'</strong><span>技术章节占叙述正文 '+(balance.technicalShare*100).toFixed(1)+'% · '+(focus?.enforceShare?'用户指定目标 '+Math.round(focus.technicalTarget*100)+'%':'不设固定比例门槛')+'</span><small>'+esc(balance.definition)+'</small></div></div>' : '';
  const evidence = task.evidence || {};
  const sources = task.research?.sources || [];
  const sourceMap = sourceIndex(task);
  const findings = selectResearchFindings(report).map((item, index) => {
    const refs = [...new Set(item.citations || [])].map((id) => sourceMap.get(id)).filter(Boolean);
    const proof = quoteCards(item.evidence, sourceMap) || refs.map(sourceExcerpt).join("");
    return '<details class="finding finding-expand"><summary><span class="finding-number">' + String(index + 1).padStart(2, "0") + '</span><div><span class="finding-type">' + esc(safeNote(item.kind) || "研究发现") + '</span>' + (item.question ? '<h4 class="finding-question">' + esc(item.question) + '</h4>' : '') + '<p>' + reportText(safeNote(item.text)) + '</p></div><span class="finding-open">展开证据</span></summary><div class="finding-proof">' + (proof || '<p class="proof-empty">没有保存证据摘录；可先点击来源编号打开原文复核。</p>') + '<div class="evidence-links">' + refs.map((source) => '<a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.id + " · " + (source.siteName || source.title)) + ' ↗</a>').join("") + '</div></div></details>';
  }).join("");
  const claims = (evidence.claims || []).map((claim, index) => {
    const exact = quoteCards(claim.evidence, sourceMap);
    const ids = [...new Set([...(claim.sourceIds || []), ...(claim.evidence || []).map((item) => item.sourceId)])];
    const refs = ids.map((id) => sourceMap.get(id)).filter(Boolean);
    return '<article class="evidence-card"><header><span class="claim-type">' + esc(safeNote(claim.type) || "研究发现") + '</span><span class="claim-index">发现 ' + String(index + 1).padStart(2, "0") + '</span></header><h3>' + esc(safeNote(claim.claim)) + '</h3>' + (exact || (!refs.length ? '<p class="proof-empty">没有关联到来源。该项暂不应作为已核实事实使用。</p>' : refs.map(sourceExcerpt).join(""))) +
      (safeNote(claim.note) ? '<p class="claim-note">' + esc(safeNote(claim.note)) + '</p>' : '') + '<div class="evidence-links">' + refs.map((source) => '<a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.id + " · " + (source.siteName || source.title)) + ' ↗</a>').join("") + '</div></article>';
  }).join("");
  const findingEvidence = (report.keyFindings || []).map((item, index) => {
    const exact = quoteCards(item.evidence, sourceMap);
    const matchingClaims = (evidence.claims || []).filter((claim) => (claim.sourceIds || []).some((id) => (item.citations || []).includes(id)) && (claim.evidence || []).length).flatMap((claim) => claim.evidence);
    const citationSources = [...new Set(item.citations || [])].map((id) => sourceMap.get(id)).filter(Boolean);
    const details = exact || quoteCards(matchingClaims, sourceMap) || "";
    const excerpt = details || citationSources.map(sourceExcerpt).join("");
    return '<details class="verified-finding"><summary><span class="finding-number">' + String(index + 1).padStart(2, "0") + '</span><span><b>' + esc(safeNote(item.kind) || "研究发现") + '</b><strong>' + esc(safeNote(item.text)) + '</strong></span><i>查看证据</i></summary><div class="verified-body">' + (excerpt || '<p class="proof-empty">未保存可展示的摘录。可通过来源链接打开原文复核。</p>') + '<div class="evidence-links">' + citationSources.map((source) => '<a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.id + " · " + (source.siteName || source.title)) + ' ↗</a>').join("") + '</div></div></details>';
  }).join("");
  const allUsedIds = new Set();
  (report.keyFindings || []).forEach((item) => (item.citations || []).forEach((id) => allUsedIds.add(id)));
  (evidence.competitorRows || []).forEach((item) => (item.evidenceIds || []).forEach((id) => allUsedIds.add(id)));
  (evidence.claims || []).forEach((item) => (item.sourceIds || []).forEach((id) => allUsedIds.add(id)));
  (JSON.stringify(report).match(/\bS\d+\b/g) || []).forEach((id) => allUsedIds.add(id));
  const citedSources = sources.filter((source) => allUsedIds.has(source.id));
  const otherSources = sources.filter((source) => !allUsedIds.has(source.id));
  const notes = [];
  if(evidence.boundaryPresentation)(evidence.boundaryPresentation.current || []).forEach(item=>notes.push([item.kind,item.message]));
  else { (Array.isArray(evidence.conflicts) ? evidence.conflicts : []).map(safeNote).filter(Boolean).forEach(x=>notes.push(['批次冲突备注 · 可能已补齐',x]));(Array.isArray(evidence.gaps)?evidence.gaps:[]).map(safeNote).filter(Boolean).forEach(x=>notes.push(['批次缺口备注 · 可能已补齐',x])); }
  (Array.isArray(task.research?.searchWarnings) ? task.research.searchWarnings : []).map(safeNote).filter(Boolean).forEach((x) => notes.push(["检索未完成", x]));
  const limits = notes.length ? notes.map((x) => '<div class="limit-row"><span>' + x[0] + "</span><p>" + esc(x[1]) + "</p></div>").join("")
    : '<div class="limit-empty">本轮研究没有标记出明确的来源冲突或资料缺口。这不代表所有信息都已核实；决策前仍请复核原始来源。</div>';
  const assumptionItems = (task.research?.plan?.assumptions || []).map((item) => "<li>" + esc(safeNote(item)) + "</li>").join("");
  const methodItems = (report.methodNotes || []).map((item) => "<li>" + esc(safeNote(item)) + "</li>").join("");
  const summaryText = safeNote(report.executiveSummary).trim();
  const summarySentences = summaryText.split(/(?<=[。！？])\s*/u).filter(Boolean);
  let summaryLead = summaryText.length > 240 ? summarySentences.slice(0, 2).join("") : summaryText;
  if (summaryLead.length > 320 && summarySentences.length > 1) summaryLead = summarySentences[0];
  const summaryRest = summaryLead.length < summaryText.length ? summaryText.slice(summaryLead.length) : "";
  const summary = '<section class="executive-summary" id="report-summary"><span>核心结论</span>' + proseParagraphs(summaryLead) + (summaryRest ? '<details><summary>展开完整摘要</summary>' + proseParagraphs(summaryRest) + '</details>' : '') + '</section>';
  const keyFindings = '<section class="report-section" id="report-findings"><div class="section-heading"><div><h3>关键发现</h3><small>' + (report.questionAnswers?.length ? '展示已保存的研究结论；草稿内容仍须核验。未回答问题与研究约束保留在研究过程及资料边界。' : '历史报告：展示已保存的发现，完整记录见证据核验。') + '</small></div></div><div class="finding-list">' + (findings || '<div class="no-data">目前没有可展示的关键发现，请查看研究过程和后续分析章节。</div>') + "</div></section>";
  const sectionDefinitions = [
    
    ["applications", "产品与应用", report.productApplications], ["baseline", "对自家产品的启示", report.baselineImplications],
    ["trends", "技术趋势", report.trends], ["risks", "机会与风险", report.opportunitiesAndRisks], ["actions", "建议与优先级", report.recommendations]
  ].filter(([, ,content])=>Array.isArray(content)?content.length:typeof content==='string'?content.trim():content&&Object.keys(content).length);
  const productFocus=focus?.mode==='product';
  const sections = sectionDefinitions.map(([id, title, content]) => id === 'actions'||(productFocus&&['applications','baseline','trends'].includes(id)) ? reportSection(title, content, 'report-' + id) : '<details class="report-section secondary-section" id="report-' + id + '"><summary><span>' + title + '</span><small>展开阅读</small></summary><div class="report-section-body">' + bodyBlocks(content) + '</div></details>').join("");
  const technologySection=renderTechnology(report, task.research?.plan, false, task.research?.presentationProducts || [], sourceMap);
  const comparisonSection=!quickAnswer&&evidence.competitorRows?.length?'<section class="report-section" id="report-comparison"><div class="section-heading"><div><h3>产品与竞品指标矩阵</h3><small>同一指标横向比较；显式标记未披露与口径不可比</small></div></div>' + renderTable(evidence.competitorRows, task) + '</section>':'';
  const contents = '<aside class="report-outline"><nav class="report-contents" aria-label="报告章节目录"><span>本页目录</span><div>' + [["summary", "核心结论"], ["findings", "关键发现"],...(productFocus?[...(comparisonSection?[["comparison", "产品与竞品"]]:[]), ...sectionDefinitions.map(([id, title]) => [id, title])]:[]), ...(technologySection?[["technology", "技术方案与路线"]]:[]), ...(report.technologyDeepDives || []).map((route,i) => ['tech-route-' + (i+1), route.heading]), ...(!productFocus?[...(comparisonSection?[["comparison", "产品与竞品"]]:[]), ...sectionDefinitions.map(([id, title]) => [id, title])]:[]), ["limits", "资料边界与待核实"]].map(([id, title], index) => '<a href="#report-' + id + '"' + (id.startsWith('tech-route-') ? ' class="outline-subchapter"' : '') + '><span>' + String(index + 1).padStart(2, "0") + '</span>' + esc(title) + '</a>').join("") + '</div></nav></aside>';
  const readingTools = '<div class="reading-tools"><span>阅读字号</span><div role="group" aria-label="阅读字号"><button type="button" data-reading-size="standard">标准</button><button type="button" data-reading-size="large">大字</button></div></div>';
  const reportPanel = '<section class="report-panel active" id="report-panel-report"><article class="report">' + readingTools + '<div class="report-kicker">'+(quickAnswer?'简洁回答':'技术洞察报告')+' · ' + formatDate(report.generatedAt) + '</div><h1 class="report-title">' + esc(task.title) + '</h1>' + summary + balanceView + (quickAnswer?'':renderDashboard(task)) + keyFindings + (productFocus?comparisonSection+sections+technologySection:technologySection+comparisonSection+sections) + '<details class="report-section limits-section" id="report-limits"><summary>资料边界与待核实 <span>应用前需确认的结论、核验动作与原文</span></summary><div class="limits-body">' + qualityNotice + renderReviewChecklist(task) + '</div></details><section class="followup"><h3>继续深挖一个问题</h3><div class="follow-row"><input id="follow-input" aria-label="补充调研问题" placeholder="例如：补查基准产品在电芯安全上的公开证据"><button id="follow-button">补充调研 ↗</button></div></section></article></section>';
  const evidencePanel = '<section class="report-panel" id="report-panel-evidence"><div class="evidence-intro"><span>逐条核对结论</span><p>优先展示模型从来源内容中摘录的原文。搜索摘要会明确标注，不作为逐字引文；在右侧来源栏打开原文。</p></div>' + renderReviewChecklist(task,{evidence:true}) + (findingEvidence ? '<div class="verified-list">' + findingEvidence + '</div>' : '<div class="no-data">暂无关键结论。</div>') + (claims ? '<section class="evidence-section"><div class="section-heading"><div><h2>结构化证据</h2><small>事实、推断和未知项分别列出</small></div></div><div class="evidence-list">' + claims + '</div></section>' : '') + '</section>';
  const roundCards = (task.research?.searchRounds || []).map((round) => '<article class="round-card"><header><strong>' + (round.kind === 'evidence_followup' ? '核验后补查第 ' + round.round + ' 轮' : round.round ? '补查第 ' + round.round + ' 轮' : '初始检索') + '</strong><span>' + Number(round.sourceCount || 0) + ' 条来源 · ' + (round.queries || []).length + ' 个检索问题</span></header><ul>' + (round.queries || []).map((query) => '<li>' + esc(query) + '</li>').join("") + '</ul></article>').join("");
  const queryRows = (task.research?.queryRuns || []).map((item) => '<li><span class="query-status ' + esc(item.status || "pending") + '">' + ({ completed: "已完成", failed: "失败", running: "进行中", pending: "待检索" }[item.status] || "待检索") + '</span><span>' + esc(item.query) + '</span>' + (item.error ? '<small>' + esc(item.error) + '</small>' : '') + '</li>').join("");
  const roundCount = (task.research?.searchRounds || []).length || (sources.length ? 1 : 0);
  const repairLog=task.research?.evidenceRepair;
  const repairView=repairLog ? '<section class="process-block"><h2>证据缺口补查</h2><p>已用 ' + Number(repairLog.queriesUsed || 0) + '/' + Number(repairLog.limits?.totalQueries||6) + ' 条补查查询；独立文档 ' + Number(task.research?.searchProgress?.independentDocumentCount || 0) + ' 份。' + esc(({resolved:'缺口已解决',budget_exhausted:'已达到补查预算，保留未解决项',no_new_queries:'没有新的有效查询',source_limit:'已达到来源数量上限'})[repairLog.stopReason] || '补查进行中') + '</p><ul>' + (repairLog.gaps || []).map(gap=>'<li>' + esc([gap.product,gap.metric,gap.reason].filter(Boolean).join(' · ')) + '</li>').join('') + '</ul></section>' : '';
  const machineAudit='<details class="process-block"><summary>机器审查完整记录（过程留档，不是人工待办）</summary><ul>'+(task.quality?.issues||[]).map(issue=>'<li>'+esc(issue.message)+'</li>').join('')+'</ul><ul>'+(task.evidence?.boundaryPresentation?.current||[]).map(item=>'<li>'+esc(item.message)+'</li>').join('')+'</ul></details>';
  const questionTrace=machineAudit+rawExtractionNotes(task)+(report.userQuestionAnswers?.length?'<details class="process-block"><summary>原始问题与扩展问题对应关系</summary>'+report.userQuestionAnswers.map((answer)=>'<h3>'+esc(answer.questionId+' · '+answer.question)+'</h3><p>对应研究问题：'+esc((answer.relatedQuestionIds || []).join('、'))+'</p>').join('')+'<h3>扩展问题的保存答案</h3>'+(report.questionAnswers || []).map((answer)=>'<h4>'+esc(answer.questionId+' · '+answer.question)+'</h4>'+proseParagraphs(answer.text)+citations(answer.citations)).join('')+'</details>':'');
  const excluded=(evidence.competitorRows||[]).filter(row=>!visibleComparisonRows([row],row=>task.research?.productRegistry?.some(p=>p.baseline&&p.id===row.productId)).length);
  const excludedView=excluded.length?'<details class="process-block"><summary>未纳入指标矩阵的参考型号（'+excluded.length+'）</summary><p>以下非基准型号没有可用参数，只有空值、待核验或口径冲突，因此不占产品对比列。原始资料保留。</p><ul>'+excluded.map(row=>'<li><strong>'+esc(row.competitor)+'</strong>：没有有效参数，不能形成当前口径比较。</li>').join('')+'</ul></details>':'';
  const processPanel = '<section class="report-panel process-panel" id="report-panel-process"><div class="process-dashboard"><div><small>研究迭代</small><strong>' + roundCount + ' <em>轮</em></strong></div><div><small>检索问题</small><strong>' + (task.research?.queryRuns || []).length + '</strong></div><div><small>来源条目</small><strong>' + sources.length + '</strong></div><div><small>当前轮次</small><strong>' + (Number(task.research?.searchQuality?.repairRounds || 0) ? '补查 ' + task.research.searchQuality.repairRounds : '初始检索') + '</strong></div></div><section class="process-block"><h2>检索迭代记录</h2>' + (roundCards || '<p class="proof-empty">暂无已保存的检索轮次记录。旧任务可能没有逐问题的进度快照。</p>') + '</section><section class="process-block"><h2>逐条检索问题</h2><ol class="process-query-list">' + (queryRows || '<li class="proof-empty">没有查询记录。</li>') + '</ol></section>' + renderCatalogStatus(task) + renderApiUsage(task) + excludedView + repairView + questionTrace + '<details class="process-block"><summary>分析范围、方法与研究假设</summary>' + bodyBlocks(report.scopeAndMethod) + '<ul>' + [...(task.research?.plan?.assumptions || []), ...(report.methodNotes || [])].map((x) => '<li>' + esc(safeNote(x)) + '</li>').join("") + '</ul></details></section>';
  const sourceSidebar = '<aside class="report-source-sidebar"><section class="source-library"><div class="section-heading"><div><h2>来源</h2><small>' + citedSources.length + ' 条引用 · ' + otherSources.length + ' 条其他检索结果</small></div></div><div class="source-grid">' + (citedSources.length ? citedSources.map(sourceCard).join("") : '<p class="proof-empty">暂无关联来源。</p>') + '</div>' + (otherSources.length ? '<details class="other-sources"><summary>其他检索结果（' + otherSources.length + '）</summary><div class="source-grid">' + otherSources.map(sourceCard).join("") + '</div></details>' : '') + '</section></aside>';
  return '<div class="report-layout">' + contents + '<main class="report-main"><div class="report-workspace"><nav class="report-tabs" role="tablist"><button class="report-tab active" data-report-tab="report" role="tab" aria-selected="true">报告 <small>结论与建议</small></button><button class="report-tab" data-report-tab="evidence" role="tab" aria-selected="false">证据核验 <small>' + citedSources.length + ' 条引用</small></button><button class="report-tab" data-report-tab="process" role="tab" aria-selected="false">研究过程 <small>' + roundCount + ' 轮检索</small></button></nav>' + reportPanel + evidencePanel + processPanel + '</div></main>' + sourceSidebar + '</div>';
}
function renderTechnicalCheckpoint(task) {
  const routes=(task.research?.technicalCheckpoint?.routes||[]).map((route,index)=>route?{...route,checkpointIndex:index}:null).filter(Boolean);
  if(task.report || !routes.length)return '';
  const contents='<aside class="report-outline"><nav class="report-contents" aria-label="阶段章节目录"><span>已保存的技术章节</span><div>'+routes.map(route=>'<a href="#report-tech-route-'+(route.checkpointIndex+1)+'"><span>'+String(route.checkpointIndex+1).padStart(2,'0')+'</span>'+esc(route.heading.split(/[：:]/u)[0])+'</a>').join('')+'</div></nav></aside>';
  return '<div class="report-layout checkpoint-layout">'+contents+'<main class="report-main"><article class="report"><section class="quality-notice"><strong>技术章节阶段草稿 · 尚未完成报告验收</strong><p>已保存 '+routes.length+' 个技术主题。原始问题的整合答案和最终独立复核尚未完成，以下内容包含待验证的工程推演，请结合原文复核。</p></section>'+renderTechnology({technologyDeepDives:routes},task.research.plan,true,task.research?.presentationProducts || [],sourceIndex(task))+'</article></main><aside class="report-source-sidebar"><section class="source-library"><h2>本轮来源</h2><p>点击编号或标题核对原文</p><div class="source-grid">'+(task.research.sources || []).map(sourceCard).join('')+'</div></section></aside></div>';
}
function renderTask(task) {
  // Polling replaces parts of the page. Preserve the reader's current chapter
  // and viewport position across that update, without affecting navigation.
  const keepReading=state.current===task.id && ['running','queued','planning'].includes(task.status) && window.scrollY>0;
  const priorY=keepReading?window.scrollY:0;
  const anchors=keepReading?[...document.querySelectorAll('#task-content [id^="report-tech-route-"], #task-content .process-block, #task-content .progress details')]:[];
  const readerAnchor=anchors.filter(node=>node.id&&node.getBoundingClientRect().top<=120).at(-1);
  const anchorId=readerAnchor?.id,anchorTop=readerAnchor?.getBoundingClientRect().top;
  const preservedWaiting=$('#task-content .research-waiting');
  const checkpointKey=JSON.stringify([task.id,task.research?.technicalCheckpoint?.routes,task.research?.sources?.map(source=>[source.id,source.document?.contentHash])]);
  const oldCheckpoint=$('#task-content .checkpoint-layout');
  const preservedCheckpoint=oldCheckpoint?.dataset.snapshot===checkpointKey?oldCheckpoint:null;
  const preservedFocus=preservedWaiting?.contains(document.activeElement)?document.activeElement:null;
  const openDetails=[...document.querySelectorAll('#task-content .progress details[open]')].map(node=>node.querySelector('summary')?.textContent);
  state.current = task.id;
  const status = taskStatus(task);
  const invalid = hasCorruptSearch(task);
  const draft = task.quality?.publishable === false;
  $("#task-actions").innerHTML = invalid ? '<button class="task-action strong" id="repair-plan">重新制定研究计划</button>' : task.status === "completed"
    ? '<button class="task-action" id="copy-link">复制本机链接</button>' + (draft ? '<button class="task-action" id="repair-plan">按新要求重新研究</button>' : '') + '<button class="task-action strong" id="export" data-draft="' + (draft?'1':'0') + '">' + (draft?'下载 Word 草稿':'下载 Word 报告') + '</button>'
    : ['failed','needs_review'].includes(task.status) ? '<button class="task-action" id="repair-plan">重新制定研究计划</button><button class="task-action strong" id="retry">继续研究与核验</button>' + (task.report?'<button class="task-action" id="export" data-draft="1">下载 Word 草稿</button>':'') : "";
  if(task.permissions?.canEdit===false)$('#task-actions').innerHTML=task.report?'<button class="task-action strong" id="export" data-draft="'+(draft?'1':'0')+'">'+(draft?'下载 Word 草稿':'下载 Word 报告')+'</button>':'';
  if(task.permissions?.canShare)$('#task-actions').insertAdjacentHTML('beforeend','<button class="task-action" id="share-task">分享只读报告</button>');
  const primary = task.status === "plan_ready" ? renderPlan(task) : task.report ? renderReport(task) : renderTechnicalCheckpoint(task);
  $("#task-view").classList.toggle("has-report", Boolean(task.report || task.research?.technicalCheckpoint?.routes?.length));
  const heading = task.report ? '' : '<h1 class="task-title">' + esc(task.title) + '</h1><p class="task-sub">' + esc(task.input.subject) + " · " + formatDate(task.createdAt) + " · " + status[0] + '</p>';
  const progress = task.report && ['completed','needs_review'].includes(task.status) && !invalid ? '<details class="completed-progress"><summary><span>' + (draft?'研究内容已保存 · 待验收':'<i>✓</i> 调研已完成') + ' <small>' + formatDate(task.createdAt) + ' · ' + (task.research?.sources?.length || 0) + ' 条公开来源</small></span><span>查看工作流进度 ＋</span></summary>' + renderProgress(task) + '</details>' : renderProgress(task);
  $("#task-content").innerHTML = heading + renderTaskAction(task) + progress + primary;
  const incomingCheckpoint=$('#task-content .checkpoint-layout');
  if(incomingCheckpoint){if(preservedCheckpoint)incomingCheckpoint.replaceWith(preservedCheckpoint);else incomingCheckpoint.dataset.snapshot=checkpointKey;}
  updateTaskFeedback(task,{onOpenTask:async id=>{if(state.current!==id||!$('#task-view').classList.contains('active'))await openTask(id);if(state.current!==id)throw Error('任务已切换，请重新打开。');}});
  mountWaitingRoom(task,{api,preserved:preservedWaiting});
  if(preservedFocus?.isConnected)preservedFocus.focus({preventScroll:true});
  document.querySelectorAll('#task-content .progress details').forEach(node=>{if(openDetails.includes(node.querySelector('summary')?.textContent))node.open=true;});
  if(task.permissions?.canEdit===false){$('#task-content').insertAdjacentHTML('afterbegin','<p class="sharing-readonly">同事分享的只读研究 · 可以阅读与导出，研究修改由创建者操作</p>');document.querySelectorAll('#task-content .followup,#task-content .plan-review,#task-content #retry').forEach(node=>node.remove());}
  highlightReportProducts(task);
  watchReportOutline();
  let size = "standard";
  try { if (localStorage.getItem("insight-reading-size") === "large") size = "large"; } catch {}
  applyReadingSize(size);
  if(keepReading){
    const nextAnchor=anchorId&&document.getElementById(anchorId);
    const target=nextAnchor?window.scrollY+nextAnchor.getBoundingClientRect().top-anchorTop:priorY;
    if(Math.abs(window.scrollY-target)>1)window.scrollTo({top:target,behavior:'instant'});
  }
  if (["running", "queued", "planning"].includes(task.status)) schedulePoll(task.id);
  else clearTimeout(state.poll);
}
function applyReadingSize(size) {
  const layout = $(".report-layout");
  if (layout) layout.dataset.readingSize = size;
  document.querySelectorAll(".reading-tools button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.readingSize === size)));
}
function schedulePoll(id) {
  clearTimeout(state.poll);
  state.poll = setTimeout(async () => {
    try { await refreshTasks(); const task = await api("/api/tasks/" + id); if (state.current === id) renderTask(task); }
    catch (error) { if(state.current===id){setWaitingRoomConnection(false);setTaskFeedbackConnection(false);schedulePoll(id);} }
  }, 1800);
}
export async function openTask(id) {
  try { const task = await api("/api/tasks/" + id); renderTask(task); setView("task"); }
  catch (error) { toast(error.message); }
}
async function startResearch() {
  const button = $("#start-research");
  const plan = {
    analysisFocus: $("#plan-focus").value,
    queries: $("#plan-queries").value.split("\n").map((x) => x.trim()).filter(Boolean),
    questions: $("#plan-questions").value.split("\n").map((x) => x.trim()).filter(Boolean),
    competitors: $("#plan-competitors").value.split("\n").map((x) => x.trim()).filter(Boolean),
  };
  try { plan.queries = validateQueries(plan.queries); } catch (error) { toast(error.message); return; }
  button.disabled = true; button.textContent = "正在启动研究…";
  try { const comparison=readComparisonControls();await api("/api/tasks/" + state.current + "/start", { method: "POST", body: JSON.stringify({ plan,comparison,allowCrossTier:Boolean($('#allow-cross-tier')?.checked) }) }); await openTask(state.current); }
  catch (error) { toast(error.message); button.disabled = false; button.textContent = "确认计划并开始调研"; }
}
$("#research-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  if (!data.subject.trim()) return toast("请填写分析对象。");
  const button = $("#submit-button"); button.disabled = true; button.textContent = "正在生成研究计划…";
  try { const result = await api("/api/tasks", { method: "POST", body: JSON.stringify(data) }); await refreshTasks(); await openTask(result.id); }
  catch (error) { toast(error.message); }
  finally { button.disabled = false; button.innerHTML = '生成研究计划 <b>↗</b>'; }
});
document.addEventListener("click", async (event) => {
  if(event.target.closest('#share-task')){await openTaskSharing(api,state.current);return;}
  const chapterLink = event.target.closest('.report-contents a, .dashboard-kpis a[href^="#report-"]');
  if (chapterLink) {
    const chapter = document.getElementById(chapterLink.getAttribute("href").slice(1));
    if (chapter) {
      event.preventDefault();
      document.querySelector('[data-report-tab="report"]')?.click();
      if (chapter.tagName === "DETAILS") chapter.open = true;
      chapter.scrollIntoView({ block: "start", behavior: "auto" });
      document.querySelectorAll('.report-outline a').forEach((link) => link.classList.toggle('is-active', link === chapterLink));
    }
    return;
  }
  const readingButton = event.target.closest("button[data-reading-size]");
  if (readingButton) {
    const size = readingButton.dataset.readingSize === "large" ? "large" : "standard";
    applyReadingSize(size);
    try { localStorage.setItem("insight-reading-size", size); } catch {}
    return;
  }
  const sourceLink = event.target.closest('a[href^="#source-"]');
  if (sourceLink) {
    const source = document.getElementById(decodeURIComponent(sourceLink.getAttribute("href").slice(1)));
    if (source) {
      event.preventDefault();
      const collapsed = source.closest("details"); if (collapsed) collapsed.open = true;
      document.querySelectorAll(".source.is-selected").forEach((el) => el.classList.remove("is-selected"));
      source.classList.add("is-selected");
      const sidebar = source.closest(".report-source-sidebar");
      if (sidebar && getComputedStyle(sidebar).position === "sticky") {
        const headingHeight = sidebar.querySelector(".section-heading")?.offsetHeight || 0;
        const top = source.getBoundingClientRect().top - sidebar.getBoundingClientRect().top + sidebar.scrollTop - headingHeight - 12;
        sidebar.scrollTo({ top: Math.max(0, top), behavior: "auto" });
      } else source.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
    return;
  }
  const reportTab = event.target.closest("[data-report-tab]");
  if (reportTab) {
    const selected = reportTab.dataset.reportTab;
    document.querySelectorAll(".report-tab").forEach((button) => { const active = button === reportTab; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
    document.querySelectorAll(".report-panel").forEach((panel) => panel.classList.toggle("active", panel.id === "report-panel-" + selected));
    return;
  }
  const taskCard = event.target.closest("[data-task]");
  if (taskCard) { await openTask(taskCard.dataset.task); return; }
  if (event.target.closest("#nav-home") || event.target.closest("#new-task") || event.target.closest("#back-home")) { setView("home"); return; }
  if (event.target.closest("#nav-history")) { await refreshTasks(); renderHistory(); setView("history"); return; }
  if (event.target.closest("#help")) { $("#modal").classList.remove("hidden"); return; }
  if (event.target.closest("#close-modal") || event.target.id === "modal") { $("#modal").classList.add("hidden"); return; }
  if (event.target.closest("#fill-example")) {
    $("#subject").value = "便携储能行业的 pack 方式、痛点解决及技术原理";
    $("#baselineProduct").value = "";$("#baselineProduct").dispatchEvent(new Event("change",{bubbles:true}));
    $("#scenario").value = "户外作业与家庭应急备电";
    $("#questions").value = "比较不同 pack 结构与电池路线如何影响能量密度、安全、寿命和可维护性；各竞品解决了哪些痛点；我方产品与竞品相比的主要差距和优先改进方向是什么？";
    $("#competitors").value = "正浩、Jackery、Anker";
    $("#metrics").value = "电池容量、持续/峰值功率、充电时间、电芯与安全、重量、扩展能力、价格、质保";
    $("#timeRange").value = "近三年，优先最新资料";
    toast("案例已填入；请把自家产品名称替换为实际型号。"); return;
  }
  if (event.target.closest("#deepen-research")) {
    try { const result = await api("/api/tasks/" + state.current + "/followup", {method: "POST", body: JSON.stringify({request: "保持本次原始需求和已确认的分析侧重点，按未回答的问题补充研究，逐一对比准确厂商型号及自家基准，保留原文证据和未知边界。仅在原始需求明确指定百分比时遵循该比例。"})}); await refreshTasks(); await openTask(result.id); } catch (error) { toast(error.message); } return;
  }
  if (event.target.closest("#start-research")) { await startResearch(); return; }
  if (event.target.closest("#repair-plan")) {
    const button = event.target.closest("#repair-plan"); button.disabled = true;
    try { const result = await api("/api/tasks/" + state.current + "/replan", { method: "POST", body: "{}" }); await refreshTasks(); await openTask(result.id); toast("已保留原始记录，正在重新制定研究计划。"); }
    catch (error) { toast(error.message); button.disabled = false; }
    return;
  }
  if (event.target.closest("#retry")) {
    try { await api("/api/tasks/" + state.current + "/retry", { method: "POST", body: "{}" }); await openTask(state.current); }
    catch (error) { toast(error.message); }
    return;
  }
  if (event.target.closest("#export")) {
    const draft=event.target.closest('#export').dataset.draft==='1',id=state.current;
    try {const task=await api('/api/tasks/'+id);openExportDialog({task,onExport:async selection=>{
      const params=new URLSearchParams({sections:selection.sections.join(','),topics:selection.topicIndexes.join(',')});if(draft)params.set('draft','1');
      const blob=await api('/api/tasks/'+id+'/export.docx?'+params),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=draft?'竞品分析_所选章节_待核验稿.docx':'竞品分析_所选章节.docx';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('所选章节的 Word 文件已开始下载。');
    }});}catch(error){toast(error.message);}return;
  }
  if (event.target.closest("#copy-link")) {
    try { await navigator.clipboard.writeText(location.origin + location.pathname + "#task=" + state.current); toast("已复制当前浏览器的报告链接；其他电脑请通过导出文件分享。"); }
    catch { toast("复制失败，请从地址栏复制链接。"); }
    return;
  }
  if (event.target.closest("#follow-button")) {
    const input = $("#follow-input"); if (!input.value.trim()) return toast("请填写要补充研究的问题。");
    try { const result = await api("/api/tasks/" + state.current + "/followup", { method: "POST", body: JSON.stringify({ request: input.value }) }); await refreshTasks(); await openTask(result.id); toast("已创建补充调研任务。"); }
    catch (error) { toast(error.message); }
  }
});
function watchReportOutline() {
  state.outlineObserver?.disconnect();
  const links = [...document.querySelectorAll('.report-outline a')];
  const sections = links.map((link) => document.getElementById(link.hash.slice(1))).filter(Boolean);
  if (!sections.length || typeof IntersectionObserver === 'undefined') return;
  state.outlineObserver = new IntersectionObserver(() => {
    const visible = sections.filter((section) => section.getClientRects().length && section.getBoundingClientRect().top <= 150);
    const current = visible.at(-1) || sections[0];
    for (const link of links) { const active = link.hash === '#' + current.id; link.classList.toggle('is-active', active); if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); }
  }, {rootMargin:'-70px 0px -65% 0px',threshold:[0,1]});
  sections.forEach((section) => state.outlineObserver.observe(section));
}
function updateServiceStatus(config) {
    const ready = config.modelReady && config.searchReady;
    const searchName = config.searchProvider === "deepseek" ? "DeepSeek Search" : "Tavily";
    $("#service-status").textContent = ready ? "AI 与 " + searchName + " 已配置 · " + config.model :
      "待配置服务（模型 " + (config.modelReady ? "就绪" : "缺密钥") + " · " + searchName + " " + (config.searchReady ? "就绪" : "缺密钥") + "）";
    $("#service-dot").classList.toggle("off", !ready);
}
async function initialize() {
  try {
    updateServiceStatus(await api("/api/config"));
  } catch { $("#service-status").textContent = "无法连接本机服务"; $("#service-dot").classList.add("off"); }
  await refreshTasks();
  const match = location.hash.match(/task=([\w-]+)/);
  if (match && state.tasks.some((task) => task.id === match[1])) await openTask(match[1]);
}
setupProductComparison();
setupReportReview({api,onRevision:async id=>{await refreshTasks();await openTask(id);}});setupComparisonBrief();setupComparisonActions({api,getTask:()=>api('/api/tasks/'+state.current)});
const access=setupAccess({api,onAuthenticated:initialize,onSignedOut:()=>{sessionEpoch++;clearTimeout(state.poll);stopWaitingRoom();clearTaskFeedback();state.outlineObserver?.disconnect();state.tasks=[];state.current=null;$('#task-content').replaceChildren();$('#task-actions').replaceChildren();renderSidebar();document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());setView('home');}});
access.start().catch(error=>toast(error.message));
import('./settings.js?v=0d401f7edfb044fc').then(({ setupServiceSettings }) => setupServiceSettings({ api, onConfig: updateServiceStatus })).catch(() => toast('服务配置窗口加载失败，请刷新页面。'));
