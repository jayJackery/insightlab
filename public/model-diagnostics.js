const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels={MODEL_EMPTY:'最终正文为空',MODEL_REASONING_ONLY:'只有推理，没有最终答案',MODEL_TRUNCATED:'输出长度达到上限',MODEL_PROVIDER_ERROR:'服务端执行失败',MODEL_PROTOCOL_INVALID:'传输格式不兼容',MODEL_RESPONSE_INVALID:'缺少回答字段',MODEL_JSON_INVALID:'正文不是完整JSON',MODEL_SCHEMA_INVALID:'JSON缺少必需字段',MODEL_REFUSED:'服务未提供回答'};
export function modelFailureHelp(task){
  if(task.status!=='failed')return '';
  const last=task.research?.modelDiagnostics?.at(-1);
  if(last?.code==='MODEL_PROTOCOL_INVALID'){
    const hasTransport=Number.isFinite(last.httpStatus)||typeof last.httpContentType==='string';
    if(!hasTransport)return '这是旧版任务：当时未保存HTTP状态和响应类型，无法从记录还原服务商返回了什么。请刷新页面后重新输入本页密钥，再从已保存阶段重试；只会继续未完成阶段，但会重新调用模型并可能产生费用。新版会保存安全响应摘要，且协议错误不再原样重试。';
    return '本次模型服务已应答，但返回内容不是可用的研究答案；页面只保留了状态、响应类型与长度，没有保存正文或密钥。请核对基础地址、模型路由与服务商请求记录。';
  }
  const empty=['MODEL_EMPTY','MODEL_REASONING_ONLY','MODEL_RESPONSE_INVALID'].includes(last?.code)||/空内容|正文为空|没有最终JSON/.test(task.error||'');
  if(!empty)return '';
  return (task.phaseIndex===0?'本次停在研究计划，尚未开始资料搜索。':'当前阶段未得到有效的模型答案。')+'请在服务配置运行新版“结构化兼容检测”，通过后重试当前阶段；之前的短连接成功不代表这次研究请求成功。';
}
export function renderModelDiagnostics(task){
  if(task.status!=='failed')return '';
  const rows=(task.research?.modelDiagnostics||[]).slice(-2);if(!rows.length)return '';
  const number=value=>Number.isFinite(value)&&value>=0?value:'未报告';
  const finish=value=>({stop:'正常结束',length:'达到长度上限',error:'服务端错误',content_filter:'内容过滤',tool_calls:'返回工具调用'})[value]||'未报告';
  const kinds={empty:'空响应',html:'网页/HTML',plain_text:'普通文本',json_invalid:'无效JSON',event_stream:'流式事件',malformed_sse:'不完整流式事件'};
  return '<details class="model-diagnostic"><summary>查看本次模型响应摘要</summary><p>仅显示状态、类型和数量，不保存正文、推理内容、密钥或完整响应。</p>'+rows.map(item=>'<div class="model-diagnostic-row"><strong>'+esc(item.stage||'模型分析')+' · 第'+number(item.attempt)+'次</strong><span>'+esc(labels[item.code]||'模型结果无法使用')+'</span><small>HTTP '+number(item.httpStatus)+' · 内容类型 '+esc(item.httpContentType||'未报告')+' · 响应形式 '+esc(kinds[item.httpBodyKind]||item.responseShape||'未报告')+' · 响应 '+number(item.httpBodyCharacters??item.responseCharacters)+' 字符 · 结束状态：'+finish(item.finishReason)+' · 推理 '+number(item.reasoningTokens)+' tokens · 总输出 '+number(item.completionTokens)+' tokens</small></div>').join('')+'</details>';
}
