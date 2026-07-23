# Codex 供应商快速调整

> 维护目录：\`自用特性/Codex供应商快速调整/\`

> 文档状态：最后同步 2026-07-23 · 扩展 OpenClaw 卡片 API 协议 + 模型写回

## 目标

在支持的供应商列表卡片上，名称/URL 下方增加就地快捷控件，无需打开完整编辑弹窗：

1. **上游格式 / API 协议** — 下拉选择后立即保存
2. **模型** — 「获取」拉上游模型列表，成功后下拉选择并保存
3. **获取按钮状态色** — 按该卡最近一次拉模型结果着色（亦可被子菜单批量探测驱动）

## 显示条件

同时满足：

- `supportsProviderQuickAdjust(appId)` 为真  
  当前：`codex` | `claude` | `claude-desktop` | `grokbuild` | `openclaw` | `gemini` | `opencode` | **`hermes`**
- 列表传入了 `onUpdate`

> 自用约定：不因 `category === "official"` 隐藏。第三方转发常被标成官方分类，只要有 baseUrl/key 即可用快速调整与拉模型；真·官方（无凭证）探测会 skipped，UI 仍可见便于手动配置后使用。  
> Grok Build 的格式双写与模型写入细节见 `自用特性/GrokBuild供应商对齐Codex/`。  
> OpenClaw **无本地代理接管**，卡片仍挂最近调用/成功率 UI 槽位，但通常无 proxy 日志数据（见 `供应商卡片本地用量与可用性`）。

## 上游格式

| 值                 | 文案                             |
| ------------------ | -------------------------------- |
| `openai_chat`      | Chat Completions（需开启路由）   |
| `openai_responses` | Responses（原生）                |
| `anthropic`        | Anthropic Messages（需开启路由） |

### 持久化

- 通过全局 helper `applyProviderApiFormat` 写入 `provider.meta.apiFormat`
- **不改** Codex 侧 `wire_api`（对接 Codex 自身仍按 Responses）
- 代理层转换由 `meta.apiFormat` 驱动

### 解析优先级

1. `meta.apiFormat` 合法值
2. 否则 `wire_api` → `codexApiFormatFromWireApi`
3. 默认 `openai_responses`（组件内；**新建 NewAPI/统一供应商** 默认写入 `openai_chat`，见快速导入文档）

### UI

- 下拉触发器约 `w-[260px]`，避免「Chat Completions（需开启路由）」溢出

## 模型与「获取」按钮

### 布局

```text
名称 / URL
上游格式 [下拉]          模型 [当前模型▼] [获取]
本地成功率·延迟摘要      [图标][图标]...（与下拉左缘对齐，6/行）
```

成功率摘要经 `belowUpstream` 插在上游格式正下方，与模型图标并排，避免图标把摘要整行顶开。

成功后 **仍保留** 着色「获取」按钮（旁为模型下拉），便于再次探测。

### 拉取

- `fetchModelsForConfig(baseUrl, apiKey, isFullUrl, undefined, customUserAgent)`
- Key：`auth.OPENAI_API_KEY` 或 experimental bearer
- 选择模型 → `setCodexModelName` 写 TOML 顶层 `model`

### 本地 `fetchStatus`

| 状态     | 颜色           | 文案    |
| -------- | -------------- | ------- |
| idle     | 默认           | 获取    |
| fetching | 琥珀 + spinner | 获取中… |
| success  | 绿             | 可用    |
| empty    | 橙             | 无模型  |
| failed   | 红             | 失败    |

失败时按钮**右侧**显示稳定原因文案（`provider.failureReason.*`），与 `modelsProbeReason` / history.reason 同源，重启后仍保留；仅分类码，不落原始错误。

- 切换 `provider.id` 重置本地瞬时态；失败原因从 history 回灌
- 不按供应商持久化模型列表（刷新需重拉）

### 与批量探测同步

prop：`modelsProbeStatus` / `modelsProbeHistoryStatus` / `modelsProbeReason`  
`useEffect`：在非本地 fetching 时，把 probing/success/empty/failed 映射到 `fetchStatus`，失败时同步 reason。

## 保存路径

```text
CodexProviderQuickAdjust
  → onUpdate(nextProvider)
    → ProviderCard / ProviderList
      → App.updateProvider
        → useUpdateProviderMutation
