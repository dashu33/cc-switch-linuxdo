# CODEMAP · GrokBuild 供应商对齐 Codex

> 维护目录：`自用特性/GrokBuild供应商对齐Codex/`

## 生产实现

| 路径 | 作用 |
|---|---|
| `src/utils/providerQuickAdjust.ts` | 全局：快捷 App 列表、format 解析/写入、需路由判定 |
| `src/utils/providerQuickAdjust.test.ts` | 全局框架与 Grok 单测 |
| `src/utils/applyProviderModel.ts` | 写入模型；新增 Grok TOML upstream model |
| `src/components/providers/CodexProviderQuickAdjust.tsx` | 卡片快捷 UI，复用全局 helper |
| `src/components/providers/ProviderCard.tsx` | 开启 Grok 快捷条 + 统一“需要路由”徽章 |
| `src/utils/providerModelsProbe.ts` | 探针目标解析（经 extractPortableCredentials 支持 Grok） |
| `src/utils/copyProviderToApp.ts` | 跨应用复制到/从 Grok 的凭证与 TOML 生成 |
| `src/components/providers/forms/GrokBuildProviderForm.tsx` | 编辑弹窗（已复用 CodexFormFields） |

## 关键符号

- `supportsProviderQuickAdjust`
- `resolveProviderApiFormat`
- `applyProviderApiFormat`
- `providerNeedsRouting`
- `resolveProviderQuickModel`
- `applyProviderModel(..., "grokbuild", modelId)`
- `hasInlineQuickAdjust`
- `needsRouting`

## 数据流

1. 卡片快捷改 format → `applyProviderApiFormat`
2. 写 `meta.apiFormat`；Grok 同步 `api_backend`
3. 卡片改模型 → `applyProviderModel`
4. Grok 更新 TOML `model` / profile
5. 获取模型 → `resolveProviderModelsProbeTarget` → `fetchModelsForConfig`
6. 需路由徽章 → `providerNeedsRouting`

## 易冲突点

- 上游若改 ProviderCard 快捷门控，需保留 `supportsProviderQuickAdjust`
- Grok TOML 字段名变化时同步改 `grokBuildConfig` / `providerQuickAdjust`
- 不要把官方 OAuth 供应商误开快捷拉取


## 代理 usage 兼容

| 路径 | 作用 |
|---|---|
| `src-tauri/src/proxy/providers/transform_codex_chat.rs` | `ensure_responses_usage_shape` / Chat→Responses 始终补全 details |
| `src-tauri/src/proxy/providers/transform_codex_anthropic.rs` | Anthropic→Responses usage 始终补全 details |
| `src-tauri/src/proxy/providers/streaming_codex_chat.rs` | 流式默认 usage 补全 details |
| `src-tauri/src/proxy/providers/streaming_codex_anthropic.rs` | 流式默认 usage 补全 details |
| `src-tauri/src/proxy/response_processor.rs` | codex/grokbuild 流式与非流式响应出口补全 usage details |

关键符号：`ensure_responses_usage_shape`、`ensure_responses_payload_usage`

## 验证命令

```powershell
pnpm exec vitest run src/utils/providerQuickAdjust.test.ts src/utils/copyProviderToApp.test.ts
```
