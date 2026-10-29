import {makeDocx} from '../reporting/docx-export.js?v=6cfce723d0abd3f5';
import {exportOptionsFromUrl} from '../../public/report-sections.js?v=6cfce723d0abd3f5';

const maxBytes=4*1024*1024, ttlDays=30;
const defaultService='https://insightlab-report-share.tech-insight-research.workers.dev';
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const unb64=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));
function endpoint(value){const u=new URL(value);if(u.protocol!=='https:'||!u.hostname.endsWith('.workers.dev')||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)throw Error('分享服务地址必须是 Cloudflare workers.dev HTTPS 根地址。');return u.origin;}
const safeCopy=(value,redact)=>JSON.parse(redact(JSON.stringify(value,(key,item)=>/^(?:DEEPSEEK_API_KEY|OPENAI_API_KEY|TAVILY_API_KEY|api[_-]?key|authorization|password|token)$/i.test(key)?undefined:item)));
function reportSnapshot(task,redact){
  if(!task?.report||!['completed','needs_review','failed','running','queued','planning'].includes(task.status))throw Error('只能分享已有报告的任务。');
  const research=task.research||{};
  const inProgress=['running','queued','planning'].includes(task.status);
  const quality=inProgress?{...(task.quality||{}),status:'needs_review',publishable:false,issues:[...(task.quality?.issues||[]),{code:'REVIEW_IN_PROGRESS',message:'分享时研究仍在进行，当前内容仅为待核验草稿。'}]}:task.quality;
  return safeCopy({id:task.id,title:task.title,input:task.input,status:inProgress?'needs_review':task.status,phaseIndex:task.phaseIndex,phaseStatus:inProgress?'needs_review':task.phaseStatus,createdAt:task.createdAt,updatedAt:task.updatedAt,report:task.report,evidence:task.evidence,quality,reviewChecklist:task.reviewChecklist,research:{plan:research.plan,sources:research.sources,presentationProducts:research.presentationProducts,productRegistry:research.productRegistry,searchRounds:research.searchRounds,queryRuns:research.queryRuns,searchQuality:research.searchQuality,searchProgress:research.searchProgress}},redact);
}
export async function encryptSnapshot(tasks,redact){
  const plain=enc.encode(JSON.stringify({format:'insightlab-shared-reports',version:1,createdAt:new Date().toISOString(),tasks:tasks.map(task=>reportSnapshot(task,redact))}));
  const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,plain));
  const output=new Uint8Array(iv.length+encrypted.length);output.set(iv);output.set(encrypted,iv.length);
  if(output.length>maxBytes)throw Error('所选报告合计超过4 MB，请减少报告数量后再分享。');
  return {bytes:output,key:b64(key)};
}
export async function decryptSnapshot(bytes,keyText){
  if(bytes.byteLength<29||bytes.byteLength>maxBytes)throw Error('分享内容大小无效。');
  const key=unb64(keyText);if(key.length!==32)throw Error('分享链接密钥无效。');
  const cryptoKey=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['decrypt']);
  const data=new Uint8Array(bytes);let plain;
  try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12)},cryptoKey,data.slice(12));}catch{throw Error('无法解密报告，请检查分享链接是否完整。');}
  const snapshot=JSON.parse(dec.decode(plain));
  if(snapshot.format!=='insightlab-shared-reports'||snapshot.version!==1||!Array.isArray(snapshot.tasks)||!snapshot.tasks.length||snapshot.tasks.length>50||snapshot.tasks.some(t=>!t?.report||typeof t.id!=='string'||!/^[\w-]+$/.test(t.id)))throw Error('分享报告格式无效。');
  return snapshot;
}
export function shareInfo(hash){
  const p=new URLSearchParams(hash.replace(/^#/,''));if(!p.has('share'))return null;
  const id=p.get('share'),key=p.get('key');if(!/^[A-Za-z0-9_-]{22}$/.test(id||'')||!/^[A-Za-z0-9_-]{43}$/.test(key||''))throw Error('分享链接不完整。');
  return {id,key,service:endpoint(p.get('service'))};
}
export async function loadSharedReports(info){const response=await fetch(info.service+'/shares/'+info.id,{credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('分享不存在、已过期或暂时不可访问。');return decryptSnapshot(await response.arrayBuffer(),info.key);}
export function sharedRequest(snapshot,original){
  const tasks=snapshot.tasks.map(t=>({...t,permissions:{canEdit:false,canShare:false,shared:true}}));
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json;charset=utf-8'}});
  return async(path,options={})=>{
    const u=new URL(path,'https://browser.local'),method=(options.method||'GET').toUpperCase();
    if(u.pathname==='/api/tasks'&&method==='GET')return json(tasks);
    const m=/^\/api\/tasks\/([\w-]+)(?:\/(export\.docx))?$/.exec(u.pathname);
    if(m&&method==='GET'){
      const t=tasks.find(x=>x.id===m[1]);if(!t)return json({error:'报告不存在'},404);
      if(m[2]){if(t.quality?.publishable===false&&u.searchParams.get('draft')!=='1')return json({error:'该报告为待核验草稿'},400);return new Response(makeDocx(t,exportOptionsFromUrl(u.searchParams)),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}});}
      return json(t);
    }
    if(u.pathname.startsWith('/api/tasks'))return json({error:'分享页面为只读'},403);
    return original(path,options);
  };
}
export function installSharing(getRuntime){
  const button=document.createElement('button');button.type='button';button.dataset.shareEntry='true';button.textContent='分享报告';document.querySelector('.browser-session-notice').append(button);
  button.onclick=()=>{
    const runtime=getRuntime();
    const tasks=runtime.repository.listTasks().filter(t=>t.report&&['completed','needs_review','failed','running','queued','planning'].includes(t.status));
    if(!tasks.length){alert('当前没有可分享的报告。');return;}
    const d=document.createElement('dialog');d.className='report-export-dialog';const form=document.createElement('form');
    const title=document.createElement('h2');title.textContent='选择要分享的报告';const note=document.createElement('p');note.textContent='持有链接的人可以查看、下载或转发所选报告。分享为30天的只读快照。';form.append(title,note);
    const list=document.createElement('div');for(const task of tasks){const label=document.createElement('label'),box=document.createElement('input'),text=document.createElement('span');box.type='checkbox';box.value=task.id;text.textContent=' '+task.title+(task.quality?.publishable===false?'（待核验草稿）':'');label.append(box,text);list.append(label,document.createElement('br'));}form.append(list);
    const service=document.createElement('input');service.type='url';service.required=true;service.placeholder='Cloudflare 分享服务地址（https://…workers.dev）';service.value=localStorage.getItem('insight-share-service')||defaultService;service.style.width='100%';const advanced=document.createElement('details'),summary=document.createElement('summary');summary.textContent='分享服务设置';advanced.append(summary,service);form.append(advanced);
    const status=document.createElement('p');status.setAttribute('role','status');const out=document.createElement('textarea');out.readOnly=true;out.hidden=true;out.style.width='100%';const submit=document.createElement('button');submit.type='submit';submit.textContent='生成分享链接';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='关闭';cancel.onclick=()=>d.close();form.append(status,out,submit,cancel);d.append(form);document.body.append(d);d.addEventListener('close',()=>d.remove());
    form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{const selected=[...list.querySelectorAll('input:checked')].map(x=>tasks.find(t=>t.id===x.value));if(!selected.length)throw Error('请至少选择一份报告。');if(selected.length>50)throw Error('一次最多分享50份报告。');const host=endpoint(service.value);const encrypted=await encryptSnapshot(selected,runtime.redact);const response=await fetch(host+'/shares',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:encrypted.bytes,credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('分享服务不可用，请检查服务地址或稍后重试。');const result=await response.json();if(!/^[A-Za-z0-9_-]{22}$/.test(result.id))throw Error('分享服务响应无效。');localStorage.setItem('insight-share-service',host);const link=new URL(location.pathname,location.origin);link.hash=new URLSearchParams({share:result.id,key:encrypted.key,service:host}).toString();out.value=link.href;out.hidden=false;status.textContent='链接已生成，有效期 '+ttlDays+' 天。请复制下方链接。';out.select();try{await navigator.clipboard.writeText(link.href);status.textContent+=' 已复制。';}catch{} }catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};
    d.showModal();
  };
}
