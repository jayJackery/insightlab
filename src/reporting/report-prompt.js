import {focusDescription} from '../../public/research-focus.js?v=7860f20d981283d9';
export const REPORT_PROMPT = [
  '基准是可选项。contract.baselineProduct为空时，不编自家产品差距、相对基准排名或同档入选结论；baselineImplications返回[]，围绕原问题解释技术/产品与应用取舍。requestedBaseline只是原始提法，needs_confirmation/unresolved候选不等于确认型号，不能把其参数移给用户所指产品；方法附录简短记录识别边界，不让用户先填基准才能得到答案。',
  '合理的通用机理、常识性因果推演和条件式建议可以作为分析判断写入正文，不因缺少竞品拆解就全部判作未知或要求用户逐项复核；必须不违背已知参数，明确分析判断与适用前提，不能宣称某型号已采用、已测试或已认证。人工复核只保留最多5个影响安全、关键比较或选型的事项，其余过程留档。',
  '每个U/Q答案必须严格含questionId、answer字符串、status（证据支持/部分支持/证据不足）、implication字符串、citations:[来源ID]、evidence:[{sourceId,quote}]。每个U另含非空relatedQuestionIds:[Q编号]，不可遗漏。无法逐字引用时evidence显式传[]。不能使用未知引用编号。',
  'Wh/kg只可引用证据表内status=derived、含formula及inputs的确定性计算结果，不允许自行除法或范围估算。禁止将CTB宣传等同电芯承载、能拆开等同允许用户维修、扩展端口等同热插拔。不能把同为LFP作为安全寿命差异主要来自BMS/热管理的证据。基准产品与竞品分别表述，所有章节对同一参数采用相同已核验边界；价格/质保缺资料时列地区、日期、裸机促销税费、保修主体和注册条件的核验动作。',
  '必须另返回userQuestionAnswers数组，按给定原始问题U编号逐条直接回答，不得遗漏原问题中的子句。每项格式与questionAnswers一致，但questionId用U，另附relatedQuestionIds:[支撑该答案的Q编号]。面向用户正文优先呈现U答案，Q答案保存在研究过程附录。原始问题的多项影响应分别解释，不要用笼统参数介绍取代机理。建议按用户给定场景分别写适用前提、代价和验证动作，不把扩容缺失一概视为短板。',
  "严格区分本轮未找到、已披露、计算所得、数据不可比；不得将本轮未找到写成厂商从未披露。标称Wh/整机净重可以在口径对齐时计算，不得称作pack级能量密度或实测输出电量。derived指标保留公式与输入。verification未通过的事实不得写成确定结论。",
  "按用户场景分别比较优点和代价：不可扩展可能是轻量化取舍，不能单凭功能缺失认定研发落后。寿命比较必须带剩余容量阈值、倍率、温度与测试条件；4000次至70%和3000次至80%不能直接排名。汽车/大型储能的热管理方案迁移到便携储能，必须交代成本、重量、功耗、密封和维修约束。",
  "根据需求、已确认计划和证据撰写面向研发人员、遵循本次技术或产品侧重点的中文竞品研究报告。关键发现必须直接回答研究问题，不能用搜到了什么资料或某产品有什么宣传功能代替答案。",
  "结论先行：摘要不超过180字，指出最重要的对比判断、取舍及对自家产品的影响，不堆参数。questionAnswers逐一对应给定Q编号，每项含questionId、answer（先给明确答案，再解释因果、原理与适用条件，80至200字）、status（证据支持/部分支持/证据不足）、implication（对设计或产品的影响）、citations和evidence。证据不足的问题也必须保留，说明能回答到哪一步及缺少什么，不能转去回答别的问题。",
  "技术详解由独立工程写作步骤提供，不需要重复写technologyOverview。scopeAndMethod放入研究过程附录。baselineImplications、productApplications、trends、opportunitiesAndRisks、recommendations返回对象数组，每项{heading:有信息量的短标题,lead:一到两句概述,points:[要点]}。要点数量按本次侧重点分配，可用Markdown加粗关键词。适合比较时可加table:{columns:[列名],rows:[[单元格]]}。机会与风险分开；建议给出动作、依据和验证条件，不虚构收益或优先级评分。区分来源事实、工程判断、待核实；不得引入证据外事实。部门规格库参数明确标记整理来源、区域与复核日期，不得冒充本轮直接核对的官方规格。事实与建议附给定来源ID。逐字引文必须能在抓取正文找到，摘要和部门整理记录不得冒充原文。",
  "所有产品叙述、应用要点和表格都使用品牌＋完整型号（例如Jackery Explorer 1500 Ultra、BLUETTI AC240、EcoFlow DELTA Pro 3），不能只写1500 Ultra、AC240或DELTA Pro 3。只补齐给定产品实体中的品牌，不猜未识别型号的厂家；原文摘录不改写。",
  "仅返回JSON：executiveSummary、userQuestionAnswers数组、questionAnswers数组、scopeAndMethod对象数组、baselineImplications对象数组、productApplications对象数组、trends对象数组、opportunitiesAndRisks对象数组、recommendations对象数组、methodNotes字符串数组。",
  '正文中突出准确厂商/型号。产品和技术判断均须回答“相对基准差在哪、为什么、适用什么场景、证据是什么”。技术内容明确绑定具体型号，通用参考不写成竞品已采用。章节标题优先写具体对象和差异，不用泛泛品牌介绍。篇幅服从本次侧重点，不能套用固定的技术百分比。',
].join("\n");
export function reportPromptForFocus(focus,delivery=focus.delivery) {
  const budget=focus.mode==='product'?'重点展开产品定位、目标用户、功能/性能矩阵、体验、价格质保、场景痛点和相对基准的优劣。每个产品相关章节2至4小节、每小节3至4点、每点60至100字；技术简述只解释关键产品差异，不压缩产品分析来凑技术占比。':focus.mode==='technical'?'重点放在已有技术主题。其他章节每章1至2小节、每小节2至3点，避免重复技术细节；逐问题答案仍须完整。':'技术与产品章节均围绕原始问题展开。产品相关章节每章2至3小节、每小节2至3点，避免一方挤占另一方。';
  const depth=delivery?'\n本次篇幅：'+delivery.label+'，'+delivery.characters+'。'+(delivery.route==='answer'?'这是明确问题的直接回答，不是行业报告。摘要只给答案，最多100字；逐条U/Q答案各80–180字，必要条件和来源保留。scopeAndMethod、baselineImplications、productApplications、trends、opportunitiesAndRisks、recommendations、methodNotes没有原问题明确需要时全部返回空数组；不要为了结构完整写无关章节。':delivery.level==='medium'?'各非技术章节最多1个必要小节、2至3条要点；无需覆盖原问题之外的行业趋势或建议。':delivery.level==='concise'?'保留全部原问题和必要结论，每个相关章节最多2条要点，无关章节返回空数组，不写行业综述。':'完整展开用户问题，需要的技术和产品章节按本次重点分配。'):'';
  return REPORT_PROMPT+'\n本次确认侧重点：'+focusDescription(focus)+'\n'+budget+'\n不要重复输出已提供的technologyDeepDives，摘要先给对比判断。'+depth;
}
