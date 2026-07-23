# CODEMAP — Codex 供应商快速调整

> 维护目录：\`自用特性/Codex供应商快速调整/\`

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/components/providers/CodexProviderQuickAdjust.tsx` | UI + 格式/模型/获取状态色 + 失败原因旁显 |
| `src/components/providers/ProviderCard.tsx` | `supportsProviderQuickAdjust` + **排除 Hermes 只读**；传 `onUpdate` + probe 状态 |
| `src/utils/providerQuickAdjust.ts` | 全局：八端门控、OpenClaw/OpenCode/Hermes 协议映射、Gemini 默认、需路由、模型读取 |
| `src/utils/applyProviderModel.ts` | 模型写回：Codex/Claude/Gemini/Grok/OpenClaw/OpenCode/**Hermes** |
| `src/utils/providerModelsProbe.ts` | 拉模型凭证解析（含 openclaw baseUrl/apiKey） |
| `src/utils/providerQuickAdjust.test.ts` | 门控 + Grok/OpenClaw format/model 单测 |
| `src/components/providers/ProviderList.tsx` | 透传 `onUpdate`、probe 状态 |
| `src/App.tsx` | `updateProvider` |
| `src/lib/api/model-fetch.ts` | 拉模型 |
| `src/utils/providerConfigUtils.ts` | model / baseUrl / wire_api / bearer |
| `src/types.ts` | `CodexApiFormat`、`OpenClawModel`、`meta.apiFormat` |
| `src/config/openclawProviderPresets.ts` | `openclawApiProtocols`（文案/协议参考） |
| `src/i18n/locales/*` | `codexConfig.quick*` / `openclaw.apiProtocol*` |
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
// Codex
settings.config = setCodexModelName(prevConfig, modelId);
// OpenClaw：models[0] 为主模型；已存在则前移并保留字段
applyOpenClawPrimaryModel(settings, modelId);
```

### OpenClaw 协议

```ts
settings.api = openclawProtocolFromApiFormat(format); // + meta.apiFormat 镜像
```

## 与表单一致性

| 点 | 快速调整 | CodexFormFields / OpenClawFormFields |
|----|----------|--------------------------------------|
| 格式三值 / OpenClaw 协议 | 同映射 | 同 |
| wire_api | 不改写 | 固定 responses |
| OpenClaw models 主模型 | index 0 | index 0「默认模型」 |
| 拉模型 API | 同 `fetchModelsForConfig` | 同 |

## 增量：多应用

- `CodexProviderQuickAdjust` 接收 `appId`
- `resolveProbeCredentials` 复用 `resolveProviderModelsProbeTarget`
- 模型写入统一 `applyProviderModel`
- format / 需路由 / 门控统一走 `providerQuickAdjust`
- OpenClaw：`usesDirectUpstreamFormat` 切换协议文案；`resolveProviderKnownModelIds` 填充下拉
- `ProviderCard` 挂载条件：`supportsProviderQuickAdjust(appId)` + onUpdate（**含 official / openclaw**）

## 验证命令

```powershell
pnpm exec vitest run src/utils/providerQuickAdjust.test.ts tests/components/ProviderCardLayout.test.ts
```
