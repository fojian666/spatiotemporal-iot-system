# DESIGN.md · 视觉与交互契约

适用：`src/` 下所有界面改动。动手前读这一页；具体数值以 `src/styles/*.css` 与 `src/components/ui.tsx` 为准。

## 1. 气质与边界

- **深空科技 HUD**：暗色为默认主题，浅色是等价主题（`html[data-theme='light']`），两套都要单独核对对比度。
- 主视觉允许诗意（欢迎页/登录页原子核、文档中心开卷书壳），**控件与数据保持克制**：等宽数字、低饱和描边、少阴影。
- 欢迎页在**登录成功后**触发：同一标签页首次进入操作台前展示一次（`sessionStorage` 标记），`#/welcome` 可随时复访；登录页不再放导览入口。
- 演示性内容（合成数据、静态"视频"、伪推理耗时）是产品设定，不按缺陷处理。

## 2. 设计令牌（`base.css :root` / `theme.css`）

| 组 | 令牌 | 说明 |
|---|---|---|
| 表面 | `--bg` `--bg-soft` `--panel` `--panel-strong` `--line` `--line-soft` `--line-strong` | 面板/描边层级 |
| 语义色 | `--cyan` `--teal` `--blue` `--violet` `--amber` `--danger` `--pink` | 仅表意，不作装饰 |
| 文本 | `--text` `--muted` `--dim` | 主/次/弱三级 |
| 透明合成 | `--panel-rgb` `--edge-rgb` `--text-rgb` | 需要 alpha 时用 `rgba(var(--edge-rgb), .14)`，不要新造色 |
| 字体 | `--font-display`（Rajdhani）`--font-num` `--font-mono`（JetBrains）`--font-sans`（中文系统栈）`--font-serif`（霞鹜文楷，仅主视觉诗句） | 本地 woff2，`font-display: swap` |
| 结构 | `--rail: 76px` `--topbar: 62px` `--radius: 14px` | 全局骨架尺寸 |
| 动效 | `--ease-out` `--ease-in-out` `--dur-fast/base/slow/enter` = 160/260/460/520ms | 唯一动效节奏来源 |
| 层级 | `--z-topbar: 25` `--z-rail: 30` `--z-modal: 100` `--z-toast: 120` `--z-splash: 200` | 跨页面浮层专用 |

## 3. 排版

| 角色 | 规格 |
|---|---|
| 页面标题 h1（`PageHeader`） | 23px / 600 / 1.25 |
| 面板标题 h2（`Panel`） | 12.5px / 600 + 7px `overline` |
| 正文 | 13px / 1.5；辅助说明 11.5px |
| HUD overline | 7–9px mono + `letter-spacing: .14–.18em`，只用于标签 |
| 数字 | `mono` 类或 `--font-num`，等宽避免跳动 |

文案分界：主视觉可文学化（「山河入网 / 时空为证」），表单、状态、错误信息保持事实化短句。

## 4. 组件契约

- **面板**：统一用 `<Panel title overline icon extra>`（内部渲染 h2 + overline），不要自写面板头。
- **按钮**：`btn` + `btn--primary` / `btn--ghost` / `btn--sm` / `icon-btn`；图标按钮必须有 `aria-label` 或 `title`。
- **状态**：`StatusPill` / `StatusText` / `LevelPill`；颜色不得作为唯一信号，需配文字。
- **对话框**：必须 `role="dialog"` + `aria-modal="true"` + `aria-labelledby`，配合 `useFocusTrap`（初始焦点、Tab 环绕、关闭回位）与 Esc；参考 `OpsModal` 与 `ArchitectureModal`。
- **图表**：只用 `components/charts.tsx` 的 `EChart`（`echarts/core` 按需注册 + aria 已开启，数据点描述上限 6）。新增图表类型必须先到 `src/lib/echarts.ts` 注册对应 chart/component，配色取 `chartPalette()`。
- **图表轴名**：y 轴单位名**必须竖排**（`nameLocation: 'middle'` + `nameRotate: 90` 用于左轴、`-90` 用于右轴）。默认的 `nameLocation: 'end'` 会把名字画在轴顶端上方，正好和图例第一项叠字——`NTU` 压「平安桥水质」、`%` 压「湿度」都是这么来的（2026-10-25 实际发生）。`grid.left / right` 要留出名字宽度；右轴的 `nameGap` 不要超过 `grid.right` 的一半，否则竖排字会被容器裁掉。
- **空状态**：图标 + 一句话解释 + 可选动作；加载超过 300ms 用骨架/进度，不展示空白容器。
- **地图**：MapLibre + Esri 影像 + Mapzen DEM（「立体地形」开关，开启时 36° 俯角、关闭回到 18°）；DEM 不可达时自动退回平面并置灰开关，离线环境保留容器、控件与"演示底图"提示。

