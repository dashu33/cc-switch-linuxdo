# CODEMAP — provider-default-openai-chat

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/config/universalProviderPresets.ts` | `createUniversalProviderFromPreset`：newapi / custom_gateway → `meta.apiFormat=openai_chat` |
| `src/App.tsx` | 快速导入创建后再次 `provider.meta.apiFormat = "openai_chat"` |
| `src-tauri/src/provider.rs` | `UniversalProvider::to_codex_provider`：apiFormat 为空时补 `openai_chat` |
| `src/types.ts` | `CodexApiFormat` / `Provider.meta.apiFormat` 类型 |
| `src/components/providers/CodexProviderQuickAdjust.tsx` | 展示/修改上游格式（用户可改） |
| `src/components/providers/forms/CodexFormFields.tsx` | 编辑表单同源选项 |
| `src/config/codexProviderPresets.ts` 等 | 部分第三方 preset 显式 `apiFormat: "openai_chat"` |
| `FEATURE/provider-default-openai-chat/*` | 本文档 |

## 关键代码片段

### 前端统一供应商创建

```ts
// universalProviderPresets.ts
const defaultApiFormat =
  preset.providerType === "newapi" || preset.providerType === "custom_gateway"
    ? ("openai_chat" as const)
    : undefined;
// meta: defaultApiFormat ? { apiFormat: defaultApiFormat } : undefined
```

### 快速导入双保险

```ts
// App.tsx createNewApiFromCredentials
provider.meta = {
  ...(provider.meta ?? {}),
  apiFormat: "openai_chat",
};
```

### Rust 同步到 Codex

```rust
// provider.rs to_codex_provider
if meta.api_format.as_deref().unwrap_or("").trim().is_empty() {
    meta.api_format = Some("openai_chat".to_string());
}
```

注意：仅在 **空** 时补全，不覆盖已有值。

## 检查命令

```powershell
rg -n "openai_chat" src/config/universalProviderPresets.ts src/App.tsx src-tauri/src/provider.rs
rg -n "apiFormat|api_format" src/config/universalProviderPresets.ts src-tauri/src/provider.rs
```

## 后端

- 默认写入本身是字符串 meta，**无新 IPC**
- 代理转换逻辑见 `src-tauri/src/proxy/providers/*`（按 apiFormat 分支）
- 若只改前端创建路径：Vite HMR；若动 `provider.rs`：需 `pnpm tauri dev` 重编

## 与其它 FEAT 边界

| FEAT | 关系 |
|------|------|
| newapi-quick-import | 导入路径强制默认 |
| codex-provider-quick-adjust | 用户事后改格式的入口 |
| copy-provider-to-app | 复制到 Claude 时会 **强制 anthropic**，覆盖/改写目标格式，属另一契约 |
