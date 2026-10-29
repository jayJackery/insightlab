export const PLAN_ARRAYS=['questions','queries','criteria','competitors','assumptions','sourceStrategy'];
export function validatePlanShape(value){
  for(const name of PLAN_ARRAYS)if(!Array.isArray(value[name])||value[name].some(item=>typeof item!=='string'||!item.trim()))throw Error('计划字段'+name+'必须是字符串数组。');
  if(!value.questions.length||!value.queries.length)throw Error('研究计划缺少问题或有效查询。');
}
const COVERAGE_ARRAYS=['questions','technicalGaps','missingSpecifications','followupQueries'];
export function validateCoverageShape(value){
  if(!Array.isArray(value.questions)||!value.questions.length)throw Error('覆盖审查缺少questions数组。');
  for(const question of value.questions){
    if(!question||typeof question!=='object'||!['answered','partial','missing'].includes(question.status)||typeof question.questionId!=='string'||typeof question.missing!=='string')throw Error('覆盖审查questions字段结构无效。');
  }
  if(!value.technical||typeof value.technical!=='object'||['principle','implementation','tradeoffs','validation'].some(key=>typeof value.technical[key]!=='boolean'))throw Error('覆盖审查technical字段结构无效。');
  if(!Array.isArray(value.technicalGaps)||!Array.isArray(value.missingSpecifications)||!Array.isArray(value.followupQueries))throw Error('覆盖审查缺少必需数组。');
  for(const item of value.missingSpecifications)if(!item||typeof item.product!=='string'||!Array.isArray(item.metrics)||item.metrics.some(metric=>typeof metric!=='string'))throw Error('覆盖审查missingSpecifications字段结构无效。');
  if(value.followupQueries.some(query=>typeof query!=='string'))throw Error('覆盖审查followupQueries必须是字符串数组。');
}
// Same transport, output parser and plan shape as production; no credential/response logging.
export async function checkModelCompatibility(model,modelName){
  await model([
    {role:'system',content:'这是研究应用的JSON兼容检测。只返回一个完整JSON对象，不输出推理或Markdown。字段questions、queries、criteria、competitors、assumptions、sourceStrategy均为字符串数组，questions和queries至少一项。'},
    {role:'user',content:'为一个公开示例问题制定极小计划：查找Example 1000的标称容量。只需一条问题、一条查询、一个指标；其他数组可以为空。不得编造产品容量或结论。'},
  ],{stage:'模型结构化兼容检测',arrays:PLAN_ARRAYS,validate:validatePlanShape,maxTokens:4096,maxAttempts:1,reasoning:'low'});
  return '结构化兼容检测通过 · '+modelName+'；已取得非空JSON和有效计划字段。小样本通过不保证长研究每次成功。';
}
// Catch endpoints that accept plan JSON but fail on the structured coverage-review shape,
// before the workflow spends time and search budget collecting sources.
export async function checkCoverageCompatibility(model){
  // Keep this probe deliberately mechanical: it verifies JSON-object mode and the
  // exact coverage shape without asking the model to perform substantive analysis.
  await model([
    {role:'system',content:'输出一个完整JSON对象，禁止Markdown、代码围栏、解释文字和推理内容。必须严格符合此形状：{"questions":[{"questionId":"Q1","status":"partial","missing":"缺少风道与温升验证证据"}],"technical":{"principle":false,"implementation":false,"tradeoffs":false,"validation":false},"technicalGaps":["缺少风道与温升验证证据"],"missingSpecifications":[],"followupQueries":["Example 1000 cooling airflow teardown"]}。所有字段必须存在，类型必须一致。'},
    {role:'user',content:'这是格式兼容检测，不要求分析真实产品。请原样生成系统消息中给出的示例JSON对象。'},
  ],{stage:'检索前覆盖审查兼容性预检',arrays:COVERAGE_ARRAYS,validate:validateCoverageShape,maxTokens:1024,maxAttempts:2});
  return true;
}
