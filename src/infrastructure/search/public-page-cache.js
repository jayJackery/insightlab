import {createHash} from '../../browser/shims/crypto.js?v=7860f20d981283d9';
import {mkdir,readFile,writeFile} from '../../browser/shims/fs.js?v=7860f20d981283d9';
import {join} from '../../browser/shims/path.js?v=7860f20d981283d9';

// Public product pages only; never persist credentials, query strings or failed responses.
export function createPublicPageCache(directory='public-page-cache',now=()=>Date.now()) {
  const pending=new Map();
  async function get(url,fetchPage) {
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)return {...await fetchPage(),cacheHit:false};
    const key=createHash('sha256').update(parsed.href).digest('hex');
    if(pending.has(key))return pending.get(key);
    const action=(async()=>{
      const file=join(directory,key+'.json');
      try {const entry=JSON.parse(String(await readFile(file,'utf8')));const age=now()-Date.parse(entry.fetchedAt);if(entry.url===parsed.href&&age>=0&&age<86400000&&typeof entry.page?.content==='string'&&entry.page.content.length>=100)return {...entry.page,fetchedAt:entry.fetchedAt,cacheHit:true};}catch{}
      const page=await fetchPage(),fetchedAt=new Date(now()).toISOString();
      if(typeof page?.content==='string'&&page.content.length>=100){try{await mkdir(directory,{recursive:true});await writeFile(file,JSON.stringify({url:parsed.href,fetchedAt,page}));}catch{/* cache is optional */}}
      return {...page,fetchedAt,cacheHit:false};
    })();
    pending.set(key,action);try{return await action;}finally{pending.delete(key);}
  }
  return {get};
}
