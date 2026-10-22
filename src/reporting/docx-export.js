import {Buffer} from '../browser/shims/buffer.js';
import { deflateRawSync } from "../browser/shims/zlib.js";
import {metricPresentation} from '../domain/evidence/metric-presentation.js';
import {metricDefinition} from '../domain/evidence/metric-schema.js';
import {visibleComparisonRows} from '../../public/comparison-visibility.js';
import {sameProduct} from '../domain/evidence/product-registry.js';
import {metricLabels} from '../../public/metric-labels.js';
import {reviewChecklist} from '../domain/evidence/review-checklist.js';
import {boundaryPresentation} from '../domain/evidence/boundary-presentation.js';
import {sourceDisplayTitle} from '../domain/evidence/source-presentation.js';
import {resolveExportSelection} from '../../public/report-sections.js';
import {highlightSegments,topicProductReferences} from '../../public/product-highlights.js';
import {presentationProductsForTask} from '../domain/evidence/product-registry.js';
import {qualifyStructuredContent} from '../../public/product-labels.js';

const xml = (value) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
function plain(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).replace(/\[object Object\]/g, "未结构化内容");
  if (Array.isArray(value)) return value.map(plain).filter(Boolean).join("；");
  return [value.text || value.description || value.value || value.note || "", value.unit || ""].map(plain).filter(Boolean).join(" ");
}
function zip(files) {
  const local = [], central = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const n = Buffer.from(name), src = Buffer.from(content), zipped = deflateRawSync(src);
    let crc = -1;
    for (const byte of src) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    crc = (crc ^ -1) >>> 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50,0); h.writeUInt16LE(20,4); h.writeUInt16LE(0x0800,6); h.writeUInt16LE(8,8); h.writeUInt32LE(crc,14); h.writeUInt32LE(zipped.length,18); h.writeUInt32LE(src.length,22); h.writeUInt16LE(n.length,26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50,0); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt16LE(0x0800,8); c.writeUInt16LE(8,10); c.writeUInt32LE(crc,16); c.writeUInt32LE(zipped.length,20); c.writeUInt32LE(src.length,24); c.writeUInt16LE(n.length,28); c.writeUInt32LE(offset,42);
    local.push(h,n,zipped); central.push(c,n); offset += h.length + n.length + zipped.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(Object.keys(files).length,8); end.writeUInt16LE(Object.keys(files).length,10); end.writeUInt32LE(central.reduce((sum,b) => sum+b.length,0),12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,...central,end]);
}

