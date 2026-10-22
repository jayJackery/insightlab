const definitions=[
 ['summary','核心结论','先看整体判断与取舍'],['findings','关键问题与结论','逐条回答原始诉求'],['technology','技术方案与路线','可进一步选择具体技术主题'],['comparison','产品与竞品指标矩阵','规格、口径与可比状态'],['applications','产品与应用','定位、场景和应用差异'],['baseline','对自家产品的启示','相对基准的差距与影响'],['trends','技术与产品趋势','研究中保存的趋势判断'],['risks','机会与风险','机会、代价与不确定性'],['recommendations','建议与优先级','行动建议与验证条件'],['methods','分析范围与方法','研究假设和口径'],['questions','扩展研究问题与答案','详细问题的保存答案'],['review','验收状态','完整报告的待核验原因'],['limits','资料边界与待核实','当前未解决项'],['sources','来源清单','完整的引用资料与原文链接'],
];
const has=value=>Array.isArray(value)?value.length>0:typeof value==='string'?Boolean(value.trim()):Boolean(value&&typeof value==='object'&&Object.keys(value).length);
export function reportSections(task) {
 const report=task.report || {},evidence=task.evidence || {};
 const contents={summary:report.executiveSummary,findings:report.userQuestionAnswers?.length?report.userQuestionAnswers:report.questionAnswers?.length?report.questionAnswers:report.keyFindings,technology:report.technologyDeepDives?.length?report.technologyDeepDives:report.technologyOverview,comparison:evidence.competitorRows,applications:report.productApplications,baseline:report.baselineImplications,trends:report.trends,risks:report.opportunitiesAndRisks,recommendations:report.recommendations,methods:has(report.scopeAndMethod)||has(report.methodNotes),questions:report.userQuestionAnswers?.length?report.questionAnswers:null,review:task.quality&&!task.quality.publishable,limits:has(evidence.boundaryPresentation?.current)||has(evidence.conflicts)||has(evidence.gaps),sources:task.research?.sources};
 return definitions.filter(([id])=>has(contents[id])||contents[id]===true).map(([id,label,description])=>({id,label,description,...(id==='technology'?{topics:(report.technologyDeepDives || []).map((route,index)=>({index,label:route.heading || '技术主题 '+(index+1)}))}:{})}));
}
export class ExportSelectionError extends Error {constructor(message){super(message);this.name='ExportSelectionError';}}
export function resolveExportSelection(task,options={}) {
 const catalog=reportSections(task),available=new Set(catalog.map(section=>section.id));
 let sections=options.sections===undefined?catalog.map(section=>section.id):options.sections;
 if(!Array.isArray(sections)||!sections.length||sections.some(id=>typeof id!=='string'||!available.has(id)))throw new ExportSelectionError('请选择有效且有内容的报告章节。');
 sections=[...new Set(sections)];
 const topics=catalog.find(section=>section.id==='technology')?.topics || [];
 let topicIndexes=options.topicIndexes===undefined?(sections.includes('technology')?topics.map(topic=>topic.index):[]):options.topicIndexes;
 if(!Array.isArray(topicIndexes)||topicIndexes.some(index=>!Number.isInteger(index)||!topics.some(topic=>topic.index===index))||(!sections.includes('technology')&&topicIndexes.length)||(sections.includes('technology')&&topics.length&&!topicIndexes.length))throw new ExportSelectionError('技术主题选择无效，请重新选择。');
 topicIndexes=[...new Set(topicIndexes)];
 if(sections.every(id=>['sources','review','methods','limits'].includes(id)))throw new ExportSelectionError('请至少选择一个正文或研究问题章节。');
 return {sections,topicIndexes,isExcerpt:sections.length!==catalog.length||(sections.includes('technology')&&topicIndexes.length!==topics.length),catalog};
}
export function exportOptionsFromUrl(params) {
 const result={};
 if(params.has('sections'))result.sections=params.get('sections').split(',').filter(Boolean);
 if(params.has('topics'))result.topicIndexes=params.get('topics').split(',').filter(Boolean).map(value=>/^\d+$/.test(value)?Number(value):NaN);
 return result;
}
