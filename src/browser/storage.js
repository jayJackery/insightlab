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
export async function reloadStorage(){
  await flushStorage();await reloadTasks();
  const tx=database.transaction('files','readonly'),store=tx.objectStore('files');
  const [keys,values]=await Promise.all([request(store.getAllKeys()),request(store.getAll())]);files.clear();keys.forEach((key,index)=>files.set(key,values[index]));
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
  const state={writable:Boolean(navigator.locks),ownsLock:false,reason:'此浏览器不支持安全保存，请使用新版Chrome或Edge。'};
  // Opening and reading never hold a lock. Keep the same name to protect work in older tabs.
  state.run=(action,settled=async()=>{},onAcquire=()=>{})=>{
    if(!state.writable)return Promise.reject(Error(state.reason));
    if(state.ownsLock)return Promise.reject(Error('本页已有研究或保存操作正在处理，可以继续阅读；结束后即可开始下一项。'));
    return new Promise((resolve,reject)=>{
      navigator.locks.request(storageName+':writer',{ifAvailable:true},async lock=>{
        if(!lock)throw Error('另一页面正在处理研究。本页可以直接查看进度；处理结束后即可在此开始，无需寻找或关闭标签页。');
        state.ownsLock=true;
        try{await reloadStorage();await onAcquire();resolve(await action());await settled();await flushStorage();}
        catch(error){reject(error);}
        finally{state.ownsLock=false;}
      }).catch(reject);
    });
  };
  return state;
}
