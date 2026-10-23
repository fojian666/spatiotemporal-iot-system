export type KnowledgeCategory =
  | 'perception'
  | 'network'
  | 'spacetime'
  | 'platform'
  | 'intelligence'
  | 'application'
  | 'security';

export interface KnowledgeNode {
  id: string;
  name: string;
  category: KnowledgeCategory;
  desc: string;
  source: string;
  props?: Record<string, string>;
}

export interface KnowledgeLink {
  source: string;
  target: string;
  rel: string;
}

export const CATEGORY_META: Record<
  KnowledgeCategory,
  { label: string; color: string; short: string }
> = {
  perception: { label: '感知与执行', color: '#4be1ff', short: '感知' },
  network: { label: '网络与连接', color: '#6c9dff', short: '网络' },
  spacetime: { label: '时空信息', color: '#23e6b0', short: '时空' },
  platform: { label: '平台与数据', color: '#a78bfa', short: '平台' },
  intelligence: { label: '智能与模型', color: '#ffbc5c', short: '智能' },
  application: { label: '场景与应用', color: '#ff84a8', short: '应用' },
  security: { label: '安全与治理', color: '#ff6b6b', short: '安全' },
};

const node = (
  id: string,
  name: string,
  category: KnowledgeCategory,
  desc: string,
  source: string,
  props?: Record<string, string>,
): KnowledgeNode => ({ id, name, category, desc, source, props });

