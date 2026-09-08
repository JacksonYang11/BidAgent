// Fictional preview records. Never use these as inputs to the live bidding workflow.
export const snapshot = '2026-09-08';
export const demoCompany = '星湾人力资源服务有限公司（虚构）';

export const opportunities = [
  {id:'opp-1',name:'云溪产业园招聘与驻场服务',city:'杭州',type:'招聘服务',amount:486,deadline:'2026-09-14',match:94,status:'招标中',buyer:'云溪产业服务中心（虚构）',source:'模拟公共资源交易公告',summary:'覆盖研发、行政和运营岗位招聘，配套驻场交付与月度服务复盘。'},
  {id:'opp-2',name:'海辰科技集团人力资源外包',city:'上海',type:'人力资源外包',amount:620,deadline:'2026-09-20',match:88,status:'招标中',buyer:'海辰科技集团（虚构）',source:'模拟企业采购公告',summary:'提供员工入离职手续、薪酬核算与服务台支持，岗位范围以正式附件为准。'},
  {id:'opp-3',name:'未来港园区劳务派遣服务',city:'杭州',type:'劳务派遣',amount:352,deadline:'2026-09-17',match:86,status:'招标中',buyer:'未来港园区运营公司（虚构）',source:'模拟政府采购公告',summary:'项目拟采购园区运营辅助岗位派遣服务，重点核查经营许可及用工边界。'},
  {id:'opp-4',name:'南湾制造基地招聘交付项目',city:'深圳',type:'招聘服务',amount:890,deadline:'2026-09-26',match:82,status:'招标中',buyer:'南湾制造有限公司（虚构）',source:'模拟企业采购公告',summary:'季节性招聘与岗位补充项目，需明确招聘批次、验收标准及替补条件。'},
  {id:'opp-5',name:'青禾医院辅助岗位服务外包',city:'南京',type:'人力资源外包',amount:540,deadline:'2026-09-15',match:79,status:'招标中',buyer:'青禾医院（虚构）',source:'模拟公共资源交易公告',summary:'非医疗辅助岗位服务外包，关注人员背景核验、保密和现场服务要求。'},
  {id:'opp-6',name:'西岭企业园后勤服务',city:'成都',type:'综合后勤',amount:760,deadline:'2026-10-03',match:77,status:'招标中',buyer:'西岭产业发展公司（虚构）',source:'模拟公共资源交易公告',summary:'综合后勤服务，需区分服务成果责任与具体用工管理要求。'},
  {id:'opp-7',name:'育新教育集团校园招聘',city:'杭州',type:'招聘服务',amount:88,deadline:'2026-09-22',match:74,status:'招标中',buyer:'育新教育集团（虚构）',source:'模拟企业采购公告',summary:'校园宣讲、简历筛选及面试组织，分阶段提交成果并验收。'},
  {id:'opp-8',name:'桂语企业园人事服务中心',city:'苏州',type:'人力资源外包',amount:395,deadline:'2026-09-11',match:90,status:'招标中',buyer:'桂语企业园运营中心（虚构）',source:'模拟采购邀请公告',summary:'员工服务中心外包，重点响应服务时间、人员配置及数据安全要求。'},
  {id:'opp-9',name:'东屿研发中心人才寻访',city:'北京',type:'招聘服务',amount:210,deadline:'2026-09-29',match:71,status:'招标中',buyer:'东屿研究院（虚构）',source:'模拟企业采购公告',summary:'专业人才寻访，按候选人到岗及保证期完成情况结算。'},
  {id:'opp-10',name:'明湖园区年度劳务派遣',city:'上海',type:'劳务派遣',amount:512,deadline:'2026-09-02',match:0,status:'中标公示',buyer:'明湖园区服务公司（虚构）',source:'模拟中标结果公告',winner:'启航人才服务公司（虚构）',winningAmount:498,summary:'年度劳务派遣项目中标结果展示。'},
  {id:'opp-11',name:'钱塘星谷人力资源服务',city:'杭州',type:'人力资源外包',amount:238,deadline:'2026-11-06',match:92,status:'到期预告',buyer:'钱塘星谷运营中心（虚构）',source:'模拟合同到期推演',summary:'现有服务合同即将到期，下一轮采购计划尚待确认。'},
  {id:'opp-12',name:'锦川企业集团招聘服务续约',city:'深圳',type:'招聘服务',amount:420,deadline:'2026-12-21',match:64,status:'到期预告',buyer:'锦川企业集团（虚构）',source:'模拟合同到期推演',summary:'续约窗口期线索，不代表采购方已发布招标公告。'},
];

