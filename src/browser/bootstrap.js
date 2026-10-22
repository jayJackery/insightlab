import {openStorage,acquireWorkspace,reloadTasks,flushStorage} from './storage.js?v=8e1e00bb1d41da9f';
import {createBrowserRuntime} from './runtime.js?v=8e1e00bb1d41da9f';
import {createBackup,importBackup} from './backup.js?v=8e1e00bb1d41da9f';
const $=selector=>document.querySelector(selector);
const toast=message=>{const node=$('#toast');node.textContent=message;node.classList.add('show');setTimeout(()=>node.classList.remove('show'),6000);};
const download=(blob,name)=>{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);};
async function start(){
  if(location.protocol==='file:')throw Error('此版本用于GitHub Pages，请通过网站地址打开；暂不提供双击HTML运行。');
  document.documentElement.dataset.runtime='browser';
  const base=new URL('../../',import.meta.url),name='insightlab-pages-v1:'+location.origin+base.pathname;
  const response=await fetch(new URL('build.json',base),{cache:'no-store'});if(!response.ok)throw Error('网站发布不完整，请重新上传完整发布目录。');
  const build=await response.json();await openStorage(name);const workspace=await acquireWorkspace();
  const runtime=await createBrowserRuntime({build,workspace});
  const nativeFetch=globalThis.fetch.bind(globalThis);
  globalThis.fetch=(input,options)=>typeof input==='string'&&/^\/api(?:\/|$)/.test(input)?runtime.request(input,options):nativeFetch(input,options);
  const bar=document.createElement('section');bar.className='browser-session-notice';bar.setAttribute('aria-label','网页工作区说明');
  const title=document.createElement('strong');title.textContent='网页工作区';
  const note=document.createElement('span');note.textContent=workspace.writable?'密钥仅本页有效 · 报告保存在当前浏览器 · 关闭/刷新页面会中断研究':workspace.reason;
  const backup=document.createElement('button');backup.type='button';backup.textContent='备份报告';
  const progress=document.createElement('button');progress.type='button';progress.textContent='在本页查看进度';progress.hidden=true;
  const restore=document.createElement('button');restore.type='button';restore.textContent='导入备份';restore.disabled=!workspace.writable;
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
  const version=document.createElement('small');version.textContent='版本 '+build.buildId.slice(0,8);bar.append(title,note,progress,backup,restore,version,input);$('.topbar').after(bar);
  backup.addEventListener('click',()=>{try{download(createBackup(runtime),'InsightLab报告备份_'+new Date().toISOString().slice(0,10)+'.json');toast('已开始下载报告备份，不含密钥。');}catch(error){toast(error.message);}});
  restore.addEventListener('click',()=>input.click());input.addEventListener('change',async()=>{if(!input.files[0])return;try{const count=await runtime.mutate(()=>importBackup(input.files[0],runtime));toast('已导入'+count+'条独立记录，原报告保留。');$('#nav-history').click();}catch(error){toast(error.message);}finally{input.value='';}});
  $('.privacy').textContent='报告与检查点仅保存在当前浏览器，不上传GitHub；研究资料会发送给你选择的模型和搜索服务。清除网站数据前请备份。';
  $('#history-view .page-head p').textContent='保存在当前浏览器的研究记录；清除网站数据前请备份。';
  $('#settings-dialog .settings-heading p').textContent='默认DeepSeek模型与搜索共用一把密钥，仅当前页面有效；刷新后需重新填写。';
  $('#settings-dialog .settings-storage').textContent='密钥仅保存在当前页面内存，不写入IndexedDB、浏览器缓存、报告备份或GitHub。关闭/刷新后清除。其他模型或搜索服务需自行支持浏览器跨域访问。';
  $('#modal p').textContent='密钥仅本页有效。研究在浏览器执行，关闭/刷新页面可能中断；再次打开可从已保存检查点手动重试。';
  $('#save-settings').textContent='应用到本次页面';$('#check-settings').textContent='应用并检测连接';
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(name):null;
  const phases=['需求拆解','资料检索','证据整理','对比分析','报告生成'];let externalTask=null,syncing=false,app;
  const sync=async()=>{
    if(syncing)return;syncing=true;
    try{
      await flushStorage();if(!workspace.ownsLock)await reloadTasks();
      const active=runtime.repository.activeTask();
      externalTask=!runtime.busy()?active:null;progress.hidden=!externalTask;
      if(!bar.classList.contains('is-error'))note.textContent=!workspace.writable?workspace.reason:externalTask?'另一页面正在'+(phases[externalTask.phaseIndex]||'研究')+'：'+externalTask.title+'。可直接在本页查看，结束后即可开始新研究。':'密钥仅本页有效 · 报告保存在当前浏览器 · 研究期间请保持执行页面打开';
    }catch(error){toast(error.message);}finally{syncing=false;}
  };
  progress.addEventListener('click',async()=>{if(externalTask)try{await app.openTask(externalTask.id);}catch(error){toast(error.message);}});
  if(channel)channel.onmessage=sync;
  let wasBusy=false;setInterval(async()=>{await sync();const busy=runtime.busy();if(busy||wasBusy)channel?.postMessage('updated');wasBusy=busy;},2500);
  document.addEventListener('browser-storage-error',event=>{note.textContent=event.detail;bar.classList.add('is-error');toast(event.detail);});
  app=await import('../../public/app.js?v=8e1e00bb1d41da9f');await sync();
}
start().catch(error=>{document.body.dataset.auth='locked';const root=$('#auth-root');root.replaceChildren();const card=document.createElement('main');card.className='access-card';const title=document.createElement('h1');title.textContent='网页工作区暂时无法打开';const detail=document.createElement('p');detail.textContent=error.message;const retry=document.createElement('button');retry.className='primary';retry.textContent='重新打开';retry.onclick=()=>location.reload();card.append(title,detail,retry);root.append(card);});
