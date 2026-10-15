# CODEMAP — 新建供应商默认 openai_chat

> 维护目录：\`自用特性/新建供应商默认openai_chat/\`

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/config/universalProviderPresets.ts` | `createUniversalProviderFromPreset`：newapi / custom_gateway → `meta.apiFormat=openai_chat` |
| `src/App.tsx` | 快速导入创建后再次 `provider.meta.apiFormat = "openai_chat"` |
| `src-tauri/src/provider.rs` | `UniversalProvider::to_codex_provider`：apiFormat 为空时补 `openai_chat`；`claude_meta_from_universal` 把 Claude 家族派生 meta 的 `openai_chat`/空值归一到 `anthropic` |
| `src-tauri/src/services/provider/mod.rs` | `sync_universal_child`：子供应商 `meta.apiFormatExplicit` 为 true 时保留其 `apiFormat` |
| `src/types.ts` | `CodexApiFormat` / `Provider.meta.apiFormat` / `Provider.meta.apiFormatExplicit` 类型 |
| `src/components/providers/CodexProviderQuickAdjust.tsx` | 展示/修改上游格式（用户可改），经 `applyProviderApiFormat` 写入 `apiFormatExplicit` |
| `src/components/providers/forms/CodexFormFields.tsx` | 编辑表单同源选项 |
| `src/components/providers/forms/ProviderForm.tsx` | Claude 表单的「API 格式」下拉；用户点过后写 `apiFormatExplicit: true` |
| `src/config/codexProviderPresets.ts` 等 | 部分第三方 preset 显式 `apiFormat: "openai_chat"` |
| `自用特性/新建供应商默认openai_chat/*` | 本文档 |

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

### Rust 同步到 Claude（不继承 Codex 默认）

```rust
// provider.rs claude_meta_from_universal
let inherited = meta.api_format.as_deref().unwrap_or("").trim();
if inherited.is_empty() || inherited == "openai_chat" {
    meta.api_format = Some("anthropic".to_string());
}
meta.api_format_explicit = None;
```

`to_claude_provider` / `to_claude_desktop_provider` 都经由该 helper 派生 meta。
派生的默认值**不**标记 `apiFormatExplicit`，因此不会被误当成用户选择。

### 重新同步时保留用户选择

```rust
// services/provider/mod.rs sync_universal_child
let explicit = existing.meta.as_ref()
    .and_then(|m| m.api_format_explicit)
    .unwrap_or(false);
if explicit {
    // 用子供应商已保存的 api_format 覆盖本次派生值，并保留标记
}
```

前端置位点：`applyProviderApiFormat`（卡片）与 `ProviderForm` 的
`handleApiFormatChange`（Claude 编辑弹窗，仅在用户实际点选后）。

## 检查命令

```powershell
rg -n "openai_chat" src/config/universalProviderPresets.ts src/App.tsx src-tauri/src/provider.rs
rg -n "apiFormat|api_format" src/config/universalProviderPresets.ts src-tauri/src/provider.rs
rg -n "apiFormatExplicit|api_format_explicit" src src-tauri/src
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
| [Claude模型映射批量设置](../Claude模型映射批量设置/) | 同属 Claude 弹窗改动，但不涉及协议默认，两者独立 |

## 后端

本次 Claude 侧改动动了 `provider.rs` 与 `services/provider/mod.rs`，需要 `pnpm tauri dev` 或重新构建后端才生效；纯前端部分走 Vite HMR。