export const contracts = [
  {id:'contract-1',name:'钱塘星谷人力资源服务',type:'人力资源外包',provider:'启航人才（虚构）',amount:238,date:'2026-11-06',score:92,note:'类似服务场景较多，可先核实下一年度采购范围。'},
  {id:'contract-2',name:'锦川企业集团招聘服务',type:'招聘服务',provider:'嘉禾人才（虚构）',amount:420,date:'2026-12-21',score:64,note:'当前服务方有续约机会，建议先了解项目调整计划。'},
  {id:'contract-3',name:'西岭园区综合后勤',type:'综合后勤',provider:'西岭服务（虚构）',amount:680,date:'2027-01-01',score:58,note:'服务范围较广，先评估团队配置与专业服务能力。'},
  {id:'contract-4',name:'清源集团劳务派遣',type:'劳务派遣',provider:'清源人才（虚构）',amount:356,date:'2027-01-19',score:81,note:'先核实派遣许可、岗位性质与用工比例要求。'},
  {id:'contract-5',name:'青禾医院辅助岗位外包',type:'人力资源外包',provider:'安和人力（虚构）',amount:465,date:'2027-02-03',score:76,note:'关注医院场景经验、人员准入和数据保密要求。'},
  {id:'contract-6',name:'未来港研发人才寻访',type:'招聘服务',provider:'研才咨询（虚构）',amount:520,date:'2027-02-28',score:88,note:'专业人才寻访需求集中，可准备行业岗位交付方案。'},
];

export const templates = [
  {id:'tpl-1',name:'招聘交付服务方案',type:'招聘服务',source:'行业示例',uses:386,quality:96,chapters:['项目理解','招聘渠道与人才触达','筛选面试与交付','到岗跟踪与替补','质量保障与验收']},
  {id:'tpl-2',name:'劳务派遣服务投标方案',type:'劳务派遣',source:'行业示例',uses:254,quality:94,chapters:['服务范围与合规边界','人员招募与入职','劳动关系与社保','日常服务管理','风险处置与交接']},
  {id:'tpl-3',name:'人力资源外包实施方案',type:'人力资源外包',source:'行业示例',uses:218,quality:93,chapters:['项目理解与交付目标','服务团队','业务办理流程','数据安全','服务考核与持续改进']},
  {id:'tpl-4',name:'产业园综合后勤方案',type:'综合后勤',source:'行业示例',uses:176,quality:92,chapters:['服务范围','岗位配置','现场作业标准','应急预案','服务验收']},
  {id:'tpl-5',name:'校园招聘项目范本',type:'招聘服务',source:'行业示例',uses:143,quality:95,chapters:['校招策略','校企渠道','宣讲面试执行','录用与到岗','项目复盘']},
  {id:'tpl-6',name:'云溪园区历史方案',type:'人力资源外包',source:'企业示例',uses:87,quality:97,chapters:['需求分析','服务组织','人事服务台','质量保障','信息安全']},
];

export const assets = [
  {id:'asset-1',name:'招聘交付全流程作业标准',type:'服务标准',category:'招聘服务',project:'云溪产业园（虚构）',uses:342,quality:97,content:'需求确认、岗位画像、渠道投放、筛选面试、录用跟进和到岗回访形成可追溯流程。每个阶段设置交付物和人工确认节点。'},
  {id:'asset-2',name:'员工入离职办理服务规范',type:'作业规程',category:'人力资源外包',project:'桂语企业园（虚构）',uses:298,quality:96,content:'办理前核验授权和必需资料，处理过程保留交接清单。离职环节涉及薪资、社保、系统权限时，由对应责任方确认。'},
  {id:'asset-3',name:'集中招聘高峰应急预案',type:'应急预案',category:'招聘服务',project:'南湾制造基地（虚构）',uses:256,quality:94,content:'针对候选人临时缺席、渠道供应不足及面试场地异常设置预案。备选渠道、责任人和响应时限须在项目启动时确认。'},
  {id:'asset-4',name:'用工合规核查清单',type:'服务标准',category:'劳务派遣',project:'未来港园区（虚构）',uses:187,quality:95,content:'核查经营许可、岗位性质、劳动合同、社保缴纳及用工比例。此清单为演示案例，不替代专业法律审核。'},
  {id:'asset-5',name:'驻场人事服务项目复盘',type:'成功案例',category:'人力资源外包',project:'海辰科技（虚构）',uses:164,quality:93,content:'案例展示需求变更记录、问题分类和月度复盘的组织方式。项目名称、过程和结果均为虚构，不能作为真实投标业绩证明。'},
  {id:'asset-6',name:'项目启动与交接计划',type:'实施方案',category:'通用',project:'跨项目示例',uses:421,quality:98,content:'项目启动先确认范围、联系人与服务日历，再组织资料交接、人员培训和试运行。所有承诺指标须根据招标要求及企业事实另行确认。'},
];