## 5. 动效

- 只动 `transform` / `opacity`；时长与缓动取令牌，退场快于入场（≈60–70%）。
- 七个业务模块采用「空间展开」路由入场：图标轻旋归位、标题从自身行框揭示、说明随后接入；112px 光迹只运行一次。指标间隔 32ms，主面板上浮 20px，两翼面板从左右 22px 向内归位，顶缘细线随之展开；≤900px 单列面板统一纵移 14px。主体 460ms、最大延迟 160ms，总计 ≤620ms。页面外壳、地图与图表画布不缩放/旋转，结束后释放 transform，不遮挡操作。每次模块挂载（含返回）重播，页内筛选和遥测刷新不重播；无 JS 可见性门控。欢迎页保留完整主视觉编排，三路感知连线仅为能力示意，不代表实时遥测。
- 顶栏「界面动效」可切换静态显示，偏好保存在本机；系统 reduced-motion 优先。JS 统一经 `src/motion.ts` 读取/订阅，CSS 统一响应 `data-motion`，数据订阅与仿真时钟不暂停。
- 图表在共享 `EChart` 入口处理 Canvas 动效降级；屏幕外暂存最新 option，恢复可见后刷新。地图巡行标记限制约 30fps，离开视口/标签页隐藏/减少动态效果时暂停。
- 交互反馈：地图选中设备播一次 760ms 定位环（只动 Marker 子元素，两架无人机共享标记也按实际资产 ID 重播），详情边框 460ms 收束；遥测更新不重播。场景切换只观察已确认的 `scenario.key`，底部提示 1800ms、前后场景色轨交接 460ms，环境数字沿用 rAF 补间；请求失败保留原场景并提示。告警提交成功后行内确认 620ms，徽章 260ms 落位、活动数滚动，列表顺序不变，切换标签清除旧反馈。Copilot 回答完成后证据 24ms 错峰展开，动作与追问随后出现；来源链接直接绑定设备/图谱 ID，不从生成文本推断定位。减少动态效果时装饰隐藏，状态与链接仍完整可用。
- 入场编排集中在 `auth.css` / `base.css` 的 motion layer；列表 stagger 24ms（`--i`）。
- 全局降级在 `base.css` 的 `@media (prefers-reduced-motion: reduce)`：动画归零且 `fill: none`，**用 keyframe 定位的元素必须把静止姿态写进基础 transform**（见 `.auth-atom__electron`）。
- 登录原子：指针视差写 `--atom-tilt-x/y`；反向壳层的 `animation-direction: reverse` 必须同时作用于壳层与电子。
- 文档中心：≤1100px 目录折叠，展开后可滚动选章，选中自动收起，正文优先。翻页 `rotateY ±104°`；≤1100px 与 reduced-motion 退化为直接切换。
- 主题切换走 View Transitions API（`src/theme.ts`），不要在别处另写遮罩转场。

## 6. 层级

- 跨页面浮层只用上表 token，禁止字面量：模态 `--z-modal`、全局提示 `--z-toast`、启动屏 `--z-splash`。
- 顶层浮层必须挂到 `document.body`（`createPortal`）：`.page` 自带堆叠上下文，留在页面内会被 rail/topbar 压住（`OpsModal` 已按此实现）。
- 页面内部（地图控件、卡片内浮层）使用局部 z-index，**不占用全局层级**。

## 7. 禁止项

- 在页面/组件里写原始 hex 作为语义色（令牌定义层除外）。
- 用 emoji 当结构性图标；统一 Lucide，描边 1.7–1.8。
- 引入动效库或第三方 UI 库（本项目纯 CSS / rAF）。
- 自造对话框却不加焦点陷阱与 Esc。
- 在组件里另造 reduced-motion 分支（统一走全局规则）。
- 用颜色作为唯一状态信号；正文新文案小于 11px（HUD overline 除外）。

