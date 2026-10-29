import {randomUUID} from './shims/crypto.js?v=6cfce723d0abd3f5';
import {createServiceSettings,modelConfiguration} from '../infrastructure/settings/service-settings.js?v=6cfce723d0abd3f5';
import {createModelClient} from '../infrastructure/ai/model-client.js?v=6cfce723d0abd3f5';
import {checkModelCompatibility} from '../infrastructure/ai/model-probe.js?v=6cfce723d0abd3f5';
import {createSourceStore} from '../infrastructure/persistence/source-store.js?v=6cfce723d0abd3f5';
import {createResearchWorkflow} from '../application/research/workflow.js?v=6cfce723d0abd3f5';
import {createCompetitorAdvisor} from '../infrastructure/search/competitor-advisor.js?v=6cfce723d0abd3f5';
import {createCatalogSpotlight} from '../infrastructure/search/catalog-spotlight.js?v=6cfce723d0abd3f5';
import {searchWeb} from '../infrastructure/search/search.js?v=6cfce723d0abd3f5';
import {lookupSpecifications} from './catalog.js?v=6cfce723d0abd3f5';
import {WORKFLOW_VERSION,REPORT_SCHEMA_VERSION,REQUIREMENTS_REVISION} from '../domain/research/research-contract.js?v=6cfce723d0abd3f5';
import {createBrowserRepository} from './repository.js?v=6cfce723d0abd3f5';
import {createTaskActions} from './task-actions.js?v=6cfce723d0abd3f5';
import {makeDocx} from '../reporting/docx-export.js?v=6cfce723d0abd3f5';
import {exportOptionsFromUrl} from '../../public/report-sections.js?v=6cfce723d0abd3f5';
import {hasInvalidQueries} from '../../public/plan-utils.js?v=6cfce723d0abd3f5';
import {reloadTasks,openStorage,acquireWorkspace,storageName} from './storage.js?v=6cfce723d0abd3f5';
import {installResearchDiagnostics} from './research-diagnostics.js?v=6cfce723d0abd3f5';
import {createPublicPageCache} from '../infrastructure/search/public-page-cache.js?v=6cfce723d0abd3f5';
import {mapConcurrent,STAGE_CONCURRENCY} from '../application/research/concurrency.js?v=6cfce723d0abd3f5';

