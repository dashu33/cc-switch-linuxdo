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
| `src-tauri/src/proxy/providers/transform_codex_chat.rs` | Chat→Responses usage 转换；`ensure_responses_usage_shape` |
| `src-tauri/src/proxy/providers/transform_codex_anthropic.rs` | Anthropic→Responses usage 转换，始终补 details |
| `src-tauri/src/proxy/providers/streaming_codex_chat.rs` | 流式 Chat→Responses 默认 usage 补 details |
| `src-tauri/src/proxy/providers/streaming_codex_anthropic.rs` | 流式 Anthropic→Responses 默认 usage 补 details |
| `src-tauri/src/proxy/response_processor.rs` | Grok/Codex Responses 透传时归一化 JSON/SSE usage |

## 关键符号

- `supportsProviderQuickAdjust`
- `resolveProviderApiFormat`
- `applyProviderApiFormat`
- `providerNeedsRouting`
- `resolveProviderQuickModel`
- `applyProviderModel(..., "grokbuild", modelId)`
- `hasInlineQuickAdjust`
- `needsRouting`
- `ensure_responses_usage_shape`
- `ensure_responses_payload_usage`
- `chat_usage_to_responses_usage`
- `build_responses_usage_from_anthropic`
- `needs_responses_usage_shape`
- `create_responses_usage_normalized_stream`

## 数据流

1. 卡片快捷改 format → `applyProviderApiFormat`
2. 写 `meta.apiFormat`；Grok 同步 `api_backend`
3. 卡片改模型 → `applyProviderModel`
4. Grok 更新 TOML `model` / profile
5. 获取模型 → `resolveProviderModelsProbeTarget` → `fetchModelsForConfig`
6. 需路由徽章 → `providerNeedsRouting`
7. 终端 Grok 请求 → 本地 `http://127.0.0.1:15721/grokbuild/v1`
8. 上游返回 Responses 或经 Chat/Anthropic 转换回 Responses
9. 转换层/透传层补齐 `usage.input_tokens_details` 后返回 Grok CLI

## 易冲突点

- 上游若改 ProviderCard 快捷门控，需保留 `supportsProviderQuickAdjust`
- Grok TOML 字段名变化时同步改 `grokBuildConfig` / `providerQuickAdjust`
- 不要把官方 OAuth 供应商误开快捷拉取
- 上游若改 Responses usage 形状，需同步 `ensure_responses_usage_shape`
- 透传归一化仅限 `codex` / `grokbuild`，避免影响 Claude/Gemini 热路径

## 验证命令

```powershell
pnpm exec vitest run src/utils/providerQuickAdjust.test.ts src/utils/copyProviderToApp.test.ts
cd src-tauri
cargo check -p cc-switch --lib
cargo test --lib chat_usage_to_responses_always_emits_input_tokens_details ensure_responses_usage_shape_fills_missing_details
```

