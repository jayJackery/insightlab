import { modelConfiguration } from '../settings/service-settings.js?v=0d401f7edfb044fc';
import { parseModelResponse, decodeModelHttpBody, ModelOutputError } from './model-json.js?v=0d401f7edfb044fc';
import {randomUUID} from '../../browser/shims/crypto.js?v=0d401f7edfb044fc';
import {createResponseCache,requestDigest} from './response-cache.js?v=0d401f7edfb044fc';
import {createRequestGate} from '../request-gate.js?v=0d401f7edfb044fc';
import {modelRequestPolicy} from './model-request.js?v=0d401f7edfb044fc';
import {normalizeModelTransportError} from './model-transport-error.js?v=0d401f7edfb044fc';
import {STAGE_CONCURRENCY} from '../../application/research/concurrency.js?v=0d401f7edfb044fc';
export function createModelClient({services,getTask,update,beforeRequest=()=>{},getContext=()=>({}),cacheDirectory,cacheVersion='uncached'}) {
const cache=createResponseCache(cacheDirectory);
const gate=createRequestGate(STAGE_CONCURRENCY.modelRequests);
async function model(messages, options = {}) {
  const taskId=options.taskId||getContext()?.taskId;
  const record=entry=>{if(!taskId)return;const research=getTask(taskId)?.research;if(!research)return;update(taskId,{research:{...research,apiUsage:{version:1,entries:[...(research.apiUsage?.entries||[]),{id:randomUUID(),stage:options.stage||'模型分析',recordedAt:new Date().toISOString(),...entry}]}}});};
  const config = modelConfiguration(services.env());
  if (!config.key) throw new Error("未配置模型密钥，请打开页面右上角的服务配置。");
  const base = config.baseUrl.replace(/\/$/, "");
  let schemaFeedback='',previousFailure;
  const attempts=options.maxAttempts===1?1:2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const requestMessages = attempt ? messages.map((message, i) => i === 0 ? { ...message, content: message.content + "\n上次输出无法读取。请重新生成完整、严格的JSON对象，不要代码围栏或说明文字。缩短引文、避免重复句，保持所有必需字段和引用，不添加没有证据的事实。" + (schemaFeedback?'\n必须修正的结构问题：'+schemaFeedback:'') } : message) : messages;
    const {thinking,maxTokens,stream}=modelRequestPolicy(config,options,attempt,previousFailure);
    const cacheKey=requestDigest({taskId,cacheVersion,account:requestDigest(config.key),base,model:config.model,messages:requestMessages,thinking,maxTokens,stage:options.stage||'',arrays:options.arrays||[]});
    const cached=taskId?await cache.read(cacheKey):null;
    if(cached){try{if(options.arrays?.some(name=>!Array.isArray(cached[name])))throw Error();options.validate?.(cached);record({localReuse:true,usageKnown:false,model:config.model});return cached;}catch{}}
    let res,result,transportDiagnostic;
    for(let transportAttempt=0;transportAttempt<2;transportAttempt++) {
      ({res,result,transportDiagnostic}=await gate.run(async timing=>{
        await beforeRequest(options);
        const requestId=randomUUID(),started=Date.now(),timeoutMs=options.timeoutMs||120000;
        let httpStatus=null;
        record({id:requestId,localReuse:false,model:config.model,attempt:attempt+1,transportAttempt:transportAttempt+1,usageKnown:false,status:'requesting',streamed:stream,timeoutMs,inputCharacters:JSON.stringify(requestMessages).length,...timing});
        try {
          const res=await fetch(base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+config.key},body:JSON.stringify({model:config.model,temperature:0.2,max_tokens:maxTokens,...thinking,response_format:{type:'json_object'},stream,messages:requestMessages}),signal:AbortSignal.timeout(timeoutMs)});
          httpStatus=res.status;
          const decoded=decodeModelHttpBody(await res.text(),res.headers.get('content-type'),res.status),result=decoded.result;
          const usage=result?.usage||{},count=value=>Number.isFinite(value)&&value>=0?value:null;
          record({id:requestId,localReuse:false,status:'responded',model:config.model,httpStatus:res.status,attempt:attempt+1,transportAttempt:transportAttempt+1,...timing,durationMs:Date.now()-started,usageKnown:Number.isFinite(usage.prompt_tokens)&&Number.isFinite(usage.completion_tokens),promptTokens:count(usage.prompt_tokens),completionTokens:count(usage.completion_tokens),totalTokens:count(usage.total_tokens),cacheHitTokens:count(usage.prompt_cache_hit_tokens??usage.prompt_tokens_details?.cached_tokens),reasoningTokens:count(usage.completion_tokens_details?.reasoning_tokens)});
          if(res.status===429){const delayMs=gate.rateLimited(res.headers.get('retry-after'));return {res,result,delayMs};}
          return {res,result,transportDiagnostic:decoded.diagnostic};
        } catch(error) {
          const failure=normalizeModelTransportError(error,{stage:options.stage,timeoutMs,durationMs:Date.now()-started,httpStatus,sourceIds:options.sourceIds});
          record({id:requestId,localReuse:false,status:'failed',model:config.model,attempt:attempt+1,transportAttempt:transportAttempt+1,...timing,durationMs:Date.now()-started,usageKnown:false,errorCode:failure.code});
          if(taskId&&failure.diagnostic){const research=getTask(taskId)?.research||{};update(taskId,{research:{...research,modelDiagnostics:[...(research.modelDiagnostics||[]).slice(-19),{id:requestId,stage:options.stage||'模型分析',code:failure.code,...failure.diagnostic,recordedAt:new Date().toISOString()}]}});}
          throw failure;
        }
      }).then(value=>{if(value.res.status===429&&value.delayMs>30000)throw Error('模型服务限流，已降为串行；服务要求较长等待，请稍后从检查点重试。');return value;}));
      if(res.status!==429)break;
    }
    if (!res.ok) throw new Error(services.redact("模型服务返回 " + res.status + "（"+(res.headers.get('content-type')||'响应类型未知')+"）：" + (result?.error?.message || "请检查服务商请求记录、基础地址与模型路由。")));
    try {
      const parsed = parseModelResponse(result,transportDiagnostic);
      if (options.arrays?.some((name) => !Array.isArray(parsed.value[name]))) throw new ModelOutputError("MODEL_SCHEMA_INVALID", "模型缺少本阶段必需的结构化字段。", parsed.diagnostic);
      if(options.validate)try {options.validate(parsed.value);}catch(error){schemaFeedback=error.message;throw new ModelOutputError('MODEL_SCHEMA_INVALID',error.message,parsed.diagnostic);}
      if(typeof options.onDiagnostic==='function')options.onDiagnostic(parsed.diagnostic);
      if(taskId)await cache.write(cacheKey,parsed.value);
      return parsed.value;
    } catch (error) {
      if (!(error instanceof ModelOutputError)) throw error;
      previousFailure={code:error.code,maxTokens};
      if (taskId) {
        const research = getTask(taskId)?.research || {};
        update(taskId, { research: { ...research, modelDiagnostics: [...(research.modelDiagnostics || []).slice(-19), { id:randomUUID(),stage: options.stage || "模型分析", code: error.code, ...error.diagnostic, maxTokens,attempt: attempt + 1, automaticRetry: attempt+1<attempts&&!['MODEL_PROVIDER_ERROR','MODEL_REFUSED','MODEL_PROTOCOL_INVALID'].includes(error.code), recordedAt: new Date().toISOString() }] } });
      }
      if (attempt+1===attempts || ['MODEL_REFUSED','MODEL_PROVIDER_ERROR','MODEL_PROTOCOL_INVALID'].includes(error.code)) {const preflightFormatFailure=options.stage==='检索前覆盖审查兼容性预检'&&['MODEL_JSON_INVALID','MODEL_SCHEMA_INVALID'].includes(error.code);const detail=preflightFormatFailure?'模型接口已响应，但两次输出均未满足覆盖审查JSON格式；尚未开始公开资料搜索。请检查模型服务的JSON对象兼容性，搜索服务密钥无需因此修改。':error.message;const failure=Error((options.stage || "模型分析") + "：" + detail + "已保留阶段进度，可从中断处继续。");failure.code=error.code;throw failure;}
    }
  }
}

model.identity=()=>{const config=modelConfiguration(services.env());return requestDigest({base:config.baseUrl,model:config.model});};
return model;
}
