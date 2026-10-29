import { createHash } from '../../browser/shims/crypto.js?v=6cfce723d0abd3f5';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function canonicalSourceUrl(value) {
  const url = new URL(value);
  if (!/^#(?:\/|!)/.test(url.hash)) url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(?:fbclid|gclid|_pos|_sid|_ss)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
export function documentIdentity(value) {
  const url = new URL(value), host = url.hostname.toLowerCase();
  const arxiv = /(?:^|\.)arxiv\.org$/.test(host) && /\/(?:pdf|abs|html)\/((?:\d{4}\.\d{4,5}|[a-z-]+\/\d{7}))(v\d+)?(?:\.pdf)?\/?$/i.exec(url.pathname);
  if (arxiv) return { documentId:'arxiv:'+arxiv[1].toLowerCase(), revision:arxiv[2] || 'unspecified' };
  const patent = host === 'patents.google.com' && /^\/patent\/([A-Z]{2}\d+[A-Z]\d?)/i.exec(url.pathname);
  if (patent) return { documentId:'patent:'+patent[1].toUpperCase(), revision:url.pathname.split('/')[3] || 'unspecified' };
  if (/^(?:dx\.)?doi\.org$/.test(host)) {let doi=url.pathname.slice(1);try{doi=decodeURIComponent(doi);}catch{}return {documentId:'doi:'+doi.toLowerCase(),revision:'unspecified'};}
  return {documentId:'url:'+digest(canonicalSourceUrl(value)).slice(0,24),revision:'unspecified'};
}
const unescapeHtml = (text) => text.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[\da-f]+|\d+);/gi, (token) => {
  const entities = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
  if (entities[token.toLowerCase()] !== undefined) return entities[token.toLowerCase()];
  const n = token[2].toLowerCase() === 'x' ? parseInt(token.slice(3,-1),16) : parseInt(token.slice(2,-1),10);
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
});
const htmlText = (text) => unescapeHtml(text.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const cells = (line) => line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map((cell)=>cell.trim().replace(/\\\|/g,'|'));

// This parser deliberately handles simple tables only. Spans and malformed rows remain ambiguous.
export function parseSourceDocument(raw) {
  const limited = raw.slice(0,1500000), blocks = [];
  let content = limited, htmlTables = [];
  const isHtml = /<(?:html|body|article|table|p|h[1-6])(?:\s|>)/i.test(limited);
  if (isHtml) {
    content = limited.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
    content = content.replace(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi,(table)=> {
      const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map((row)=>[...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]\s*>/gi)].map((cell)=>htmlText(cell[1])));
      const header = rows[0] || [], ambiguous = /(?:rowspan|colspan)\s*=/i.test(table) || /<table\b[\s\S]*<table\b/i.test(table) || !/<th\b/i.test(table) || rows.some((row)=>row.length!==header.length);
      const marker = `SOURCE_TABLE_${htmlTables.length}_END`;
      htmlTables.push({header,rows:rows.slice(1),ambiguous});
      return '\n\n'+marker+'\n\n';
    });
    content = content.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi,(_,level,text)=>'\n\n'+'#'.repeat(Number(level))+' '+htmlText(text)+'\n\n')
      .replace(/<\/(?:p|div|section|article|li)>/gi,'\n\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'');
    content = unescapeHtml(content);
  }
  const lines = content.replace(/\r\n?/g,'\n').split('\n');
  let heading = '', paragraph = [], paragraphStart = 0;
  const push = (block) => blocks.push({...block,id:'B'+(blocks.length+1),heading});
  const flush = () => { if (paragraph.length) push({kind:'paragraph',text:paragraph.join('\n'),line:paragraphStart+1}); paragraph=[]; };
  for (let index=0;index<lines.length;index++) {
    const line=lines[index];
    const marker=/^\s*SOURCE_TABLE_(\d+)_END\s*$/.exec(line);
    if (marker) {
      flush(); const table=htmlTables[Number(marker[1])];
      if (table) push({kind:'table',...table,text:[table.header,...table.rows].map((row)=>'| '+row.join(' | ')+' |').join('\n'),line:index+1});
      continue;
    }
    if (/^\s*#{1,6}\s/.test(line)) { flush(); heading=line.replace(/^\s*#{1,6}\s+/,'').trim(); push({kind:'heading',text:line,line:index+1}); continue; }
    if (line.includes('|') && index+1<lines.length && cells(lines[index+1]).length>=2 && cells(lines[index+1]).every((cell)=>/^:?-{3,}:?$/.test(cell))) {
      flush(); const start=index, header=cells(line), rows=[];
      index+=2;
      while(index<lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(cells(lines[index++]));
      index--;
      push({kind:'table',header,rows,ambiguous:rows.some((row)=>row.length!==header.length),text:lines.slice(start,index+1).join('\n'),line:start+1});
      continue;
    }
    if (!line.trim()) flush(); else { if (!paragraph.length) paragraphStart=index; paragraph.push(line); }
  }
  flush();
  return {format:isHtml?'html':blocks.some((block)=>block.kind==='table')?'markdown':'text',parseStatus:limited.length<raw.length?'truncated':'parsed',blocks};
}

export function enrichSource(source) {
  const content = typeof source.content==='string'?source.content:'';
  const contentHash=digest(content);
  if (source.document?.contentHash===contentHash) return source;
  const identity=documentIdentity(source.url);
  return {...source,document:{...identity,canonicalUrl:canonicalSourceUrl(source.url),contentHash,...parseSourceDocument(content)}};
}
export function independentDocumentCount(sources) {
  // Identical substantial bodies on mirrors do not constitute independent evidence.
  const parent=new Map(), root=(key)=>{let id=key;while(parent.has(id))id=parent.get(id);return id;};
  const contentOwners=new Map(), ids=new Set();
  for (const source of sources) {
    const page=enrichSource(source), id=page.document.documentId;
    ids.add(id);
    if ((page.content || '').length<500 || page.contentKind!=='page_content') continue;
    const key=page.document.contentHash, owner=contentOwners.get(key);
    if (owner && root(owner)!==root(id)) parent.set(root(id),root(owner)); else contentOwners.set(key,id);
  }
  return new Set([...ids].map(root)).size;
}

export function selectDocumentContext(source, keywords, budget) {
  const page=enrichSource(source), selected=[];
  const score=(block)=>keywords.reduce((sum,word)=>sum+Number((block.heading+' '+block.text).toLowerCase().includes(word)),0);
  let used=0;
  const blocks=[...page.document.blocks].sort((a,b)=>score(b)-score(a) || a.line-b.line);
  for (const block of blocks) {
    if (used>=budget) break;
    if (block.text.length+used+(selected.length?2:0)<=budget) {selected.push(block);used+=block.text.length+(selected.length>1?2:0);continue;}
    // Never slice through a table or detach its cells from the headers.
    if (block.kind==='table') continue;
    const remaining=budget-used-(selected.length?2:0);
    if (remaining>=120 && (score(block)>0||!selected.length)) {selected.push({...block,text:block.text.slice(0,remaining),truncated:true});used=budget;}
  }
  selected.sort((a,b)=>a.line-b.line);
  return {blocks:selected,content:selected.map((block)=>block.text).join('\n\n'),omittedTables:page.document.blocks.filter((block)=>block.kind==='table'&&!selected.some((item)=>item.id===block.id)).map((block)=>block.id),document:page.document};
}
