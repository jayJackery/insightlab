let database, failure=null, pending=Promise.resolve();
const tasks=new Map(),files=new Map();
export let storageName='';
const request=value=>new Promise((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error);});
export async function openStorage(name){
  storageName=name;
  if(!globalThis.indexedDB)throw Error('浏览器未开放本地数据库，请使用新版Chrome或Edge并允许网站保存数据。');
  const opening=indexedDB.open(name,1);
  opening.onupgradeneeded=()=>{for(const store of ['tasks','files'])if(!opening.result.objectStoreNames.contains(store))opening.result.createObjectStore(store);};
  database=await request(opening);
  database.onversionchange=()=>{database.close();failure=Error('工作区已在其他页面升级，请刷新当前页面。');};
  await reloadTasks();
  const tx=database.transaction('files','readonly'),store=tx.objectStore('files');
  const [keys,values]=await Promise.all([request(store.getAllKeys()),request(store.getAll())]);keys.forEach((key,index)=>files.set(key,values[index]));
}
export async function reloadTasks(){
  const tx=database.transaction('tasks','readonly'),store=tx.objectStore('tasks');
  const [keys,values]=await Promise.all([request(store.getAllKeys()),request(store.getAll())]);tasks.clear();keys.forEach((key,index)=>tasks.set(key,values[index]));
}
function write(store,key,value,remove=false){
  const copy=structuredClone(value);
  pending=pending.then(()=>new Promise((resolve,reject)=>{
    if(failure){reject(failure);return;}
    const tx=database.transaction(store,'readwrite');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('浏览器取消了保存。'));
    if(remove)tx.objectStore(store).delete(key);else tx.objectStore(store).put(copy,key);
  })).catch(error=>{failure=Error(error?.name==='QuotaExceededError'?'浏览器存储空间不足，请先备份报告并清理网站空间，再重试。':'本地保存失败，已停止后续API调用。请备份当前记录后重新打开页面。');document.dispatchEvent(new CustomEvent('browser-storage-error',{detail:failure.message}));});
}
export async function flushStorage(){await pending;if(failure)throw failure;}
export const taskRecords=()=>tasks;
export function saveTask(task){tasks.set(task.id,structuredClone(task));write('tasks',task.id,task);}
export function readVirtualFile(path){if(!files.has(path)){const error=Error('File not found');error.code='ENOENT';throw error;}return files.get(path);}
export function saveVirtualFile(path,value,options={}){if(options.flag==='wx'&&files.has(path)){const error=Error('File exists');error.code='EEXIST';throw error;}files.set(path,value);write('files',path,value);}
export function removeVirtualFile(path){files.delete(path);write('files',path,null,true);}

export async function acquireWorkspace(){
  if(!navigator.locks)return {writable:false,reason:'此浏览器不支持工作区互斥锁，暂只提供阅读和导出。请使用新版Chrome或Edge。'};
  return new Promise(resolve=>{
    navigator.locks.request(storageName+':writer',{ifAvailable:true},lock=>{
      if(!lock){resolve({writable:false,reason:'工作区已在另一个标签页打开。本页只读；关闭另一页后刷新此页即可研究。'});return;}
      resolve({writable:true});return new Promise(()=>{});
    }).catch(()=>resolve({writable:false,reason:'无法锁定工作区，请关闭其他工作台标签页后刷新。'}));
  });
}