## 8. 允许的例外

- `base.css` / `theme.css` / `auth.css` 中的令牌定义与特效参数（渐变、光晕 rgba）。
- 动态内联 CSS 变量：`--kpi` / `--i` / `--node-color` / `--atom-tilt-*` / `--tilt`。
- 地图与图表画布几何、SVG 视口坐标。
- 页面内部的局部堆叠值（地图控件 1–20、卡片内浮层）。

## 9. 响应式

统一覆盖层在 `src/styles/responsive.css`（最后加载，只做覆盖）。宽度与高度两套断点：

| 断点 | 形态 |
|---|---|
| ≤640 宽 | 手机：隐藏 rail，改用 7 项底部导航（`--mobile-nav` + 安全区）；顶栏 52px，只留标题、主题、头像/退出 |
| 641–900 宽 | 平板：保留 rail，页头换行、页头动作占满一行，表格/标签页横向滚动 |
| 901–1100 宽 | 紧凑桌面：隐藏顶栏系统名，页头允许换行 |
| ≤760 高 | 矮屏：`--topbar: 54px`，页头与内边距收紧，隐藏 rail 脚注 |
| ≤560 高 | 横屏手机/极矮窗口：`--topbar: 46px`、底部导航 50px，隐藏页头描述与 Copilot 侧栏 |

规则：

- 顶栏高度必须写 `height: var(--topbar)`，不要重复硬编码像素；`--topbar` 同时被背景层、Copilot 与地图页高度引用。
- 页面高度跟随内容区（`height: 100%` 或 `min-height: 100%`），不要再用 `calc(100dvh - var(--topbar))` 自己算——移动端还有底部导航。
- 横向溢出的列表/表格必须让**整块**滚动（表头+表体同一容器），不要只滚表体。
- 三栏页（图谱）在 ≤1240 断点必须让主面板**独占整行并给定高度**（`clamp(320px, 62dvh, 560px)`）——否则会落进 300px 侧栏列，`height:100%` 的图表随之塌陷。
- 矮屏 rail 走两级节奏（≤760 高 44px、≤560 高 32px），并隐藏 rail 滚动条：滚动条会吃掉 7px 宽，导致「时空一张图」这类长标签被挤出。
- 顶层浮层用 `createPortal` 挂 body；提示条在手机上让开底部导航（`bottom: calc(var(--mobile-nav) + var(--safe-bottom) + 12px)`）。
- 触控设备（`pointer: coarse` 且 ≤900）可点目标最小 44×44；`viewport-fit=cover` 已在 `index.html` 开启，安全区变量才有效。
- 验证尺寸：390×844、768×1024、1024×768、1440×720、844×390（横屏）。

## 10. 跨页上下文

- 设备定位用 `focus`，遥测页可附 `search/status/chart`；地图的资产分类用 `asset`。
- 一网统飞用 `tab` 指定工作区、`search/status` 筛选计划、`plan` 标识选中计划；总览用 `alert` 保留展开的告警。
- 页内筛选经 `usePageQuery` 替换当前历史记录，跨页仍用 `Link`/导航新增记录，避免返回时逐字撤销搜索。
- `usePageScroll` 在内容挂载后恢复 POP 导航的主滚动位置，异步作业页等加载结束；新跳转从顶部开始。仅在内存保留最近 50 个位置，不落库。
- ≤1280px 总览告警栏保留为独立行，≤640px 单列；不得为紧凑布局隐藏调查入口。
- 观察员可以沿调查路径查看详情，写操作仍由原有前后端权限控制。设备无飞行计划时进入该设备的空列表，不能回退到其他设备的计划。

## 11. 新增页/组件检查清单

- [ ] `PageHeader` 提供唯一 h1；面板用 `Panel`（h2），层级不跳级
- [ ] 只用令牌色；数字等宽；无 emoji；文案分界正确
- [ ] 交互元素有可见焦点（全局 `:focus-visible` 兜底）与可读名称
- [ ] 对话框具备 role / aria-modal / aria-labelledby / 焦点陷阱 / Esc / 焦点回位
- [ ] 动效只用 transform/opacity，reduced-motion 下保留完整静止姿态
- [ ] 图表用 `EChart` 且所需 series/component 已注册
- [ ] `npm run build` 通过，并在 390×844、768×1024、1440×720 各做一次截图回归