export const KNOWLEDGE_NODES: KnowledgeNode[] = [
  node('root', '时空智能物联网', 'platform', '以统一时空基准组织感知、连接、数据与智能能力，实现物理世界的持续观测、语义理解与自主决策。', '课程总论', {
    范式: '感知—认知—决策—行动',
    核心: '时空基准 + 物联感知 + 领域大模型',
  }),
  node('sensor', '智能传感器', 'perception', '将温度、湿度、水质、位移等物理量转换为可传输信号的感知单元，是物联网数据链的起点。', '感知层', {
    接口: 'I²C / RS-485 / 模拟量',
    典型: '气象六要素、多参数水质、GNSS 位移计',
  }),
  node('rfid', 'RFID 电子标签', 'perception', '利用射频实现非接触式目标识别，常用于资产标识、溯源与门禁管理。', '感知层', {
    频段: 'LF / HF / UHF',
    标准: 'ISO 18000-6C',
  }),
  node('camera', '视频感知', 'perception', '通过固定点位或移动平台采集连续影像，为视觉识别、事件取证提供非结构化数据。', '感知层', {
    协议: 'GB/T 28181 / RTSP',
    特点: '高带宽、连续流',
  }),
  node('gnss', '北斗 / GNSS', 'perception', '提供统一时空基准，为设备、人员、车辆与无人机提供定位与授时能力。', '时空基准', {
    服务: '定位 / 授时 / 短报文',
    精度: '米级—厘米级（RTK）',
  }),
  node('rs', '遥感对地观测', 'perception', '利用卫星或航空平台获取地表多光谱、热红外与雷达影像，支撑大范围变化监测。', '天基感知', {
    平台: '光学 / SAR / 高光谱',
    分辨率: '0.5m—10m',
  }),
  node('uav', '无人机', 'perception', '搭载相机、热成像与多光谱载荷，按航线完成巡检、测绘与应急侦察，是空中移动感知节点。', '无人系统', {
    链路: '5G / 图传 / MAVLink',
    载荷: '可见光 / 热红外 / 多光谱',
  }),
  node('ugv', '无人车', 'perception', '在地面按规划路径自主行驶，搭载传感器完成巡护、采样与物资投送。', '无人系统', {
    导航: 'RTK + 激光雷达 + 视觉',
    系统: 'ROS 2',
  }),
  node('usv', '无人船', 'perception', '面向水域自主航行与定点采样，可搭载水质探头、侧扫声呐与视频设备。', '无人系统', {
    任务: '水质采样 / 水下地形',
    通信: '4G / 数传电台',
  }),
  node('edgeNode', '边缘感知节点', 'perception', '在靠近数据源侧完成采集汇聚、协议转换与初级过滤，降低回传带宽与时延。', '边缘计算', {
    能力: '本地规则 / 轻量推理',
    价值: '低时延、断网自治',
  }),

  node('nbiot', 'NB-IoT', 'network', '授权频谱蜂窝低功耗广域网，覆盖广、连接密度高，适合低速率、长周期遥测业务。', '网络层', {
    速率: '~100 kbps',
    优势: '广覆盖 / 低功耗 / 海量连接',
  }),
  node('lora', 'LoRaWAN', 'network', '基于扩频调制的低功耗广域网，可自建网关，适合园区与林区等场景的远距离遥测。', '网络层', {
    频段: '免授权 ISM',
    拓扑: '星型',
  }),
  node('g5', '5G 网络切片', 'network', '在同一物理网络上划分差异化逻辑网络，为视频回传、无人机控制提供高带宽与低时延保障。', '网络层', {
    特性: 'eMBB / uRLLC / mMTC',
    场景: '无人机 / 高清视频 / 大规模物联',
  }),
  node('mqtt', 'MQTT', 'network', '轻量级发布/订阅消息协议，基于 TCP，支持三级 QoS 与遗嘱消息，是物联网平台的主流接入协议。', '网络层', {
    模式: 'Pub/Sub',
    端口: '1883 / 8883',
    QoS: '0 / 1 / 2',
  }),
  node('coap', 'CoAP', 'network', '面向受限设备的 RESTful 协议，基于 UDP，报文紧凑，适合低功耗传感网。', '网络层', {
    模式: '请求/响应 + Observe',
    传输: 'UDP',
  }),
  node('gateway', '边缘网关', 'network', '汇聚多协议设备数据，完成协议转换、数据清洗、本地缓存与安全接入。', '边缘计算', {
    协议: 'MQTT / Modbus / OPC UA',
    能力: '断网续传 / 本地推理',
  }),
  node('tsn', '时间敏感网络 TSN', 'network', '通过时间同步与流量整形提供确定性时延，支撑工业控制与多源数据同步。', '网络层', {
    标准: 'IEEE 802.1',
    价值: '确定性 / 时钟同步',
  }),
  node('satcom', '卫星通信', 'network', '为无地面网络覆盖区域提供回传链路，北斗短报文可用于应急位置上报。', '网络层', {
    类型: '低轨宽带 / 北斗短报文',
    场景: '林区 / 应急',
  }),

  node('spacetime', '时空智能', 'spacetime', '将时间、空间与语义统一建模，使系统不仅能回答“是什么”，还能回答“在哪里、何时、将如何变化”。', '核心范式', {
    三要素: '时间 + 空间 + 语义',
    闭环: '观测 → 建模 → 推演 → 行动',
  }),
  node('gis', 'GIS 地理信息系统', 'spacetime', '对地理空间数据进行组织、管理、分析与可视化的技术体系，是一张图的底座。', '时空信息', {
    能力: '图层叠加 / 空间分析 / 制图',
    格式: 'GeoJSON / Shapefile / MVT',
  }),
  node('sdb', '时空数据库', 'spacetime', '同时管理空间几何、时间序列与业务属性的数据基础设施，支持时空范围查询与轨迹检索。', '时空信息', {
    代表: 'PostGIS / TimescaleDB / GeoMesa',
    能力: '时空联合索引',
  }),
  node('sindex', '时空索引', 'spacetime', '通过 GeoSorted、R 树、GeoHash 或时空网格将空间邻近性与时间连续性编码，加速查询。', '时空信息', {
    结构: 'R-Tree / GeoHash / GeoSOT',
    目标: '降低时空检索复杂度',
  }),
  node('traj', '轨迹数据', 'spacetime', '由移动对象在时间序列上的位置点构成，蕴含路径、停留、速度与行为模式。', '时空信息', {
    模型: '点序列 / 路网匹配',
    应用: '无人机航迹 / 车辆巡护',
  }),
  node('twin', '数字孪生', 'spacetime', '物理实体的实时虚拟映射，通过传感数据驱动模型演化，支持仿真推演与反向控制。', '时空信息', {
    要素: '几何 + 状态 + 行为 + 规则',
    支撑: '实时数据 / 物理模型 / 可视化',
  }),
  node('geofence', '电子围栏', 'spacetime', '以空间多边形定义管控边界，结合实时定位判断越界、闯入与禁飞等空间事件。', '时空信息', {
    算法: '点在多边形内 / 距离判断',
    应用: '水源保护 / 禁飞区',
  }),
  node('grid', '时空网格', 'spacetime', '将地球空间剖分为多级网格单元，实现空天地数据的一致索引与聚合计算。', '时空信息', {
    标准: 'GeoSOT / 北斗网格码',
    价值: '跨源数据对齐',
  }),
  node('remote', '遥感影像', 'spacetime', '卫星或航空传感器获取的栅格影像，可用于地表覆盖分类、水质反演与变化检测。', '时空信息', {
    类型: '多光谱 / 热红外 / SAR',
    处理: '辐射定标 / 融合 / 反演',
  }),
  node('position', '时空定位', 'spacetime', '融合 GNSS、惯性导航、视觉与基站信息，确定对象在统一时空基准下的位置与姿态。', '时空信息', {
    技术: 'RTK / IMU / SLAM',
    精度: '厘米级—米级',
  }),

  node('access', '统一设备接入', 'platform', '通过物模型、设备影子与协议适配屏蔽异构设备差异，实现即插即用与统一管控。', '平台层', {
    核心: '物模型 / 设备影子',
    协议: 'MQTT / CoAP / HTTP',
  }),
  node('stream', '流式计算', 'platform', '对连续到达的遥测数据进行窗口聚合、异常检测与实时指标计算。', '平台层', {
    代表: 'Flink / Kafka Streams',
    模式: '窗口 / 水位线 / 状态',
  }),
  node('rules', '规则引擎', 'platform', '将阈值、时空约束与业务条件表达为可执行规则，实现告警触发与自动联动。', '平台层', {
    表达: 'IF 条件 THEN 动作',
    场景: '越限告警 / 越界联动',
  }),
  node('orchestration', '任务编排', 'platform', '将航线、载荷动作与无人系统资源组合为可执行任务，支持计划、调度与回滚。', '平台层', {
    对象: '无人机 / 无人车 / 无人船',
    能力: '计划 / 调度 / 重规划',
  }),
  node('media', '媒体资产库', 'platform', '统一沉淀照片、视频与点云成果，关联任务、设备、时间与空间位置。', '平台层', {
    元数据: '拍摄参数 / 姿态 / 位置',
    价值: '可追溯的数据资产',
  }),
  node('openapi', '开放 API', 'platform', '以标准接口向业务系统开放设备、数据与算法能力，支撑跨部门协同。', '平台层', {
    风格: 'REST / WebSocket / Webhook',
    治理: '鉴权 / 限流 / 审计',
  }),
  node('datamart', '湖仓数据底座', 'platform', '汇聚遥测、影像、业务与日志数据，为分析与模型训练提供统一数据视图。', '平台层', {
    层次: 'ODS → DWD → ADS',
    能力: '批流一体',
  }),
  node('metadata', '元数据与本体', 'platform', '描述数据含义、来源、质量与实体关系，是知识图谱构建与语义互操作的基础。', '平台层', {
    内容: '数据字典 / 本体 / 血缘',
    标准: 'Schema.org / SOSA',
  }),
  node('observability', '可观测性', 'platform', '通过指标、日志与链路追踪掌握设备、网络与平台的运行健康度。', '平台层', {
    三支柱: 'Metrics / Logs / Traces',
    对象: '设备在线率 / 消息时延',
  }),

  node('kg', '物联网知识图谱', 'intelligence', '以实体—关系—属性组织设备、空间对象、事件、协议与业务概念，支持语义检索与可解释推理。', '智能层', {
    模型: '本体 + 三元组',
    推理: '路径查找 / 规则推理 / 图嵌入',
  }),
  node('llm', '物联网大模型', 'intelligence', '面向物联场景的多模态基础模型，理解遥测、影像、图谱与自然语言，生成分析结论与行动建议。', '智能层', {
    能力: '多模态理解 / 工具调用 / 报告生成',
    约束: '事实校验 / 权限控制',
  }),
  node('rag', '检索增强生成 RAG', 'intelligence', '先检索领域知识与实时数据，再交由大模型组织回答，降低幻觉并让结论可追溯。', '智能层', {
    流程: 'Embedding → 召回 → 重排 → 生成',
    来源: '知识图谱 / 文档 / 遥测',
  }),
  node('agent', '智能体 Agent', 'intelligence', '具备目标分解、工具选择与执行反馈能力的自治单元，可调用平台 API 完成闭环任务。', '智能层', {
    循环: '感知 → 规划 → 行动 → 反思',
    工具: '查询 / 调度 / 告警 / 报告',
  }),
  node('cv', '视觉识别', 'intelligence', '利用目标检测、分割与变化检测从影像中提取事件与要素。', '智能层', {
    模型: 'YOLO / SAM / 变化检测',
    场景: '烟火 / 漂浮物 / 违规占道',
  }),
  node('forecast', '时序预测', 'intelligence', '基于历史遥测与外部因子预测水位、水质、负荷等未来状态。', '智能层', {
    模型: 'LSTM / TCN / Transformer',
    输出: '点预测 + 置信区间',
  }),
  node('copilot', '物联智能助手', 'intelligence', '以自然语言为入口，融合实时态势、知识图谱与工具调用，为值班人员提供可执行的决策建议。', '智能层', {
    交互: '对话 / 图表 / 命令',
    原则: '可解释 / 可追溯 / 人在回路',
  }),
  node('embedding', '向量检索', 'intelligence', '将文本、图像与实体属性编码为向量，通过相似度检索实现跨模态语义召回。', '智能层', {
    索引: 'HNSW / IVF',
    距离: '余弦相似度',
  }),

  node('water', '智慧水务', 'application', '融合水质、水文、视频与遥感数据，实现流域监测、污染溯源与调度决策。', '应用层', {
    对象: '河流 / 水库 / 排口',
    指标: 'pH / 浊度 / 氨氮 / 水位',
  }),
  node('fire', '森林防火', 'application', '利用热红外、烟雾识别与气象数据实现火点发现、火势研判与扑救调度。', '应用层', {
    手段: '卫星热点 / 无人机热成像 / 视频烟雾',
    目标: '打早打小',
  }),
  node('inspection', '无人机巡检', 'application', '按航线自动执行巡检任务，结合视觉识别形成问题线索与闭环处置。', '应用层', {
    流程: '航线 → 任务 → 采集 → 识别 → 工单',
    优势: '高频 / 可达 / 可复现',
  }),
  node('emergency', '应急指挥', 'application', '汇聚一张图态势、预案与资源，支撑突发事件快速研判与统一调度。', '应用层', {
    要素: '事件 / 资源 / 预案 / 通信',
    要求: '实时 / 可靠 / 可追溯',
  }),
  node('agri', '精准农业', 'application', '结合土壤墒情、气象与遥感反演，实现变量灌溉、施肥与产量预估。', '应用层', {
    数据: '墒情 / 气象 / 多光谱',
    价值: '节水节肥 / 提质增效',
  }),
  node('city', '城市治理', 'application', '通过物联感知与视频分析发现城市管理问题，联动处置流程。', '应用层', {
    场景: '市政 / 交通 / 环境',
    模式: '感知发现 → 派单 → 处置',
  }),
  node('ecology', '生态监测', 'application', '利用遥感与地面站协同观测植被、水体与生物多样性变化。', '应用层', {
    指标: 'NDVI / 水质 / 覆盖度',
    尺度: '区域—景观—样地',
  }),

  node('zero', '零信任安全', 'security', '默认不信任任何访问主体，持续验证身份、设备与环境，实施最小权限控制。', '安全体系', {
    原则: 'Never Trust, Always Verify',
    环节: '身份 / 设备 / 链路 / 数据',
  }),
  node('auth', '设备身份认证', 'security', '为每台设备分配唯一身份与凭证，防止仿冒接入与指令劫持。', '安全体系', {
    机制: '证书 / 密钥 / 安全芯片',
    标准: 'X.509 / TLS',
  }),
  node('privacy', '数据脱敏与分级', 'security', '按敏感程度对数据分类分级，在共享与开放时实施脱敏与访问控制。', '安全体系', {
    级别: '公开 / 内部 / 敏感',
    手段: '掩码 / 泛化 / 差分隐私',
  }),
  node('audit', '审计与溯源', 'security', '记录设备接入、数据访问与指令下发的全链路凭证，支撑安全审计与事件复盘。', '安全体系', {
    内容: '操作日志 / 数据血缘',
    要求: '完整 / 防篡改',
  }),
];