export function makeDocx(task,options={}) {
  const selection=resolveExportSelection(task,options),selected=new Set(selection.sections);
  const report = task.report || {}, evidence = task.evidence || {}, sources = task.research?.sources || [];
  const products=task.research?.presentationProducts || presentationProductsForTask(task);
  const sourceMap=new Map(sources.map(source=>[source.id,source]));
  const sourceIds = new Set(sources.map((s) => s.id));
  const relationships = [], body = []; let bookmarkId = 0;
  const run = (text, properties = "") => '<w:r><w:rPr>' + properties + '</w:rPr><w:t xml:space="preserve">' + xml(text) + '</w:t></w:r>';
  const highlighted=(text,properties='')=>highlightSegments(text,products).map(part=>run(part.text,properties+(part.highlight?'<w:b/><w:shd w:fill="EAF1F8"/>':''))).join('');
  const link = (text, url) => {
    try { const target = new URL(url); if (!/^https?:$/.test(target.protocol) || target.username || target.password) return run(text);
      const id = "url" + (relationships.length + 1); relationships.push({ id, url: target.href });
      return '<w:hyperlink r:id="' + id + '">' + run(text, '<w:rStyle w:val="Hyperlink"/>') + '</w:hyperlink>';
    } catch { return run(text); }
  };
  const inline = (value, properties = "") => {
    const text = plain(value); let result = "", cursor = 0;
    const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\bS\d+\b/g;
    for (const match of text.matchAll(pattern)) {
      result += highlighted(text.slice(cursor, match.index), properties);
      if (match[1]) result += highlighted(match[1], properties + '<w:b/>');
      else if (match[3]) result += link(match[2], match[3]);
      else if (sourceIds.has(match[0])) result += selected.has('sources')?'<w:hyperlink w:anchor="src_' + xml(match[0]) + '">' + run(match[0], '<w:rStyle w:val="Hyperlink"/>') + '</w:hyperlink>':link(match[0],sourceMap.get(match[0]).url);
      else result += run(match[0], properties);
      cursor = match.index + match[0].length;
    }
    return result + highlighted(text.slice(cursor), properties);
  };
  const p = (text, style = "Normal", extra = "") => '<w:p><w:pPr><w:pStyle w:val="' + style + '"/>' + extra + '</w:pPr>' + inline(text) + '</w:p>';
  const paragraph = (text, style = "Normal") => {
    for (const line of plain(text).split(/\r?\n/).filter(Boolean)) body.push(p(line, style));
  };
  const heading = (text, level = 1) => { if (plain(text)) body.push(p(plain(text), "Heading" + level)); };
  const bullets = (items, ordered = false) => (Array.isArray(items) ? items : items ? [items] : []).forEach((item, i) => {
    const value = typeof item === "object" && item ? item.text || item.description || item.note || plain(item) : item;
    const text=ordered?plain(value).replace(/^(?:步骤\s*\d+\s*[：:.、]|\d+\s*[.、])\s*/u,''):plain(value);
    body.push(p((ordered ? (i + 1) + ". " : "• ") + text, "Normal", '<w:ind w:left="280" w:hanging="280"/>'));
  });
  const refs = (ids) => { const known = [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => sourceIds.has(id)); if (known.length) paragraph("来源：" + known.join(" / "), "Caption"); };
  const table = (columns, rows,preferredWidths=null) => {
    if (!Array.isArray(columns) || !columns.length || !Array.isArray(rows)) return;
    // Split wide comparison datasets into consistent groups; every table keeps its row label.
    const groups = [];
    if (columns.length <= 4) groups.push(columns.map((_, i) => i));
    else for (let offset = 1; offset < columns.length; offset += 3) groups.push([0, ...columns.slice(offset, offset + 3).map((_, i) => offset + i)]);
    for (const indices of groups) {
      const count = indices.length, widths = preferredWidths?.length===count?preferredWidths:indices.map((_, i) => i === 0 && count > 2 ? 1800 : Math.floor((9638 - (count > 2 ? 1800 : 0)) / (count > 2 ? count - 1 : count)));
      const cell = (value, i, header, even) => '<w:tc><w:tcPr><w:tcW w:w="' + widths[i] + '" w:type="dxa"/><w:shd w:fill="' + (header ? "E7EEF5" : even ? "F7F9FB" : "FFFFFF") + '"/><w:vAlign w:val="center"/></w:tcPr>' + p(value, header ? "TableHead" : "TableText") + '</w:tc>';
      const row = (values, header, even) => '<w:tr><w:trPr><w:cantSplit/>' + (header ? '<w:tblHeader/>' : '') + '</w:trPr>' + indices.map((index, i) => cell(values[index] ?? "", i, header, even)).join("") + '</w:tr>';
      body.push('<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>' + ["top","left","bottom","right","insideH","insideV"].map((side) => '<w:' + side + ' w:val="single" w:sz="4" w:color="D9D9D9"/>').join("") + '</w:tblBorders><w:tblCellMar><w:top w:w="110" w:type="dxa"/><w:left w:w="125" w:type="dxa"/><w:bottom w:w="110" w:type="dxa"/><w:right w:w="125" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + widths.map((w) => '<w:gridCol w:w="' + w + '"/>').join("") + '</w:tblGrid>' + row(columns, true, false) + rows.map((values, i) => row(Array.isArray(values) ? values : [plain(values)], false, i % 2 === 1)).join("") + '</w:tbl><w:p/>');
    }
  };
  const blocks = (value, level = 2) => {
    if (Array.isArray(value)) { for (const item of value) blocks(item, level); return; }
    if (typeof value === "string") {
      for (const line of value.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const h = line.match(/^#{1,5}\s+(.+)/), point = line.match(/^\s*[-*]\s+(.+)/);
        if (h) heading(h[1], level); else if (point) bullets([point[1]]); else paragraph(line);
      }
      return;
    }
    if (!value || typeof value !== "object") { if (value != null) paragraph(value); return; }
    heading(value.heading || value.title || "", level);
    paragraph(value.lead || "");
    if (value.points || value.items || value.bullets) bullets(value.points || value.items || value.bullets);
    if (value.text) paragraph(value.text);
    if (value.table) table(value.table.columns, value.table.rows);
  };
  paragraph(task.title || "研发技术调研报告", "Title");
  if (task.quality && !task.quality.publishable) {
    paragraph("待核验草稿 尚未通过研发验收", "Subtitle");
    paragraph('完整报告有'+(task.quality.issues || []).length+'项验收缺口。'+(selected.has('review')?'详见附录“核验状态”。':'本文件未包含核验附录，完整状态请在应用内查看。')+'选择章节不改变报告质量状态，未经核验的内容不宜用于定量选型。','Caption');
  }
  paragraph("生成日期 " + (report.generatedAt || task.updatedAt || "").slice(0, 10) + "    公开来源 " + sources.length + " 条", "Subtitle");
  if(selection.isExcerpt)paragraph('节选导出 · '+selection.catalog.filter(section=>selected.has(section.id)).map(section=>section.label).join('、')+(selected.has('technology')&&report.technologyDeepDives?.length?'；技术主题 '+selection.topicIndexes.map(index=>report.technologyDeepDives[index].heading).join('、'):''),'Caption');
  if(selected.has('summary')){heading("核心结论"); blocks(report.executiveSummary);}
  if(selected.has('findings')) {
  heading("关键问题与结论");
  for (const [i, item] of (report.userQuestionAnswers?.length?report.userQuestionAnswers:report.questionAnswers?.length?report.questionAnswers:report.keyFindings || []).entries()) {
    heading(item.question || "研究发现 " + (i + 1), 2);
    paragraph("【" + (item.kind || item.status || "研究发现") + "】" + (item.text || item.answer || ""));
    if (item.implication) paragraph("工程意义：" + item.implication);
    refs(item.citations);
  }
  }
  const technicalStart=body.length;
  if(selected.has('technology')) {
  heading("技术方案与路线");
  const routes = report.technologyDeepDives;
  if (Array.isArray(routes) && routes.length) for (const route of routes.filter((_,index)=>selection.topicIndexes.includes(index))) {
    heading(route.heading, 2); paragraph(route.implementationBasis === "documented" ? "依据公开资料" : "工程推演 需验证", "Caption"); paragraph(route.lead);
    const mappings=topicProductReferences(route,products);
    if(mappings.structured){heading('方案与具体型号对应',3);paragraph('技术采用关系与已收录规格分开核对；技术结构未知不表示容量、额定功率没有记录。','Caption');table(['厂商 / 型号与已收录规格','该技术方案及采用关系','相对基准的意义'],mappings.items.map(item=>[item.product.display+(item.product.baseline?'（基准）':'')+(item.product.catalogRecords||[]).slice(0,3).map(record=>'\n规格库 '+record.regions.join('/')+'：'+[record.capacityWh?record.capacityWh+' Wh':'',record.ratedPowerW?record.ratedPowerW+' W':''].filter(Boolean).join(' / ')+'；部门整理，保留地区与日期 ['+record.sourceId+']').join(''),({documented:'有原文依据 · 仍须结合核验',proposal:'待验证设计选项',unknown:'该技术采用关系尚未证实'}[item.adoptionStatus] || '待核验')+'\n'+item.summary+(item.sourceIds?.length?'\n来源：'+item.sourceIds.join(' / '):''),item.comparisonImplication]),[2300,3800,3538]);for(const item of mappings.items)if(item.evidence?.length){heading(item.product.display+' · 证据摘录',3);for(const quote of item.evidence){paragraph('“'+quote.quote+'”');refs([quote.sourceId]);}}}
    else if(mappings.items.length)paragraph('正文提及（采用关系待核验）：'+mappings.items.map(product=>product.display).join(' / '),'Caption');
    if(route.designProblem) paragraph('设计问题：'+route.designProblem);
    if(route.systemPath) {heading('系统路径',3);for(const path of route.systemPath.split(/[；;]\s*/u).filter(Boolean))paragraph(path);}
    for (const [key, name] of [["principle","工作原理"],["architecture","系统构成与接口"],["implementation","实现步骤"],["tradeoffs","设计取舍与适用条件"],["validation","验证方法与失效模式"]]) {
      if(key==='tradeoffs'&&route.designDecisions?.length) {heading(name,3);table(['适用条件','收益与代价','选型建议'],route.designDecisions.map((item)=>[item.condition,'收益：'+item.benefit+'\n代价：'+item.cost,item.decision]),[2300,3800,3538]);continue;}
      if(key==='validation'&&route.validationPlan?.length) {heading(name,3);table(['失效与工况','测量方法','判据及依据'],route.validationPlan.map((item)=>[item.failureMode+'；'+item.conditions,item.measurement,item.criterion+'；依据：'+item.basis]),[3000,2600,4038]);continue;}
      heading(name, 3); bullets(route[key], key === "implementation");
    }
    refs(route.sourceIds);
    if (route.knownLimits?.length) { heading("证据边界与待验证项", 3); bullets(route.knownLimits); }
  } else blocks(report.technologyOverview);
  }
  const deferredTechnology=(task.research?.contract?.focus || report.analysisFocus)?.mode==='product'?body.splice(technicalStart):[];
  const rows = visibleComparisonRows(evidence.competitorRows||[],row=>sameProduct(row.competitor,task.input.baselineProduct));
  if (selected.has('comparison')&&rows.length) {
    heading("产品与竞品指标矩阵");
    if(evidence.comparisonScope)paragraph('当前比较口径 '+evidence.comparisonScope.region+'市场裸机。其他地区、套装、翻新和附件观察值单独保存，不与本组参数混用。','Caption');
    const metrics = metricLabels(rows.flatMap(row=>(row.metricValues||[]).map(v=>v.metric)));
    for(const row of rows)if(row.comparisonEligibility?.status&&row.comparisonEligibility.status!=='comparable')paragraph(row.competitor+'：跨档或待核实参考，不参与同档排名；'+row.comparisonEligibility.reason,'Caption');
    if (metrics.length) {
      table(["指标", ...rows.map((row) => row.competitor)], metrics.map((metric) => [metricDefinition(metric).label, ...rows.map((row) => {
        const value = row.metricValues?.find((v) => v.metric === metric);
        if (!value) return "本轮未找到";
        const presentation=metricPresentation(value);
        const label = presentation.label + (presentation.formula?'；公式：'+presentation.formula:'');
        const sourceIds=presentation.sourceIds||value.sourceIds;
        return label + (presentation.state==='curated'?'（部门整理，保留地区与日期；'+(presentation.detail||'')+'）':value.basis === "team_catalog" ? "（部门整理值）" : "") + (sourceIds?.length ? " [" + sourceIds.join(" / ") + "]" : "");
      })]));
      paragraph("本轮未找到表示当前已检索来源中未取得该指标；数据不可比表示测试条件、版本或口径不一致。", "Caption");
    } else for (const row of rows) { heading(row.competitor, 2); paragraph(row.technology); paragraph(row.specifications); paragraph(row.applications); paragraph(row.unknowns); refs(row.evidenceIds); }
  }
  for (const [id,name, value] of [["applications","产品与应用",report.productApplications],["baseline","对自家产品的启示",report.baselineImplications],["trends","技术与产品趋势",report.trends],["risks","机会与风险",report.opportunitiesAndRisks],["recommendations","建议与优先级",report.recommendations]]) if (selected.has(id)&&value) { heading(name); blocks(qualifyStructuredContent(value,products)); }
  body.push(...deferredTechnology);
  if(selected.has('methods')){heading("附录 分析范围与方法"); blocks(report.scopeAndMethod); bullets(report.methodNotes);}
  if(report.manualRevisions?.length){heading('用户复核修订记录');paragraph('以下内容由用户提交，尚未独立核验。');for(const revision of report.manualRevisions){heading(revision.subject,2);paragraph(revision.note);paragraph('复核记录：'+revision.quote);paragraph('[复核资料原文]('+revision.sourceUrl.replace(/\)/g,'%29')+')');}}
  if(selected.has('limits')){const checklist=task.reviewChecklist||reviewChecklist(task);if(checklist.length){heading('应用前复核清单');for(const item of checklist){heading(item.subject,2);paragraph('涉及结论：'+item.statement);paragraph('待确认：'+item.reason);paragraph('复核动作：'+item.action);for(const source of item.sources)paragraph('['+source.title.replace(/[\[\]]/g,'')+']('+source.url.replace(/\)/g,'%29')+')');}}}
  if(selected.has('review')&&task.quality&&!task.quality.publishable){heading('附录 核验状态');bullets((task.quality.issues || []).map((issue)=>issue.message));}
  if(selected.has('questions')&&report.userQuestionAnswers?.length) {heading('附录 扩展研究问题与答案');for(const answer of report.questionAnswers || []){heading(answer.question,2);paragraph(answer.text || answer.answer);refs(answer.citations);}}
  const boundaries=boundaryPresentation(evidence,task.research || {},report);
  if(selected.has('methods')&&(boundaries.current.length||boundaries.raw.conflicts.length||boundaries.raw.gaps.length)) {
    heading('附录 资料边界与待核实');
    for(const item of boundaries.current){paragraph(item.kind+'：'+item.message);refs(item.sourceIds);}
    paragraph(boundaries.note,'Caption');
    paragraph('本机研究过程保留'+boundaries.raw.conflicts.length+'条批次冲突备注与'+boundaries.raw.gaps.length+'条批次缺口备注，供回溯核对。','Caption');
  }
  if(selected.has('sources'))heading("来源清单");
  for (const source of selected.has('sources')?sources:[]) {
    let domain = "原始来源"; try { domain = new URL(source.url).hostname; } catch {}
    const bookmark = ++bookmarkId;
    body.push('<w:p><w:pPr><w:pStyle w:val="SourceTitle"/></w:pPr><w:bookmarkStart w:id="' + bookmark + '" w:name="src_' + xml(source.id) + '"/>' + inline("[" + source.id + "] " + sourceDisplayTitle(source)) + '<w:bookmarkEnd w:id="' + bookmark + '"/></w:p>');
    body.push('<w:p><w:pPr><w:pStyle w:val="SourceMeta"/></w:pPr>' + link("打开原文 · " + domain, source.url) + run("    发布 " + (source.publishedAt || "未注明").slice(0,10) + "    检索 " + (source.retrievedAt || "未注明").slice(0,10)) + '</w:p>');
    if (source.provider === "team_catalog") { paragraph("部门整理记录 复核日期 " + (source.catalogVerifiedDate || "未注明"), "SourceMeta"); if (source.officialUrl) body.push('<w:p>' + link("核对官网", source.officialUrl) + '</w:p>'); }
  }
  const style = (id, size, bold = false, spacing = 150, extra = "") => '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + id + '"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="' + spacing + '" w:line="350" w:lineRule="auto"/>' + extra + '</w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/><w:color w:val="000000"/><w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>' + (bold ? '<w:b/>' : '') + '</w:rPr></w:style>';
  const styles = '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/><w:sz w:val="24"/><w:color w:val="000000"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="150" w:line="350"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:widowControl/></w:pPr></w:style>' + style("Title",44,true,260,'<w:keepNext/>') + style("Subtitle",20,false,240) + [1,2,3].map((n) => style("Heading"+n,[34,28,25][n-1],true,160,'<w:keepNext/><w:keepLines/><w:outlineLvl w:val="'+(n-1)+'"/>').replace('<w:spacing ', '<w:spacing w:before="240" ')).join("") + style("Caption",20,false,160) + style("TableText",21,false,70) + style("TableHead",21,true,70,'<w:keepNext/>') + style("SourceTitle",22,true,60,'<w:keepNext/>') + style("SourceMeta",19,false,190) + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="245C87"/><w:u w:val="single"/></w:rPr></w:style></w:styles>';
  const document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' + body.join("") + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>';
  return zip({
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": document, "word/styles.xml": styles,
    "word/_rels/document.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + relationships.map(({id,url}) => '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' + xml(url) + '" TargetMode="External"/>').join("") + '</Relationships>',
  });
}