```

格式/模型保存成功走全局 `notifications.updateSuccess`；拉模型另有 form toast。

## i18n

| Key                                           | 用途               |
| --------------------------------------------- | ------------------ |
| `codexConfig.upstreamFormat*`                 | 上游格式标签与选项 |
| `codexConfig.quickModelLabel`                 | 模型标签           |
| `codexConfig.quickSelectModel`                | 选择占位           |
| `codexConfig.quickFetchModels`                | 获取               |
| `codexConfig.quickFetchModelsOk/Empty/Failed` | 结果短文案         |
| `providerForm.fetchModels*`                   | 拉取过程 toast     |

## 回归清单

- [ ] Codex/Claude/Grok/OpenClaw/Gemini 卡出现格式/协议 + 模型 + 获取（含 official 分类）
- [ ] 官方分类卡仍显示快速调整（有凭证可拉模型）
- [ ] 改格式后 `meta.apiFormat` 持久且 Codex `wire_api` 不被改写
- [ ] OpenClaw 改协议写 `settingsConfig.api`，且无「需路由」徽章
- [ ] OpenClaw 选模型：已有项移到 `models[0]`；新项 prepend
- [ ] Gemini 默认 Gemini Native 无需路由；改 Chat 后出现需路由
- [ ] Gemini 选模型写 `GEMINI_MODEL` / `GOOGLE_MODEL`
- [ ] OpenCode 改 SDK 包写 `settingsConfig.npm`，无「需路由」徽章
- [ ] OpenCode 选模型把 key 置顶，保留原 entry 字段
- [ ] Hermes 改 API 模式写 `api_mode`；选模型前移 `models[]`
- [ ] Hermes dict 只读源不显示快速调整
- [ ] 获取成功绿 / 空橙 / 失败红
- [ ] 子菜单一键拉模型后本卡获取按钮同步变色
- [ ] 选模型写回八端各自字段
- [ ] 上游格式长文案不溢出

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)
- 批量探测：[../批量拉取模型探测/](../批量拉取模型探测/)
- NewAPI 默认 openai_chat：[../NewAPI快速导入/](../NewAPI快速导入/)

## 相关：默认 openai_chat

见 [../新建供应商默认openai_chat/](../新建供应商默认openai_chat/)。

## 增量：扩展到 Claude / Claude Desktop

原先仅 Codex 非官方卡显示。现已复用同一组件：

- `appId` ∈ `codex` | `claude` | `claude-desktop`
- 有 `onUpdate`
- **不再**要求 `category !== "official"`（见上方显示条件）

### Claude 差异

| 项 | Codex | Claude / Claude Desktop |
|---|---|---|
| 上游格式写入 | `meta.apiFormat` | 同左 |
| 格式选项 | chat / responses / anthropic | anthropic（原生）/ chat / responses / **gemini_native** |
| 当前模型读取 | TOML `model=` | `env.ANTHROPIC_MODEL` |
| 模型写入 | `applyProviderModel` → TOML | `applyProviderModel` → `ANTHROPIC_MODEL` |
| 拉模型凭证 | Codex config/auth | Claude env baseUrl + auth token |
| LOGO | 快速调整区内 | 同左（不再另渲染信息列网格） |

### 增量：扩展到 OpenClaw

- `appId === "openclaw"` 进入 `PROVIDER_QUICK_ADJUST_APP_IDS`
- 标签为 **API 协议**（非「上游格式」）；选项与表单 `openclawApiProtocols` 对齐（无「需开启路由」文案）
- **无** `providerNeedsRouting` 徽章（OpenClaw 不走本地 proxy 转换）

| 项 | OpenClaw 行为 |
|---|---|
| 协议读取 | 优先 `settingsConfig.api`；无则回落 `meta.apiFormat`；默认 `openai_chat` |
| 协议写入 | `settingsConfig.api`（native）+ `meta.apiFormat`（镜像） |
| 映射 | `openai_chat`→`openai-completions`；`openai_responses`→`openai-responses`；`anthropic`→`anthropic-messages`；`gemini_native`→`google-generative-ai` |
| 当前模型 | `models[0].id`（与表单「默认模型」一致） |
| 模型写入 | `applyProviderModel` → 已存在则移到 `models[0]` 并保留 cost/context；新 id 则 prepend `{id,name}` |
| 下拉选项 | 配置内全部 `models[].id` + 本会话获取 + probe history |
| 拉模型凭证 | `extractPortableCredentials` → `baseUrl`/`apiKey` |
| 设为默认 | 仍用操作栏「设为默认」（`agents.defaults.model` = `providerId/models[0].id`）；卡片只改供应商 models 列表 |

### 增量：扩展到 Gemini

- `appId === "gemini"` 进入白名单
- 有本地代理接管：上游格式写 `meta.apiFormat`；原生为 `gemini_native`
- 需路由徽章：`format !== gemini_native`

| 项 | Gemini 行为 |
|---|---|
| 默认格式 | `gemini_native`（无 meta 时） |
| 格式选项 | Gemini Native（原生）/ Chat / Responses / Anthropic（后三者需路由） |
| 当前模型 | `env.GEMINI_MODEL`（回落 `GOOGLE_MODEL`） |
| 模型写入 | `applyProviderModel` → `GEMINI_MODEL` + `GOOGLE_MODEL` |
| 拉模型凭证 | `GOOGLE_GEMINI_BASE_URL` + `GEMINI_API_KEY` |

### 增量：扩展到 OpenCode

- `appId === "opencode"` 进入白名单
- 标签为 **SDK 包**；选项对齐 `opencodeNpmPackages`（无「需开启路由」）
- **无** `providerNeedsRouting`（无本地 proxy 接管）

| 项 | OpenCode 行为 |
|---|---|
| 协议读取 | 优先 `settingsConfig.npm`；无则 `meta.apiFormat`；默认 `openai_chat` |
| 协议写入 | `settingsConfig.npm` + `meta.apiFormat` |
| 映射 | `openai_chat`→`@ai-sdk/openai-compatible`；`openai_responses`→`@ai-sdk/openai`；`anthropic`→`@ai-sdk/anthropic`；`gemini_native`→`@ai-sdk/google` |
| 当前模型 | `Object.keys(models)[0]` |
| 模型写入 | 选中 key 置顶重建 `models` 对象；新 id 则 `{ name: id }` |
| 拉模型凭证 | `options.baseURL` + `options.apiKey` |

> 注意：`@ai-sdk/amazon-bedrock` 未单独做卡片选项；读到时归入 chat 兼容默认，写入 chat 会变成 `openai-compatible`。Bedrock 请用编辑弹窗。

### 增量：扩展到 Hermes

- `appId === "hermes"` 进入白名单
- 标签为 **API 模式**；选项对齐 `hermesApiModes` 主三项（Chat / Codex Responses / Anthropic）
- **无** `providerNeedsRouting`
- **`providers:` dict 源只读**：`isHermesReadOnlyProvider` 为真时 **不挂载** 快速调整（需在 Hermes Web UI 改）

| 项 | Hermes 行为 |
|---|---|
| 协议读取 | 优先 `settingsConfig.api_mode`；默认 `openai_chat` |
| 协议写入 | `api_mode` + `meta.apiFormat` |
| 映射 | `openai_chat`→`chat_completions`；`openai_responses`→`codex_responses`；`anthropic`→`anthropic_messages`；`gemini_native` 写入回落 `chat_completions` |
| 当前模型 | `models[0].id` |
| 模型写入 | 与 OpenClaw 同：前移 / prepend |
| 拉模型凭证 | `base_url` + `api_key` |

> `bedrock_converse` 读到时归入 chat 兼容；卡片无单独 Bedrock 选项，请用编辑弹窗。

### 仍不挂载的应用 / 场景

- **OAuth 特型**（`github_copilot` / `codex_oauth`）：批量探测 skipped
- **Hermes providers: dict 只读源**：不挂卡片 quick-adjust
- **官方分类卡会挂载**；无凭证时探测 skipped，有凭证（含第三方转发）可正常拉模型
