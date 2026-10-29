import {resolveReportDepth,focusForDelivery} from './report-depth.js?v=983914e21674fb3e';
const profiles={
  technical:{label:'技术原理与实现',minimumTopics:4,maximumTopics:6,queryShare:0.65,topicCharacters:650,minimumEngineeringDocuments:3},
  product:{label:'产品与竞品对比',minimumTopics:0,maximumTopics:2,queryShare:0.2,topicCharacters:350,minimumEngineeringDocuments:0},
  balanced:{label:'综合分析',minimumTopics:2,maximumTopics:4,queryShare:0.4,topicCharacters:500,minimumEngineeringDocuments:2},
};
export function resolveResearchFocus(input={}) {
  const request=[input.subject,input.questions,input.metrics,input.purpose].filter(Boolean).join('\n');
  const ratio=request.match(/技术(?:正文|内容|部分|分析)?\s*(?:占比|占|比例|篇幅|不超过|不少于|至少|最多|超过|低于)[^\d\n]{0,8}(100|\d{1,2})\s*[%％]/u);
  const chosen=['technical','product','balanced'].includes(input.analysisFocus)?input.analysisFocus:null;
  let mode=chosen,source=chosen?'selection':'default',reason=chosen?'使用你选择的分析侧重点':'未发现明确倾向，采用综合分析';
  if(!mode) {
    const emphasis=[...request.matchAll(/(?:更关注|重点关注|侧重|重点分析|聚焦|以)([^。；\n]{0,36})/gu)].map(match=>match[1].replace(/(?:不|无需|不要)(?:再|过度|重点|更)?(?:关注|分析|讲述|强调)?[^，；。\n]*/gu,'')).join('；');
    const tech=/技术|原理|架构|实现|工艺|电路|控制算法/u.test(emphasis),product=/产品|市场|定位|用户|体验|价格|商业|功能对比/u.test(emphasis);
    if(tech!==product){mode=tech?'technical':'product';source='request';reason='根据需求中明确的侧重点识别';}
    else {
      const technical=(request.match(/原理|架构|拓扑|实现|工艺|拆解|控制算法|热管理|电路|PACK结构/giu)||[]).length;
      const product=(request.match(/市场定位|用户体验|目标人群|定价|价格|渠道|产品定位|销售|功能对比|商业模式/gu)||[]).length;
      mode=technical>product+1?'technical':product>technical+1?'product':'balanced';
      source=technical||product?'keywords':'default';reason=source==='keywords'?'根据问题和关注指标综合识别，可在计划确认时调整':reason;
    }
  }
  let explicitTarget=null;
  if(ratio){explicitTarget=Number(ratio[1])/100;mode=explicitTarget>=0.6?'technical':explicitTarget<=0.4?'product':'balanced';source='explicit_ratio';reason='需求明确指定技术占比'+Number(ratio[1])+'%，以该要求为准';}
  const profile={...profiles[mode],mode,source,reason,enforceShare:explicitTarget!==null};
  if(explicitTarget!==null){
    const qualifier=ratio[0]+request.slice(ratio.index+ratio[0].length,ratio.index+ratio[0].length+3);
    profile.ratioKind=/不超过|至多|最多|不高于|以下|以内|低于/u.test(qualifier)?'maximum':/不少于|至少|不低于|以上|超过|大于/u.test(qualifier)?'minimum':'target';
    profile.technicalTarget=explicitTarget;profile.targetRange=profile.ratioKind==='minimum'?[explicitTarget,1]:profile.ratioKind==='maximum'?[0,explicitTarget]:[Math.max(0,explicitTarget-0.05),Math.min(1,explicitTarget+0.05)];
    profile.minimumTopics=explicitTarget===0?0:explicitTarget<0.4?1:profile.minimumTopics;profile.maximumTopics=explicitTarget===0?0:profile.maximumTopics;profile.queryShare=explicitTarget===0?0:Math.max(0.1,explicitTarget);
  }
  return focusForDelivery(profile,resolveReportDepth(input));
}
export function focusDescription(focus) {
  return focus.label+'；'+focus.reason+'。'+(focus.enforceShare?'技术正文'+({minimum:'至少',maximum:'至多',target:'目标'}[focus.ratioKind] || '目标')+Math.round(focus.technicalTarget*100)+'%（写作与验收区间'+Math.round(focus.targetRange[0]*100)+'%–'+Math.round(focus.targetRange[1]*100)+'%）。':'章节详略按问题覆盖分配，技术占比仅作阅读参考，不设固定比例门槛。');
}
