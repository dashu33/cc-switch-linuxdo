# 供应商行 UI 压缩与筛选

## 目标与范围

在 Provider 列表中压缩**图标左侧**的序号/移动区，并增强导入后自动探测、行内模型品牌 LOGO、子菜单筛选（拉取状态 + 模型）。

本特性只改前端 React 列表体验，不改 Rust 后端。

## 716 备份点

| 项 | 值 |
| --- | --- |
| 分支 | `backup/716` |
| 附注 tag | `backup-716` |
| 提交 | `95d2f00`（`backup: 716 版本快照（改 Provider UI 前）`） |
| 开发分支 | `codex/provider-row-ui-filter`（从备份点拉出） |
| 回滚 | `git checkout backup/716` 或 `git checkout backup-716` |

备份说明：创建时工作区改动一并纳入快照；`src-tauri/target-test-sync/` 已忽略未提交。

## 用户行为

### A. 左侧窄 rail

- 仅压缩「序号 + 移动控件」这一块，不压缩 Provider 图标、名称、右侧状态与操作区。
- 序号使用更小字号 / `w-7` 窄列。
- **自定义排序**时：hover/focus 显示 ↑ / 拖拽柄 / ↓；非自定义排序只保留序号。
- 模型 LOGO **不**塞进左侧 rail。

### B. 导入 / 新建后自动探测

- 新建（`AddProviderDialog`）、复制、NewAPI 快速导入成功后：对该供应商静默探测 `/models`。
- 列表「导入当前配置」成功后：延迟触发全量批量探测。
- 复用 `useFetchCurrentProviderModels`（`probeProviders` / `fetchCurrentProviderModels`），跳过规则与手动批量一致。

### C. 行内模型 LOGO

- 探测历史可选保存 `modelIds`（最多 80 个，品牌优先采样）。
- 卡片名称行旁展示最多 3 个 brand 图标 + `+N` 溢出。
- brand 映射：`src/utils/modelBrandIcon.ts` → 现有 `ProviderIcon` 资源。
- 旧版 localStorage（无 `modelIds`）仍可解析；只显示状态图标，无 LOGO 直至下次探测。

### D. 子菜单筛选

- sticky 子菜单右上角「筛选」：
  - 拉取状态：全部 / 成功 / 失败 / 无模型 / 跳过 / 未检测
  - 模型关键字：匹配历史 `modelIds`
- 与排序、搜索组合；数量显示为「可见 / 总数」。
- 无匹配时 empty 文案区分搜索 vs 筛选。

## 关键决策

- probe history 键仍为 `cc-switch-models-probe-history:v1:<appId>`，只**扩展**字段，不改 key，保证旧数据兼容。
- 单条/少量探测用 `probeProviders` **合并**历史，不全量覆盖；全量批量仍整表替换。
- 移动按钮调用 `useDragSort.moveProviderByOffset`，与拖拽同一 `updateSortOrder` 路径。



## 布局修正（模型图标后）
- Usage 查询卡：单行（已用/剩余 + 相对时间 + 刷新），贴最近调用上方，**无外层小气泡**；与最近调用同宽。


- Codex 行两列：左「上游格式 + 成功率摘要」，右「模型下拉/获取 + 图标」。
- 图标只撑高右列，成功率贴在上游格式正下方，不再被模型图标整行顶开空白。
- 非 Codex 行：图标与摘要仍按信息列顺序堆叠。

## 非目标

- 不把按钮搬回主工具栏
- 不把「URL 前空白」当主任务
- 不大改后端 / 不修 flaky `tests/integration/App.test.tsx`
- 不恢复英文 `FEATURE/` 文档树

## 兼容 / 迁移

- 旧 v1 历史 JSON：缺 `modelIds` 时按原字段读取。
- 新字段写入后旧版本忽略未知字段仍可工作。

## 验收标准

- [ ] 自定义排序：左侧窄；hover 见移动；序号不抢宽
- [ ] 非自定义排序：仅序号，无移动列
- [ ] 新建 / 快速导入 / 复制后自动出现探测态或历史 ☑️/❌
- [ ] 成功探测后名称旁最多 3 个模型 brand + 溢出
- [ ] 筛选状态 / 模型可过滤；与搜索叠加；无匹配 empty
- [ ] 筛选下拉按模型服务商（Claude/ChatGPT/Grok/GLM…）聚合，一行六个
- [ ] 下拉层级在卡片之上可点击；仅显示可用生效
- [ ] 右上角 ☑️/❌ 与操作区不被挤掉

## 回归清单

- [ ] 手动批量探测仍汇总 toast + 60s 边框复位
- [ ] 切 app 历史不串
- [ ] sticky 子菜单仍有排序 / S3 / 探测 / 搜索 / 定位 / 数量
- [ ] `pnpm typecheck` 通过
- [ ] 相关单测通过

## 环境限制

- UI 优先 `pnpm dev:renderer`；完整壳用 debug `cc-switch.exe`

## 增量：布局与模型 LOGO 交互

- 用量查询小卡（`UsageFooter` 已使用/剩余/USD）放在「最近调用」气泡**外右上角**；启用/操作按钮垂直居中；本地成功率摘要仍在左侧信息区。
- Provider 图标下方增加**置顶**按钮（非自定义排序时会先切回自定义再置顶）。
- 序号加大加粗。
- 探测到的模型 brand LOGO 显示在模型/URL 区下方，可多排；每品牌一个；**点击**切换到该品牌的顶级模型（优先高版本，其次高档位如 opus/sonnet，避免 mini/haiku）。

## 增量：顶级模型切换与 Grok 识别

- 点击品牌 LOGO 不再固定取探测列表“第一个”，而是按版本号 + 档位选择顶级模型。
- `modelIds` 采样从 24 提升到 80，并优先保留每个品牌至少一个 id，避免大列表把 Grok 等后出现品牌挤掉。
- Grok / xAI 识别覆盖：`grok*`、`xai/*`、`x-ai/*`、`xai-*`、`Grok-4` 等。


## 增量：工具栏筛选框与模型服务商下拉

- sticky 排序行增加**筛选输入框**（名称排序后、「仅显示可用」前）。
- 输入逻辑复用搜索：匹配名称 / 备注 / 网址 / 探测模型 id，以及模型**服务商品牌**（Claude / ChatGPT / Grok / GLM…）。
- 点击筛选框弹出下拉（`createPortal` 到 `document.body`，`z-[200]`），汇总**全部供应商探测到的模型服务商**，不是具体模型 id。
- 下拉每行 6 个服务商 chip；排序：Claude → ChatGPT → Grok → GLM 固定前排，其余按显示名首字母。
- 选中服务商写入筛选文本，过滤含该品牌模型的供应商。
- 「仅显示可用」= 仅 `probe status === success`；与可用性排序（按拉取结果）不同。
- 排序为「维度 + 升/降序」；维度：手动 / 创建 / 最近 / 可用性 / 名称。
