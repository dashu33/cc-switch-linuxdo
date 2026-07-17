# Codex 供应商快速调整

> 维护目录：\`自用特性/Codex供应商快速调整/\`

> 文档状态：最后同步 2026-07-17 · 获取按钮状态色 + 失败原因旁显持久化 + 批量探测同步

## 目标

在 **Codex** 供应商列表卡片上，名称/URL 下方增加就地快捷控件，无需打开完整编辑弹窗：

1. **上游格式** — 下拉选择后立即保存
2. **模型** — 「获取」拉上游模型列表，成功后下拉选择并保存
3. **获取按钮状态色** — 按该卡最近一次拉模型结果着色（亦可被子菜单批量探测驱动）

## 显示条件

同时满足：

- `appId` ∈ `codex` | `claude` | `claude-desktop`
- 列表传入了 `onUpdate`

> 自用约定：不因 `category === "official"` 隐藏。第三方转发常被标成官方分类，只要有 baseUrl/key 即可用快速调整与拉模型；真·官方（无凭证）探测会 skipped，UI 仍可见便于手动配置后使用。

## 上游格式

| 值                 | 文案                             |
| ------------------ | -------------------------------- |
| `openai_chat`      | Chat Completions（需开启路由）   |
| `openai_responses` | Responses（原生）                |
| `anthropic`        | Anthropic Messages（需开启路由） |

### 持久化

- 写入 `provider.meta.apiFormat`
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

- [ ] Codex/Claude 卡出现上游格式 + 模型 + 获取（含 official 分类）
- [ ] 官方分类卡仍显示快速调整（有凭证可拉模型）
- [ ] 改格式后 `meta.apiFormat` 持久且 `wire_api` 不被改写
- [ ] 获取成功绿 / 空橙 / 失败红
- [ ] 子菜单一键拉模型后本卡获取按钮同步变色
- [ ] 选模型写回 TOML `model`
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

### 仍不挂载的应用 / 场景

见下方「不适合直接照搬」清单（Gemini / OpenCode / OpenClaw / Hermes / OAuth 特型）。  
**官方分类卡会挂载**；无凭证时探测 skipped，有凭证（含第三方转发）可正常拉模型。