export const reviewItems = [
  {id:'risk-1',level:'高',category:'资质材料',title:'许可证明缺少有效期页',location:'商务文件 / 第 8 页',source:'演示条款：投标人须提供有效许可证复印件。',issue:'示例附件只包含证照首页，未见有效期信息。',suggestion:'补齐证照页面，并人工核对投标截止日的有效状态。'},
  {id:'risk-2',level:'高',category:'暗标规范',title:'暗标章节包含企业标识',location:'技术文件 / 第 16 页',source:'演示条款：技术暗标不得出现可识别投标人身份的信息。',issue:'示例第三章出现“星湾人力”名称。',suggestion:'核对暗标要求，替换名称并检查页眉、页脚和文件属性。'},
  {id:'risk-3',level:'中',category:'响应一致性',title:'招聘进度承诺与要求不一致',location:'技术文件 / 第 23 页',source:'演示条款：启动后 10 个工作日内提交首批候选人。',issue:'示例方案写为 15 个工作日，与要求不一致。',suggestion:'确认交付能力后调整安排，不自动代替企业作出承诺。'},
  {id:'risk-4',level:'中',category:'签章附件',title:'分项报价表待签章确认',location:'商务文件 / 第 32 页',source:'演示条款：分项报价表须按规定签字盖章。',issue:'示例附件中的签章位置为空。',suggestion:'按招标文件要求补齐签章并复核最终导出文件。'},
  {id:'risk-5',level:'低',category:'格式规范',title:'页码编号格式不统一',location:'技术文件 / 第 35 页',source:'演示条款：页码连续、格式统一。',issue:'示例第五章使用了不同的页码格式。',suggestion:'在文字处理软件中统一页码格式并检查目录关联。'},
  {id:'risk-6',level:'低',category:'文字校对',title:'岗位名称存在两处不一致',location:'技术文件 / 第 12 页',source:'演示条款：岗位名称须与人员配置表一致。',issue:'示例中的“项目主管”与“项目经理”混用。',suggestion:'核对组织架构后统一岗位名称。'},
];

export const chapters = [
  {id:'chapter-1',title:'项目理解与服务目标',weight:12,text:'围绕示例项目的岗位需求和采购范围，明确服务边界、交付成果及双方职责。具体指标须按正式招标文件核对。'},
  {id:'chapter-2',title:'组织架构与人员配置',weight:10,text:'建立项目负责人、招聘交付和客户服务协作机制。人员姓名、资质及投入时间均需补充真实资料后确认。'},
  {id:'chapter-3',title:'招聘与人事服务方案',weight:28,text:'按需求确认、人员招募、筛选面试、到岗跟进和日常服务设置交付节点，形成项目执行记录。'},
  {id:'chapter-4',title:'信息系统与数据安全',weight:15,text:'对人员信息实行最小必要授权，约定资料流转、保存期限和删除机制，关键操作留存审计记录。'},
  {id:'chapter-5',title:'应急处置与风险管理',weight:18,text:'对人员临时缺岗、集中交付延期和系统故障设置分级响应。预案责任人及响应时间需双方确认。'},
  {id:'chapter-6',title:'质量考核与持续改进',weight:9,text:'按月复盘交付质量、服务问题和整改情况，考核指标以双方确认的合同附件为准。'},
  {id:'chapter-7',title:'进场交接与实施计划',weight:5,text:'开展资料交接、业务培训与试运行，形成项目启动清单，并由采购方确认服务切换条件。'},
  {id:'chapter-8',title:'商务响应与材料清单',weight:3,text:'列出报价说明、资质证明和偏离事项，所有金额、证照与签章信息保留待核对状态。'},
];

export const monthly = [
  {month:'2025-09',bids:820,awards:610},{month:'2025-10',bids:760,awards:580},
  {month:'2025-11',bids:940,awards:700},{month:'2025-12',bids:1010,awards:760},
  {month:'2026-01',bids:880,awards:640},{month:'2026-02',bids:1150,awards:860},
  {month:'2026-03',bids:1230,awards:900},{month:'2026-04',bids:1090,awards:820},
  {month:'2026-05',bids:1300,awards:980},{month:'2026-06',bids:1180,awards:890},
  {month:'2026-07',bids:1340,awards:1010},{month:'2026-08',bids:1284,awards:966},
];
