// Never include request bodies, headers, credentials or upstream error text.
export function normalizeModelTransportError(error,{stage='模型分析',timeoutMs=120000,durationMs=0,httpStatus=null,sourceIds=[]}={}){
  const timeout=error?.name==='TimeoutError'||/timed?\s*out|timeout/i.test(error?.message||'');
  const network=error?.name==='TypeError';
  if(!timeout&&!network)return error;
  const code=timeout?'MODEL_TIMEOUT':'MODEL_NETWORK';
  const ids=(Array.isArray(sourceIds)?sourceIds:[]).filter(id=>/^S\d+$/.test(id));
  const message=stage+(ids.length?'（来源 '+ids.join('、')+'）':'')+'：'+(timeout?'请求超过'+Math.round(timeoutMs/1000)+'秒，尚未收到完整结果。':'连接中断，尚未收到完整结果。')+'已完成批次保留；将仅恢复失败部分。';
  return Object.assign(new Error(message),{code,diagnostic:{httpStatus,timeoutMs,durationMs,sourceIds:ids,transportFailure:timeout?'timeout':'network',usageKnown:false}});
}