const link = (source: string, target: string, rel: string): KnowledgeLink => ({ source, target, rel });

export const KNOWLEDGE_LINKS: KnowledgeLink[] = [
  link('root', 'sensor', '纳管'),
  link('root', 'gateway', '接入'),
  link('root', 'access', '包含'),
  link('root', 'stream', '包含'),
  link('root', 'rules', '包含'),
  link('root', 'orchestration', '包含'),
  link('root', 'media', '包含'),
  link('root', 'openapi', '包含'),
  link('root', 'datamart', '包含'),
  link('root', 'kg', '认知'),
  link('root', 'llm', '推理'),
  link('root', 'spacetime', '统一基准'),
  link('root', 'water', '赋能'),
  link('root', 'fire', '赋能'),
  link('root', 'inspection', '赋能'),
  link('root', 'emergency', '赋能'),
  link('root', 'agri', '赋能'),
  link('root', 'city', '赋能'),
  link('root', 'ecology', '赋能'),
  link('root', 'zero', '保障'),

  link('sensor', 'access', '数据上报'),
  link('sensor', 'mqtt', '发布消息'),
  link('sensor', 'edgeNode', '短距汇聚'),
  link('sensor', 'position', '自带位置'),
  link('rfid', 'access', '标识接入'),
  link('rfid', 'city', '资产溯源'),
  link('camera', 'cv', '视频流'),
  link('camera', 'media', '流媒体归档'),
  link('camera', 'city', '城市感知'),
  link('gnss', 'position', '提供定位'),
  link('gnss', 'traj', '位置序列'),
  link('gnss', 'uav', '导航'),
  link('rs', 'remote', '成像'),
  link('rs', 'ecology', '生态反演'),
  link('rs', 'fire', '热点探测'),
  link('uav', 'camera', '搭载'),
  link('uav', 'traj', '产生航迹'),
  link('uav', 'inspection', '执行'),
  link('uav', 'fire', '火情侦察'),
  link('uav', 'edgeNode', '机载边缘计算'),
  link('ugv', 'inspection', '执行'),
  link('ugv', 'position', '自主导航'),
  link('usv', 'water', '水质采样'),
  link('usv', 'position', '自主导航'),

  link('nbiot', 'gateway', '承载'),
  link('lora', 'gateway', '承载'),
  link('g5', 'gateway', '大带宽回传'),
  link('g5', 'uav', '低时延控制'),
  link('satcom', 'gateway', '偏远回传'),
  link('satcom', 'emergency', '应急通信'),
  link('mqtt', 'access', '协议接入'),
  link('coap', 'access', '协议接入'),
  link('tsn', 'gateway', '确定性传输'),
  link('gateway', 'stream', '边缘预处理'),
  link('gateway', 'edgeNode', '部署于'),

  link('gis', 'spacetime', '空间底座'),
  link('sdb', 'spacetime', '数据底座'),
  link('sindex', 'sdb', '加速检索'),
  link('traj', 'sdb', '存储与查询'),
  link('grid', 'sindex', '网格编码'),
  link('remote', 'gis', '影像图层'),
  link('position', 'traj', '生成'),
  link('twin', 'spacetime', '虚实映射'),
  link('twin', 'water', '洪水推演'),
  link('twin', 'emergency', '态势推演'),
  link('geofence', 'gis', '空间计算'),
  link('geofence', 'rules', '触发空间规则'),
  link('spacetime', 'kg', '语义组织'),
  link('spacetime', 'llm', '时空上下文'),
  link('spacetime', 'twin', '统一时空'),
  link('remote', 'cv', '影像分析'),

  link('access', 'mqtt', '适配'),
  link('access', 'auth', '身份校验'),
  link('stream', 'rules', '实时指标'),
  link('stream', 'datamart', '写入'),
  link('rules', 'emergency', '联动触发'),
  link('rules', 'agent', '动作触发'),
  link('orchestration', 'uav', '调度'),
  link('orchestration', 'ugv', '调度'),
  link('orchestration', 'usv', '调度'),
  link('orchestration', 'agent', '工具'),
  link('media', 'cv', '离线推理'),
  link('datamart', 'forecast', '训练样本'),
  link('datamart', 'rag', '数据检索'),
  link('openapi', 'privacy', '开放前脱敏'),
  link('metadata', 'kg', '本体来源'),
  link('observability', 'access', '监测'),
  link('sdb', 'datamart', '时空数据'),
  link('metadata', 'datamart', '数据目录'),

  link('kg', 'llm', '知识注入'),
  link('kg', 'copilot', '语义推理'),
  link('kg', 'rag', '子图召回'),
  link('llm', 'agent', '驱动'),
  link('llm', 'copilot', '生成'),
  link('llm', 'emergency', '生成预案'),
  link('rag', 'llm', '事实增强'),
  link('rag', 'copilot', '证据供给'),
  link('embedding', 'rag', '语义召回'),
  link('agent', 'copilot', '任务编排'),
  link('agent', 'openapi', '调用'),
  link('cv', 'agent', '事件输入'),
  link('cv', 'fire', '烟火识别'),
  link('cv', 'water', '漂浮物识别'),
  link('forecast', 'agent', '趋势输入'),
  link('forecast', 'water', '水位预测'),
  link('forecast', 'emergency', '风险预测'),
  link('kg', 'inspection', '线索关联'),
  link('llm', 'inspection', '任务生成'),

  link('water', 'inspection', '河道巡检'),
  link('water', 'usv', '采样'),
  link('fire', 'uav', '空中巡查'),
  link('inspection', 'media', '成果沉淀'),
  link('emergency', 'orchestration', '资源调度'),
  link('emergency', 'satcom', '应急链路'),
  link('agri', 'sensor', '墒情感知'),
  link('agri', 'remote', '长势反演'),
  link('city', 'camera', '视频巡查'),
  link('ecology', 'rs', '大范围监测'),
  link('ecology', 'uav', '样地核查'),

  link('zero', 'auth', '支撑'),
  link('zero', 'privacy', '支撑'),
  link('zero', 'audit', '支撑'),
  link('auth', 'gateway', '设备准入'),
  link('privacy', 'media', '成果脱敏'),
  link('audit', 'orchestration', '指令留痕'),
  link('audit', 'datamart', '血缘追踪'),
];

