export function modelRequestPolicy(config,options={},attempt=0,previous){
  const host=new URL(config.baseUrl).hostname;
  const deepseek=host==='api.deepseek.com'&&/^deepseek-(?:flash|v4-pro)$/.test(config.model);
  const siliconFlow=host==='api.siliconflow.cn'&&/^(?:Pro\/)?deepseek-ai\/DeepSeek-V4(?:-Flash)?$/i.test(config.model);
  const siliconFlowV41=host==='api.siliconflow.cn'&&/^deepseek-ai\/DeepSeek-V4\.1-Flash$/i.test(config.model);
  const siliconFlowXing=host==='api.siliconflow.cn'&&/^XingChenAGI\/Xing4\.0-29B$/i.test(config.model);
  const routerMiniMax=host==='openrouter.ai'&&/^minimax\/minimax-m3(?:[.-]|$)/i.test(config.model);
  const reasoningRetry=attempt>0&&(['MODEL_REASONING_ONLY','MODEL_TRUNCATED'].includes(previous?.code)||(routerMiniMax&&previous?.code==='MODEL_EMPTY'));
  const thinking=deepseek?(options.reasoning==='low'&&attempt===0?{thinking:{type:'enabled'},reasoning_effort:'low'}:{thinking:{type:'disabled'}}):routerMiniMax&&(options.reasoning==='low'||reasoningRetry)?{reasoning:{effort:'low'}}:siliconFlowV41?{enable_thinking:options.thinkingPhase==='review'}:(siliconFlow||siliconFlowXing)?{enable_thinking:false}:{};
  let maxTokens=options.maxTokens||8192;
  if(deepseek&&thinking.thinking.type==='enabled')maxTokens=Math.max(16000,maxTokens);
  if(reasoningRetry)maxTokens=Math.max(maxTokens,Math.min(16384,(previous.maxTokens||maxTokens)*2));
  return {thinking,maxTokens,stream:siliconFlow||siliconFlowV41};
}
