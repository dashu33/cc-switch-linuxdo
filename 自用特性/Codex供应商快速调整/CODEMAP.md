# CODEMAP — Codex 供应商快速调整

> 维护目录：\`自用特性/Codex供应商快速调整/\`

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/components/providers/CodexProviderQuickAdjust.tsx` | UI + 格式/模型/获取状态色 + 失败原因旁显 |
| `src/components/providers/ProviderCard.tsx` | 通过 `supportsProviderQuickAdjust` 挂载（含 grokbuild / official 分类）；传 `onUpdate` + `modelsProbeStatus` |
| `src/utils/providerQuickAdjust.ts` | 全局：App 门控、format 解析/写入、需路由判定、模型读取 |
| `src/components/providers/ProviderList.tsx` | 透传 `onUpdate`、probe 状态 |
| `src/App.tsx` | `updateProvider` |
| `src/lib/api/model-fetch.ts` | 拉模型 |
| `src/utils/providerConfigUtils.ts` | model / baseUrl / wire_api / bearer |
| `src/types.ts` | `CodexApiFormat`、`meta.apiFormat` |
| `src/i18n/locales/*` | `codexConfig.quick*` |
| `自用特性/Codex供应商快速调整/*` | 本文档 |

## 关键接线

```text
App → ProviderList onUpdate
  → SortableProviderCard onUpdate
    → ProviderCard onUpdate + modelsProbeStatus + modelsProbeReason
      → CodexProviderQuickAdjust
```

**检查：**

```powershell
rg -n "CodexProviderQuickAdjust|modelsProbeStatus|fetchStatus|fetchButtonClassName" src/components/providers --glob "*.tsx"
```

## 组件内部

| 符号 | 职责 |
|------|------|
| `pickCodexApiKey` | Codex Key 回退来源 |
| `resolveProviderApiFormat` | 全局 helper：meta → app-native → default |
| `persistProvider` | `onUpdate` + `isSaving` |
| `handleFormatChange` | `applyProviderApiFormat` |
| `handleModelChange` | `applyProviderModel` |
| `handleFetchModels` | 拉模型 + `fetchStatus` |
| `fetchButtonClassName` | 按钮配色 |
| `fetchStatusLabel` | 按钮文案 |
| `fetchFailureReason` / `fetchFailureReasonLabel` | 失败原因本地态与右侧文案 |
| `modelsProbeStatus` effect | 批量探测同步 status + reason |

## 数据写入

### 上游格式

```ts
next.meta = { ...(next.meta ?? {}), apiFormat };
```

### 模型

```ts
settings.config = setCodexModelName(prevConfig, modelId);
```

## 与表单一致性

| 点 | 快速调整 | CodexFormFields |
|----|----------|-----------------|
| 格式三值 | 同 | 同 |
| wire_api | 不改写 | 固定 responses |
| 拉模型 API | 同 | 同 |

## 增量：多应用

- `CodexProviderQuickAdjust` 现接收 `appId`
- `resolveProbeCredentials` 复用 `resolveProviderModelsProbeTarget`
- 模型写入统一 `applyProviderModel`
- format / 需路由 / 门控统一走 `providerQuickAdjust`
- `ProviderCard` 挂载条件：`supportsProviderQuickAdjust(appId)` + onUpdate（**含 official 分类**；含 Grok Build）
