export function sourceDisplayTitle(source) {
  let title=String(source.title || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  if(!title||/^(?:we value your privacy|privacy policy|cookie consent|access denied)$/i.test(title)) {
    try {title=decodeURIComponent(new URL(source.url).pathname.split('/').filter(Boolean).at(-1) || '').replace(/[-_]+/g,' ');}catch{}
  }
  const halves=title.split(' - ');
  if(halves.length===2&&halves[0]===halves[1])title=halves[0];
  return title || '公开资料原文';
}
