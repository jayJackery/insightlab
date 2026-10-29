export class ModelOutputError extends Error {
  constructor(code, message, diagnostic) { super(message); this.code = code; this.diagnostic = diagnostic; }
}
const count=value=>Number.isFinite(value)&&value>=0?value:null;
const safeCode=value=>typeof value==='number'?value:typeof value==='string'&&/^[a-zA-Z0-9_-]{1,50}$/.test(value)?value:null;
const mediaType=value=>typeof value==='string'?value.split(';',1)[0].trim().toLowerCase()||'unknown':'unknown';
const textPart=value=>typeof value==='string'?value:Array.isArray(value)?value.filter(part=>['text','output_text'].includes(part?.type)&&typeof part.text==='string').map(part=>part.text).join(''):'';
function transportKind(body,type){
  const sample=body.trimStart().slice(0,160).toLowerCase();
  if(!body.trim())return 'empty';
  if(type==='text/event-stream'||/^data:\s*/m.test(body))return 'event_stream';
  if(type==='text/html'||sample.startsWith('<!doctype html')||sample.startsWith('<html'))return 'html';
  if(type.includes('json'))return 'json_invalid';
  return 'plain_text';
}
export function decodeModelHttpBody(body,contentType,httpStatus){
  const raw=typeof body==='string'?body:'',type=mediaType(contentType),base={httpStatus:Number.isInteger(httpStatus)?httpStatus:null,httpContentType:type,httpBodyCharacters:raw.length,httpBodyKind:transportKind(raw,type)};
  try{const result=JSON.parse(raw);if(result&&typeof result==='object'&&!Array.isArray(result))return {result,diagnostic:{...base,responseShape:Array.isArray(result.choices)?'choices':Object.keys(result).slice(0,8).join(',')||'empty_object'}};}catch{}
  if(base.httpBodyKind!=='event_stream')return {result:null,diagnostic:{...base,responseShape:'none'}};
  let content='',reasoningCharacters=0,finishReason=null,usage=null,providerError=null,events=0,toolCalls=false,doneSeen=false;
  for(const line of raw.split(/\r?\n/u)){
    if(!line.startsWith('data:'))continue;
    const data=line.slice(5).trim();if(!data)continue;if(data==='[DONE]'){doneSeen=true;continue;}
    let event;try{event=JSON.parse(data);}catch{continue;}events++;
    if(event?.error){providerError={code:event.error.code};continue;}
    usage=event?.usage||usage;
    for(const choice of Array.isArray(event?.choices)?event.choices:[]){
      const message=choice?.message||{},delta=choice?.delta||{};
      content+=textPart(delta.content)||textPart(message.content);
      for(const value of [delta.reasoning,delta.reasoning_content,message.reasoning,message.reasoning_content])if(typeof value==='string')reasoningCharacters+=value.length;
      if(Array.isArray(delta.reasoning_details))for(const item of delta.reasoning_details)reasoningCharacters+=typeof item?.text==='string'?item.text.length:typeof item?.summary==='string'?item.summary.length:0;
      if(Array.isArray(delta.tool_calls)||Array.isArray(message.tool_calls))toolCalls=true;
      if(typeof choice.finish_reason==='string')finishReason=choice.finish_reason;
    }
  }
  const complete=doneSeen&&Boolean(finishReason);
  if(events||providerError||content||reasoningCharacters||toolCalls)return {result:{choices:[{message:{content,...(reasoningCharacters?{reasoning:'[omitted]'}:{}),...(toolCalls?{tool_calls:[]}:{})},finish_reason:finishReason||'not_provided'}],...(usage?{usage}:{}),...(providerError?{error:providerError}:{})},diagnostic:{...base,responseShape:'server_sent_sse',sseEvents:events,sseComplete:complete,sseReasoningCharacters:reasoningCharacters}};
  return {result:null,diagnostic:{...base,responseShape:'malformed_sse',sseEvents:events,sseComplete:false}};
}
export function modelResponseDiagnostic(result,transport={}){
  const choice=result?.choices?.[0],message=choice?.message,content=message?.content;
  const text=textPart(content)||(message?.parsed&&typeof message.parsed==='object'?JSON.stringify(message.parsed):'');
  const reasoningCharacters=[message?.reasoning,message?.reasoning_content,...(Array.isArray(message?.reasoning_details)?message.reasoning_details.flatMap(item=>[item?.text,item?.summary]):[])].reduce((sum,value)=>sum+(typeof value==='string'?value.length:0),0);
  return {...transport,finishReason:safeCode(choice?.finish_reason)||'not_provided',responseCharacters:text.length,contentType:content===null?'null':Array.isArray(content)?'array':typeof content,choicesCount:Array.isArray(result?.choices)?result.choices.length:0,reasoningCharacters:Number.isFinite(transport.sseReasoningCharacters)?transport.sseReasoningCharacters:reasoningCharacters,reasoningTokens:count(result?.usage?.completion_tokens_details?.reasoning_tokens),completionTokens:count(result?.usage?.completion_tokens),promptTokens:count(result?.usage?.prompt_tokens),providerErrorCode:safeCode(result?.error?.code??choice?.error?.code),providerError:Boolean(result?.error||choice?.error),toolCalls:Boolean(message?.tool_calls?.length)};
}
export function parseModelResponse(result,transport={}) {
  const choice = result?.choices?.[0], message = choice?.message;
  const content = textPart(message?.content)||(message?.parsed&&typeof message.parsed==='object'?JSON.stringify(message.parsed):'');
  const diagnostic = modelResponseDiagnostic(result,transport);
  if(diagnostic.providerError||choice?.finish_reason==='error')throw new ModelOutputError('MODEL_PROVIDER_ERROR','模型服务在响应内报告执行失败'+(diagnostic.providerErrorCode?'（代码 '+diagnostic.providerErrorCode+'）':'')+'。请查看服务商的请求记录、额度或可用状态后重试。',diagnostic);
  if(!result||typeof result!=='object'||Array.isArray(result)){
    const reason=diagnostic.httpBodyKind==='html'?'接口返回了网页内容，通常是接口地址或网关路由不正确。':diagnostic.httpBodyKind==='event_stream'?'接口返回的流式事件不完整，未取得最终答案。':diagnostic.httpBodyKind==='empty'?'接口返回空响应。':diagnostic.httpBodyKind==='plain_text'?'接口返回普通文本而非Chat Completions JSON。':'接口响应不是有效的Chat Completions JSON。';
    throw new ModelOutputError('MODEL_PROTOCOL_INVALID',reason+'请检查基础地址、模型路由与服务商请求记录；本次未重复发送相同请求。',diagnostic);
  }
  if(!choice||!message)throw new ModelOutputError('MODEL_RESPONSE_INVALID','模型响应缺少choices.message，不能作为有效回答；请检查兼容接口与模型的响应格式。',diagnostic);
  if(diagnostic.httpBodyKind==='event_stream'&&diagnostic.sseComplete===false)throw new ModelOutputError('MODEL_STREAM_INCOMPLETE','模型网关返回的流式事件未正常结束，本次答案不完整，未用于研究。',diagnostic);
  if (choice?.finish_reason === "length") throw new ModelOutputError("MODEL_TRUNCATED", "模型输出达到长度上限而被截断，未发布不完整内容。", diagnostic);
  if (message?.refusal || choice?.finish_reason === "content_filter") throw new ModelOutputError("MODEL_REFUSED", "模型服务未提供本阶段内容。", diagnostic);
  if(diagnostic.toolCalls&&!content.trim())throw new ModelOutputError('MODEL_PROTOCOL_INVALID','接口只返回了工具调用，没有最终文本答案；请使用支持文本回答的模型或兼容路由。',diagnostic);
  if (!content.trim()) throw new ModelOutputError(diagnostic.reasoningCharacters||diagnostic.reasoningTokens?'MODEL_REASONING_ONLY':'MODEL_EMPTY',diagnostic.reasoningCharacters||diagnostic.reasoningTokens?'模型仅返回推理信息，没有最终JSON答案；推理不能代替研究结果。':'模型接口已响应，但最终正文为空，尚未取得可用于研究的JSON结果。', diagnostic);
  const text = content.trim().replace(/^\uFEFF/u, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    // Accept a single complete object surrounded by prose. Never invent missing braces or facts.
    const start = text.indexOf("{"); let depth = 0, quoted = false, escaped = false, end = -1;
    for (let i = start; start >= 0 && i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; continue; }
      if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end = i + 1; break; }
    }
    if (end > start && !/[{}]/.test(text.slice(end))) try { parsed = JSON.parse(text.slice(start, end)); } catch {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ModelOutputError("MODEL_JSON_INVALID", "模型返回的结构不完整或不符合JSON对象格式。", diagnostic);
  return { value: parsed, diagnostic };
}
