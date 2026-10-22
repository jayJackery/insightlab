import {randomUUID} from './shims/crypto.js?v=8e1e00bb1d41da9f';
import {createServiceSettings,modelConfiguration} from '../infrastructure/settings/service-settings.js?v=8e1e00bb1d41da9f';
import {createModelClient} from '../infrastructure/ai/model-client.js?v=8e1e00bb1d41da9f';
import {checkModelCompatibility} from '../infrastructure/ai/model-probe.js?v=8e1e00bb1d41da9f';
import {createSourceStore} from '../infrastructure/persistence/source-store.js?v=8e1e00bb1d41da9f';
import {createResearchWorkflow} from '../application/research/workflow.js?v=8e1e00bb1d41da9f';
import {createCompetitorAdvisor} from '../infrastructure/search/competitor-advisor.js?v=8e1e00bb1d41da9f';
import {createCatalogSpotlight} from '../infrastructure/search/catalog-spotlight.js?v=8e1e00bb1d41da9f';
import {searchWeb} from '../infrastructure/search/search.js?v=8e1e00bb1d41da9f';
import {lookupSpecifications} from './catalog.js?v=8e1e00bb1d41da9f';
import {WORKFLOW_VERSION,REPORT_SCHEMA_VERSION,REQUIREMENTS_REVISION} from '../domain/research/research-contract.js?v=8e1e00bb1d41da9f';
import {createBrowserRepository} from './repository.js?v=8e1e00bb1d41da9f';
import {createTaskActions} from './task-actions.js?v=8e1e00bb1d41da9f';
import {makeDocx} from '../reporting/docx-export.js?v=8e1e00bb1d41da9f';
import {exportOptionsFromUrl} from '../../public/report-sections.js?v=8e1e00bb1d41da9f';
import {hasInvalidQueries} from '../../public/plan-utils.js?v=8e1e00bb1d41da9f';
import {reloadTasks} from './storage.js?v=8e1e00bb1d41da9f';

export async function createBrowserRuntime({build,workspace}){
  const repository=createBrowserRepository(),{getTask,update}=repository;
  const services=await createServiceSettings(undefined,{MODEL_PROVIDER:'deepseek',SEARCH_PROVIDER:'deepseek',OPENAI_BASE_URL:'https://api.deepseek.com',OPENAI_MODEL:'deepseek-flash'});
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
  const fetchOfficial=async(records,{onProgress=()=>{}}={})=>{
    const sources=[],checks=[];
    for(const record of records.slice(0,8)){
      const url=record.officialUrl;if(!url)continue;
      const check={product:record.catalogRecord?.name,url,status:'running'};checks.push(check);await onProgress(checks);
      try{
        await beforeRequest();const env=services.env();if(!env.DEEPSEEK_API_KEY)throw Error('显式原文抓取需要本页DeepSeek密钥。');
        const response=await fetch('https://api.deepseek.com/v1/tools/fetch',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.DEEPSEEK_API_KEY},body:JSON.stringify({url}),signal:AbortSignal.timeout(60000),credentials:'omit'});
        const value=await response.json();if(!response.ok)throw Error('网页抓取返回HTTP '+response.status);
        const page=value.result||value,content=page.content;if(typeof content!=='string'||content.length<100)throw Error('未返回可用原文');
        sources.push({title:page.title||record.title,url,content:content.slice(0,1500000),snippet:content.slice(0,500),provider:'deepseek_fetch',contentKind:'page_content',sourceType:'official',queries:['用户确认的官网补查'],retrievedAt:new Date().toISOString()});check.status='completed';
      }catch(error){check.status='failed';check.error=services.redact(error.message);}await onProgress(checks);
    }
    return {sources:await snapshotSources(sources),checks};
  };
  const workflow=createResearchWorkflow({getTask,update,model,search,consultSpecs:lookupSpecifications,recommendCompetitors,fetchOfficial,runtime,snapshotSources});
  async function drain(){if(draining)return;draining=true;try{while(jobs.length){currentJob=jobs.shift();try{await repository.flush();await workflow[currentJob.kind==='plan'?'preparePlan':'run'](currentJob.id);await repository.flush();}catch(error){update(currentJob.id,{status:'failed',phaseStatus:'failed',error:services.redact(error.message)});}}}finally{currentJob=null;draining=false;for(const resolve of idleWaiters.splice(0))resolve();}}
  const enqueue=(id,kind)=>{ready();if(currentJob?.id===id||jobs.some(job=>job.id===id))throw Error('此任务已在执行或排队。');jobs.push({id,kind});queueMicrotask(drain);};
  const actions=createTaskActions({repository,recommendCompetitors,enqueue,ready,writable});
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
  return {request,repository,runtime,workspace,mutate,busy:()=>Boolean(currentJob||jobs.length),redact:services.redact};
}
