# Codex 供应商快速调整

> 文档状态：最后同步 2026-07-15 · 获取按钮状态色 + 批量探测同步 + 上游格式默认 chat

## 目标

在 **Codex** 供应商列表卡片上，名称/URL 下方增加就地快捷控件，无需打开完整编辑弹窗：

1. **上游格式** — 下拉选择后立即保存
2. **模型** — 「获取」拉上游模型列表，成功后下拉选择并保存
3. **获取按钮状态色** — 按该卡最近一次拉模型结果着色（亦可被顶部批量探测驱动）

## 显示条件

同时满足：

- `appId === "codex"`
- `provider.category !== "official"`
- 列表传入了 `onUpdate`

## 上游格式

| 值 | 文案 |
|----|------|
| `openai_chat` | Chat Completions（需开启路由） |
| `openai_responses` | Responses（原生） |
| `anthropic` | Anthropic Messages（需开启路由） |

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
模型: [当前模型 | 未设置] [获取/可用/失败…]
      有列表时: [模型下拉] [获取按钮(着色)]
```

成功后 **仍保留** 着色「获取」按钮（旁为模型下拉），便于再次探测。

### 拉取

- `fetchModelsForConfig(baseUrl, apiKey, isFullUrl, undefined, customUserAgent)`
- Key：`auth.OPENAI_API_KEY` 或 experimental bearer
- 选择模型 → `setCodexModelName` 写 TOML 顶层 `model`

### 本地 `fetchStatus`

| 状态 | 颜色 | 文案 |
|------|------|------|
| idle | 默认 | 获取 |
| fetching | 琥珀 + spinner | 获取中… |
| success | 绿 | 可用 |
| empty | 橙 | 无模型 |
| failed | 红 | 失败 |

- 切换 `provider.id` 重置
- 不按供应商持久化模型列表（刷新需重拉）

### 与批量探测同步

prop：`modelsProbeStatus?: ModelsProbeStatus`  
`useEffect`：在非本地 fetching 时，把 probing/success/empty/failed 映射到 `fetchStatus`。

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

| Key | 用途 |
|-----|------|
| `codexConfig.upstreamFormat*` | 上游格式标签与选项 |
| `codexConfig.quickModelLabel` | 模型标签 |
| `codexConfig.quickSelectModel` | 选择占位 |
| `codexConfig.quickFetchModels` | 获取 |
| `codexConfig.quickFetchModelsOk/Empty/Failed` | 结果短文案 |
| `providerForm.fetchModels*` | 拉取过程 toast |

## 回归清单

- [ ] Codex 非官方卡出现上游格式 + 模型 + 获取
- [ ] 官方卡不出现
- [ ] 改格式后 `meta.apiFormat` 持久且 `wire_api` 不被改写
- [ ] 获取成功绿 / 空橙 / 失败红
- [ ] 顶部一键拉模型后本卡获取按钮同步变色
- [ ] 选模型写回 TOML `model`
- [ ] 上游格式长文案不溢出

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)
- 批量探测：[../provider-fetch-models-probe/](../provider-fetch-models-probe/)
- NewAPI 默认 openai_chat：[../newapi-quick-import/](../newapi-quick-import/)

## 相关：默认 openai_chat

见 [../provider-default-openai-chat/](../provider-default-openai-chat/)。