export async function createBrowserRuntime({build,workspace,sessionServices,databaseName}){
  if(!workspace){await openStorage(databaseName);workspace=await acquireWorkspace();}
  const repository=createBrowserRepository(),{getTask,update}=repository;
  const services=sessionServices||await createServiceSettings(undefined,{MODEL_PROVIDER:'deepseek',SEARCH_PROVIDER:'deepseek',OPENAI_BASE_URL:'https://api.deepseek.com',OPENAI_MODEL:'deepseek-flash'});
  const publicConfig=()=>{const value=services.publicConfig();return {...value,storageMode:'session',keys:Object.fromEntries(Object.entries(value.keys).map(([key,state])=>[key,{...state,source:state.configured?'session':'none'}]))};};
  const runtime={workflowVersion:WORKFLOW_VERSION,reportSchemaVersion:REPORT_SCHEMA_VERSION,requirementsRevision:REQUIREMENTS_REVISION,buildId:build.buildId,startedAt:new Date().toISOString(),pid:1,executionMode:'browser'};
  let currentJob=null,draining=false;const jobs=[];
  const idleWaiters=[];
  const waitForIdle=()=>currentJob||jobs.length||draining?new Promise(resolve=>idleWaiters.push(resolve)):Promise.resolve();
  const mutate=action=>workspace.run(action,waitForIdle,async()=>{repository.recoverInterrupted();await repository.flush();});
  if(workspace.writable){try{await mutate(async()=>{});}catch{/* An active page owns execution; reading must remain available. */}}
  const writable=()=>{if(!workspace.writable)throw Error(workspace.reason);};
  const ready=()=>{writable();const config=publicConfig();if(!config.modelReady||!config.searchReady)throw Error('请先打开“服务配置”，填写本次页面使用的模型和搜索密钥。刷新后密钥需要重新填写。');};
  const beforeRequest=async()=>{ready();await repository.flush();};
  const model=createModelClient({services,getTask,update,getContext:()=>({taskId:currentJob?.id}),beforeRequest,cacheDirectory:'model-response-cache',cacheVersion:build.buildId});
  const snapshotSources=createSourceStore('source-snapshots');
  const recommendCompetitors=createCompetitorAdvisor(),spotlight=createCatalogSpotlight();
  const search=async(query,input)=>{try{return await snapshotSources(await searchWeb(query,input,{env:services.env(),beforeRequest}));}catch(error){throw Error(services.redact(error.name==='TypeError'?'浏览器无法连接搜索服务，请检查网络、接口跨域支持或公司访问策略。':error.message));}};
  // Explicit plan.verifyCatalog only. Fetch API reads public pages without browser CORS restrictions on each vendor.
  const pageCache=createPublicPageCache('public-page-cache');
  const fetchOfficial=async(records,{onProgress=()=>{}}={})=>{
    const sources=[],checks=[];
    await mapConcurrent(records.slice(0,8),STAGE_CONCURRENCY.search,async record=>{
      const url=record.officialUrl;if(!url)return;
      const check={product:record.catalogRecord?.name,url,status:'running'};checks.push(check);await onProgress(checks);
      try{
        const page=await pageCache.get(url,async()=>{await beforeRequest();const env=services.env();if(!env.DEEPSEEK_API_KEY)throw Error('显式原文抓取需要本页DeepSeek密钥。');
        const response=await fetch('https://api.deepseek.com/v1/tools/fetch',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.DEEPSEEK_API_KEY},body:JSON.stringify({url}),signal:AbortSignal.timeout(60000),credentials:'omit'});
        const value=await response.json();if(!response.ok)throw Error('网页抓取返回HTTP '+response.status);
        const page=value.result||value,content=page.content;if(typeof content!=='string'||content.length<100)throw Error('未返回可用原文');return {title:page.title,content:content.slice(0,1500000)};});
        sources.push({title:page.title||record.title,url,content:page.content,snippet:page.content.slice(0,500),provider:'deepseek_fetch',contentKind:'page_content',sourceType:'official',queries:['用户确认的官网补查'],retrievedAt:page.fetchedAt});check.status=page.cacheHit?'cached':'completed';check.fetchedAt=page.fetchedAt;
      }catch(error){check.status='failed';check.error=services.redact(error.message);}await onProgress(checks);
    });
    return {sources:await snapshotSources(sources),checks};
  };
  const workflow=createResearchWorkflow({getTask,update,model,search,consultSpecs:lookupSpecifications,recommendCompetitors,fetchOfficial,runtime,snapshotSources});
  async function drain(){if(draining)return;draining=true;try{while(jobs.length){currentJob=jobs.shift();try{await repository.flush();await workflow[currentJob.kind==='plan'?'preparePlan':'run'](currentJob.id);await repository.flush();}catch(error){update(currentJob.id,{status:'failed',phaseStatus:'failed',error:services.redact(error.message)});}}}finally{currentJob=null;draining=false;for(const resolve of idleWaiters.splice(0))resolve();}}
  const enqueue=(id,kind)=>{ready();if(currentJob?.id===id||jobs.some(job=>job.id===id))throw Error('此任务已在执行或排队。');jobs.push({id,kind});queueMicrotask(drain);};
  const actions=createTaskActions({repository,recommendCompetitors,enqueue,ready,writable});
  // Explicit user-triggered probe; keeps credentials and reasoning text private.
  const notice=document.querySelector('.browser-session-notice');
  if(notice){
    let button=document.getElementById('thinking-mode-probe');
    if(!button){button=document.createElement('button');button.id='thinking-mode-probe';button.type='button';button.textContent='检测分阶段思考';notice.append(button);}
    button.onclick=async()=>{
      button.disabled=true;
      let output=document.getElementById('thinking-mode-probe-result');
      if(!output){output=document.createElement('p');output.id='thinking-mode-probe-result';output.setAttribute('role','status');notice.after(output);}
      try{
        ready();if(currentJob||jobs.length||draining)throw Error('请等研究结束后再检测。');
        const results=[];
        for(const review of [false,true]){
          output.textContent=review?'正在检测结论复核模式…':'正在检测资料处理模式…';
          let diagnostic=null;const started=Date.now();
          await model([{role:'system',content:'只返回JSON对象 {"result":"ok"}。'},{role:'user',content:'请按要求回复。'}],{stage:review?'思考模式检测：复核':'思考模式检测：资料',thinkingPhase:review?'review':'normal',maxTokens:512,maxAttempts:1,timeoutMs:60000,validate:value=>{if(value.result!=='ok')throw Error('检测响应字段不符合要求');},onDiagnostic:value=>{diagnostic=value;}});
          results.push((review?'复核：请求开启':'资料：请求关闭')+'，JSON通过，'+((Date.now()-started)/1000).toFixed(1)+'秒，推理token '+(diagnostic?.reasoningTokens??'未报告')+'，推理字符 '+(diagnostic?.reasoningCharacters??'未报告'));
        }
        output.textContent=results.join('；')+'。如服务未报告推理数据，无法据此确认模式是否生效。';
      }catch(error){output.textContent='检测未完成：'+services.redact(error.message||'请求失败');}finally{button.disabled=false;}
    };
  }
  const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json;charset=utf-8'}});
  async function request(path,options={}){
    try{
      const url=new URL(path,'https://browser.local'),method=(options.method||'GET').toUpperCase();let body={};
      if(method==='GET'&&url.pathname.startsWith('/api/tasks')&&!workspace.ownsLock)await reloadTasks();
      if(options.body){if(typeof options.body!=='string'||options.body.length>1000000)throw Error('请求内容过大或无效。');body=JSON.parse(options.body);if(!body||typeof body!=='object'||Array.isArray(body))throw Error('请求须为JSON对象。');}
      if(url.pathname==='/api/auth/status')return json({identityMode:'browser_local',configured:true});
      if(url.pathname==='/api/auth/me')return json({user:{id:'browser-workspace',name:'浏览器工作区',localMode:true,localAdmin:true,browserMode:true}});
      if(url.pathname==='/api/runtime')return json(runtime);
      if(url.pathname==='/api/config'&&method==='GET')return json(publicConfig());
      if(url.pathname==='/api/config'&&method==='POST'){
        if(currentJob||jobs.length)throw Error('调研正在执行，请结束后再更改本次页面的配置。');
        await services.save(body);return json(publicConfig());
      }
      if(url.pathname==='/api/config/check'&&method==='POST'){
        if(currentJob||jobs.length)throw Error('调研正在执行，请结束后再检测连接。');
        const config=modelConfiguration(services.env());
        const checks=await Promise.allSettled([
          checkModelCompatibility(model,config.model),
          (async()=>{const result=await search('portable power station',{subject:'连接检查'});return '搜索连接成功 · '+result.length+'条结果';})(),
        ]);return json(Object.fromEntries(checks.map((item,index)=>[['model','search'][index],item.status==='fulfilled'?{ok:true,message:item.value}:{ok:false,message:services.redact(item.reason?.name==='TypeError'?'浏览器直连失败，请检查网络和接口跨域支持。':item.reason?.message)}])));
      }
      if(url.pathname==='/api/catalog/spotlight')return json(await spotlight());
      if(url.pathname==='/api/competitors/recommend'&&method==='POST')return json(await actions.recommend(body));
      if(url.pathname==='/api/tasks'&&method==='GET')return json(repository.listTasks().map(task=>({...task,permissions:{...task.permissions,canEdit:workspace.writable}})));
      if(url.pathname==='/api/tasks'&&method==='POST')return json(await mutate(()=>actions.create(body)));
      const match=/^\/api\/tasks\/([\w-]+)(?:\/(start|retry|replan|followup|review|export\.docx))?$/.exec(url.pathname);
      if(match){
        const task=getTask(match[1]);if(!task)throw Error('找不到这条调研。');
        if(!match[2]&&method==='GET')return json({...task,permissions:{...task.permissions,canEdit:workspace.writable}});
        if(match[2]==='export.docx'&&method==='GET'){
          if(!task.report)throw Error('报告尚未生成。');
          if(!task.quality.publishable&&url.searchParams.get('draft')!=='1')throw Error('未通过研发验收，请选择下载Word草稿。');
          if(task.research?.plan&&hasInvalidQueries(task.research.plan))throw Error('原报告查询异常，请重新研究。');
          const bytes=makeDocx(task,exportOptionsFromUrl(url.searchParams));return new Response(bytes,{headers:{'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}});
        }
        if(method==='POST'&&actions[match[2]])return json(await mutate(()=>actions[match[2]](getTask(match[1]),body)));
      }
      throw Error('该功能在纯前端版不可用。');
    }catch(error){return new Response(JSON.stringify({error:services.redact(error.message||'操作失败')}),{status:400,headers:{'content-type':'application/json;charset=utf-8'}});}
  }
  async function loadUpdate(buildUrl){
    if(currentJob||jobs.length||draining||workspace.ownsLock)throw Error('请等当前操作结束后再加载更新，阶段记录会保留。');
    const ownBase=new URL('../../',import.meta.url),url=new URL(buildUrl);
    if(url.origin!==ownBase.origin||url.pathname!==new URL('build.json',ownBase).pathname)throw Error('仅允许加载本网站更新。');
    const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('暂时无法取得更新，请稍后重试。');
    const nextBuild=await response.json();
    if(nextBuild.app!=='insightlab-browser'||!/^([a-f0-9]{16})$/.test(nextBuild.buildId))throw Error('更新信息无效。');
    if(nextBuild.buildId===build.buildId)return null;
    await repository.flush();
    const moduleUrl=new URL('src/browser/runtime.js',ownBase);moduleUrl.searchParams.set('v',nextBuild.buildId);
    const next=await import(moduleUrl.href);
    return next.createBrowserRuntime({build:nextBuild,sessionServices:services,databaseName:storageName});
  }
  installResearchDiagnostics(repository,build.buildId,services.redact);
  return {loadUpdate,reload:reloadTasks,request,repository,runtime,workspace,mutate,busy:()=>Boolean(currentJob||jobs.length),redact:services.redact};
}