export const GRAPH_STATS = {
  nodes: KNOWLEDGE_NODES.length,
  links: KNOWLEDGE_LINKS.length,
  categories: Object.keys(CATEGORY_META).length,
  sources: 12,
};

export function getNode(id: string) {
  return KNOWLEDGE_NODES.find((n) => n.id === id);
}

export function getNeighbors(id: string): { node: KnowledgeNode; rel: string; direction: 'out' | 'in' }[] {
  const out = KNOWLEDGE_LINKS.filter((l) => l.source === id).map((l) => ({
    node: getNode(l.target)!,
    rel: l.rel,
    direction: 'out' as const,
  }));
  const inc = KNOWLEDGE_LINKS.filter((l) => l.target === id).map((l) => ({
    node: getNode(l.source)!,
    rel: l.rel,
    direction: 'in' as const,
  }));
  return [...out, ...inc].filter((n) => n.node);
}

export function findShortestPath(from: string, to: string): KnowledgeNode[] | null {
  if (from === to) return [getNode(from)!];
  const queue: string[][] = [[from]];
  const seen = new Set([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    for (const linkItem of KNOWLEDGE_LINKS) {
      let next: string | null = null;
      if (linkItem.source === last) next = linkItem.target;
      else if (linkItem.target === last) next = linkItem.source;
      if (!next || seen.has(next)) continue;
      if (next === to) return [...path, next].map((id) => getNode(id)!);
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}

export const SEARCH_TOPICS = [
  'MQTT 与 CoAP 有什么区别？',
  '时空智能的核心是什么？',
  '知识图谱如何支撑大模型？',
  '无人机巡检的数据如何闭环？',
  'NB-IoT 和 LoRaWAN 怎么选？',
  '数字孪生在水务中怎么用？',
];
