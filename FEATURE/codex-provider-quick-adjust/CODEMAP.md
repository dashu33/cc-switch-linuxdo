# CODEMAP — codex-provider-quick-adjust

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/components/providers/CodexProviderQuickAdjust.tsx` | UI + 格式/模型/获取状态色 |
| `src/components/providers/ProviderCard.tsx` | Codex 非官方挂载；传 `onUpdate` + `modelsProbeStatus` |
| `src/components/providers/ProviderList.tsx` | 透传 `onUpdate`、probe 状态 |
| `src/App.tsx` | `updateProvider` |
| `src/lib/api/model-fetch.ts` | 拉模型 |
| `src/utils/providerConfigUtils.ts` | model / baseUrl / wire_api / bearer |
| `src/types.ts` | `CodexApiFormat`、`meta.apiFormat` |
| `src/i18n/locales/*` | `codexConfig.quick*` |
| `FEATURE/codex-provider-quick-adjust/*` | 本文档 |

## 关键接线

```text
App → ProviderList onUpdate
  → SortableProviderCard onUpdate
    → ProviderCard onUpdate + modelsProbeStatus
      → CodexProviderQuickAdjust
```

**检查：**

```powershell
rg -n "CodexProviderQuickAdjust|modelsProbeStatus|fetchStatus|fetchButtonClassName" src/components/providers --glob "*.tsx"
```

## 组件内部

| 符号 | 职责 |
|------|------|
| `pickCodexApiKey` | Key 来源 |
| `resolveApiFormat` | meta → wire → default |
| `persistProvider` | `onUpdate` + `isSaving` |
| `handleFormatChange` | 写 `meta.apiFormat` |
| `handleModelChange` | `setCodexModelName` |
| `handleFetchModels` | 拉模型 + `fetchStatus` |
| `fetchButtonClassName` | 按钮配色 |
| `fetchStatusLabel` | 按钮文案 |
| `modelsProbeStatus` effect | 批量探测同步 |

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
