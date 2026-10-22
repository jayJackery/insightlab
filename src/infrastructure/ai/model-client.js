import { modelConfiguration } from '../settings/service-settings.js';
import { parseModelResponse, ModelOutputError } from './model-json.js';
import {randomUUID} from '../../browser/shims/crypto.js';
import {createResponseCache,requestDigest} from './response-cache.js';
import {createRequestGate} from '../request-gate.js';
export function createModelClient({services,getTask,update,beforeRequest=()=>{},getContext=()=>({}),cacheDirectory,cacheVersion='uncached'}) {
const cache=createResponseCache(cacheDirectory);
const gate=createRequestGate(2);
async function model(messages, options = {}) {
  const taskId=options.taskId||getContext()?.taskId;
  const record=entry=>{if(!taskId)return;const research=getTask(taskId)?.research;if(!research)return;update(taskId,{research:{...research,apiUsage:{version:1,entries:[...(research.apiUsage?.entries||[]),{id:randomUUID(),stage:options.stage||'模型分析',recordedAt:new Date().toISOString(),...entry}]}}});};
  const config = modelConfiguration(services.env());
  if (!config.key) throw new Error("未配置模型密钥，请打开页面右上角的服务配置。");
  const base = config.baseUrl.replace(/\/$/, "");
  const supportsThinking=new URL(base).hostname==='api.deepseek.com' && /^deepseek-(?:flash|v4-pro)$/.test(config.model);
  let schemaFeedback='';
  for (let attempt = 0; attempt < 2; attempt++) {
    const requestMessages = attempt ? messages.map((message, i) => i === 0 ? { ...message, content: message.content + "\n上次输出无法读取。请重新生成完整、严格的JSON对象，不要代码围栏或说明文字。缩短引文、避免重复句，保持所有必需字段和引用，不添加没有证据的事实。" + (schemaFeedback?'\n必须修正的结构问题：'+schemaFeedback:'') } : message) : messages;
    const thinking=supportsThinking ? options.reasoning==='low' && attempt===0 ? {thinking:{type:'enabled'},reasoning_effort:'low'} : {thinking:{type:'disabled'}} : {};
    const maxTokens=supportsThinking && thinking.thinking.type==='enabled' ? Math.max(16000,options.maxTokens || 8192) : options.maxTokens || 8192;
    const cacheKey=requestDigest({taskId,cacheVersion,account:requestDigest(config.key),base,model:config.model,messages:requestMessages,thinking,maxTokens,stage:options.stage||'',arrays:options.arrays||[]});
    const cached=taskId?await cache.read(cacheKey):null;
    if(cached){try{if(options.arrays?.some(name=>!Array.isArray(cached[name])))throw Error();options.validate?.(cached);record({localReuse:true,usageKnown:false,model:config.model});return cached;}catch{}}
    let res,result;
    for(let transportAttempt=0;transportAttempt<2;transportAttempt++) {
      ({res,result}=await gate.run(async timing=>{
        await beforeRequest(options);
        const requestId=randomUUID(),started=Date.now();
        record({id:requestId,localReuse:false,model:config.model,attempt:attempt+1,transportAttempt:transportAttempt+1,usageKnown:false,status:'requesting',...timing});
        try {
          const res=await fetch(base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+config.key},body:JSON.stringify({model:config.model,temperature:0.2,max_tokens:maxTokens,...thinking,response_format:{type:'json_object'},messages:requestMessages}),signal:AbortSignal.timeout(120000)});
          const result=await res.json().catch(()=>({}));
          const usage=result.usage||{},count=value=>Number.isFinite(value)&&value>=0?value:null;
          record({id:requestId,localReuse:false,status:'responded',model:config.model,httpStatus:res.status,attempt:attempt+1,transportAttempt:transportAttempt+1,...timing,durationMs:Date.now()-started,usageKnown:Number.isFinite(usage.prompt_tokens)&&Number.isFinite(usage.completion_tokens),promptTokens:count(usage.prompt_tokens),completionTokens:count(usage.completion_tokens),totalTokens:count(usage.total_tokens),cacheHitTokens:count(usage.prompt_cache_hit_tokens??usage.prompt_tokens_details?.cached_tokens),reasoningTokens:count(usage.completion_tokens_details?.reasoning_tokens)});
          if(res.status===429){const delayMs=gate.rateLimited(res.headers.get('retry-after'));return {res,result,delayMs};}
          return {res,result};
        } catch(error) {
          record({id:requestId,localReuse:false,status:'failed',model:config.model,attempt:attempt+1,transportAttempt:transportAttempt+1,...timing,durationMs:Date.now()-started,usageKnown:false});throw error;
        }
      }).then(value=>{if(value.res.status===429&&value.delayMs>30000)throw Error('模型服务限流，已降为串行；服务要求较长等待，请稍后从检查点重试。');return value;}));
      if(res.status!==429)break;
    }
    if (!res.ok) throw new Error(services.redact("模型服务返回 " + res.status + "：" + (result.error?.message || "请求失败")));
    try {
      const parsed = parseModelResponse(result);
      if (options.arrays?.some((name) => !Array.isArray(parsed.value[name]))) throw new ModelOutputError("MODEL_SCHEMA_INVALID", "模型缺少本阶段必需的结构化字段。", parsed.diagnostic);
      if(options.validate)try {options.validate(parsed.value);}catch(error){schemaFeedback=error.message;throw new ModelOutputError('MODEL_SCHEMA_INVALID',error.message,parsed.diagnostic);}
      if(taskId)await cache.write(cacheKey,parsed.value);
      return parsed.value;
    } catch (error) {
      if (!(error instanceof ModelOutputError)) throw error;
      if (taskId) {
        const research = getTask(taskId)?.research || {};
        update(taskId, { research: { ...research, modelDiagnostics: [...(research.modelDiagnostics || []).slice(-19), { id:randomUUID(),stage: options.stage || "模型分析", code: error.code, ...error.diagnostic, attempt: attempt + 1, automaticRetry: attempt === 0, recordedAt: new Date().toISOString() }] } });
      }
      if (attempt === 1 || error.code === "MODEL_REFUSED") throw Error((options.stage || "模型分析") + "：" + error.message + "已保留阶段进度，可从中断处继续。");
    }
  }
}

return model;
}
