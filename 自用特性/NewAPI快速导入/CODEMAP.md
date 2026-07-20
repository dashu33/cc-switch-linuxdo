# CODEMAP — NewAPI 快速导入

> 维护目录：\`自用特性/NewAPI快速导入/\`

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/utils/parseNewApiClipboard.ts` | 剪贴板解析核心：URL/Key 提取、Base64 解密、半量解析、合并 |
| `src/utils/parseNewApiClipboard.test.ts` | 单元测试 |
| `src/App.tsx` | 按钮 UI、等待状态、轮询、创建/同步流程 |
| `src/components/universal/UniversalProviderFormModal.tsx` | 统一供应商编辑页；八端开关与共享模型配置 |
| `src/components/universal/UniversalProviderCard.tsx` | 展示八端启用状态 |
| `src/components/providers/AddProviderDialog.tsx` | 所有应用均开放统一供应商入口 |
| `src/types.ts` / `src/config/universalProviderPresets.ts` | 统一供应商目标应用与默认模型定义 |
| `tests/config/universalProviderPresets.test.ts` | NewAPI 默认八端同步目标回归测试 |
| `src-tauri/src/provider.rs` | 统一供应商到八端转换；`UniversalProviderApps` 旧 JSON 扩展端迁移；Desktop 三档路由 |
| `src-tauri/src/database/dao/universal_providers.rs` | 统一供应商 CRUD；读取时检测缺字段并回写 |
| `src-tauri/src/services/provider/mod.rs` | `sync_universal_to_apps` / `delete_universal`；additive live 优先与删除失败可重试 |
| `src/i18n/locales/zh.json` 等 | `provider.quickImport*` 文案 |

## 调用链

```text
Header「快速导入」按钮
  └─ handleQuickImportNewApi()
       ├─ readText() 读剪贴板
       ├─ parseNewApiClipboardPartial()
       └─ applyQuickImportPartial()
            ├─ mergeNewApiCredentials()
            ├─ 完整？→ createNewApiFromCredentials()
            │            ├─ findPresetByType("newapi")
            │            ├─ createUniversalProviderFromPreset(...)
            │            ├─ provider.websiteUrl = baseUrl
            │            ├─ provider.name = `M月D日 HH:mm {baseUrl}`
            │            ├─ universalProvidersApi.upsert
            │            └─ universalProvidersApi.sync + invalidate providers
            │                 └─ 八个应用的原生子供应商（additive 应用同时写 live）
            └─ 半量？→ setQuickImportPending + 800ms 轮询剪贴板
```

## App.tsx 关键状态

| 符号 | 含义 |
|------|------|
| `isQuickImporting` | 单次点击处理中（非等待） |
| `quickImportPending` | 半量等待中的 UI 状态 |
| `quickImportPendingRef` | 轮询闭包用的半量缓存 |
| `quickImportLastClipRef` | 上次处理过的剪贴板文本，避免重复解析 |

## 关键函数（App.tsx）

| 函数 | 职责 |
|------|------|
| `clearQuickImportPending` | 清空等待状态 |
| `createNewApiFromCredentials` | 用完整凭证创建 NewAPI 统一供应商并同步 |
| `applyQuickImportPartial` | 合并半量；齐了就创建，否则进入/保持等待 |
| `handleQuickImportNewApi` | 按钮入口；等待中再点=取消 |

## 解析模块关键实现点

| 函数 | 说明 |
|------|------|
| `normalizeBaseUrl` | 补 `https://`、去尾斜杠等 |
| `decodeApiKeyIfNeeded` | 识别 Base64/`c2st` 并解码为明文 Key |
| `decodeSecretLayers` | 单层（必要时嵌套）Base64 密钥解密；接受非 sk 密文 |
| `stripMarkdownWrapper` | 解开 `[url](url)` / 标签里的 Markdown 链接 |
| `looksLikeSecretToken` | 判定解码后的非 sk 长 token 是否像密钥 |
| `tryDecodeBase64Candidate` | 整段文本尝试 Base64 解码 |
| `parseOnce` | 单候选文本提取 |
| `parseNewApiClipboardPartial` | 对外半量 API |
| `parseNewApiClipboard` | 对外完整 API |

## UI 落点（App.tsx Header）

- 位置：`添加供应商`（Plus）按钮右侧
- 空闲：`ClipboardPaste` 图标
- 导入中 / 等待中：`Loader2` 旋转
- 等待中按钮边框：琥珀色 `border-amber-500/70`
- 等待文案：按钮旁 `motion.span`

## 关键符号（统一供应商一致性）

| 符号 | 职责 |
|------|------|
| `UniversalProviderApps::deserialize` | 缺扩展端字段 → true；显式 false 保留 |
| `universal_apps_json_needs_extended_fields` | 判断是否需要落盘迁移 |
| `Database::get_all_universal_providers` | 读时迁移并回写完整 apps |
| `ProviderService::delete_universal` | 先清 live/子项，失败保留统一记录 |
| `ProviderService::sync_universal_to_apps` | 八端独立同步，聚合错误 |
| `ProviderService::sync_universal_child` | additive：live→DB；失败可回滚 |
| `UniversalProvider::to_claude_desktop_provider` | sonnet/opus/haiku 分档路由 |

## 验证命令

```powershell
# 前端预设与缺字段归一
pnpm exec vitest run tests/config/universalProviderPresets.test.ts

# 后端单元（provider + DAO 迁移逻辑）；若本机 cargo test 遇 0xc0000139 至少 cargo check
cd src-tauri
cargo test --lib provider::tests::legacy_universal_apps_json_enables_missing_extended_apps -- --nocapture
cargo test --lib provider::tests::universal_claude_desktop_routes_use_tiered_models -- --nocapture
cargo test --lib database::dao::universal_providers -- --nocapture
```

## 外部格式核验依据

生产转换的 URL/字段约束来自实际客户端与官方源码，而非本仓库文档：NewAPI `router/relay-router.go`（`/v1` 与 `/v1beta` 路由）、Claude Code `2.1.211` bundle、Claude Desktop `1.11187.4.0` AppX `app.asar`、Gemini CLI commit `acae7124bdd849e554eaa5e090199a0cf08cd782` 与 `@google/genai@1.30.0`、Grok Build `0.2.103` 本机配置/内置配置说明、OpenCode `1.17.15` provider schema、OpenClaw `zod-schema.core.ts`、Hermes `config.py` 与 `runtime_provider.py`。对应只读快照在 `C:\WINDOWS\TEMP\codex-vendor-*`；Claude Desktop 安装包位于本机 WindowsApps 目录。

关键实现：`src-tauri/src/provider.rs` 的 `anthropic_base_url` / `gemini_base_url` 避免官方客户端重复拼接版本路径；`to_hermes_provider` 显式写入 `api_mode: chat_completions`。

## 回归检查清单

- [ ] 同时含 URL+Key 的剪贴板 → 一次点击创建
- [ ] 仅 URL → 等待 Key → 复制 Key 后自动创建
- [ ] 仅 Key → 等待 URL → 复制 URL 后自动创建
- [ ] 等待中再点 → 取消
- [ ] Base64 Key（`c2st...`）正确解密
- [ ] `API：` + Markdown URL + `KEY：` 非 sk Base64 → 单层解密后创建
- [ ] Markdown 链接取到 URL
- [ ] 创建后名称是「日期时间+URL」
- [ ] `websiteUrl === baseUrl`
- [ ] 同步成功后供应商列表刷新
- [ ] 升级前仅含 claude/codex/gemini 的旧统一供应商：打开/同步后扩展五端为启用
- [ ] 用户曾显式关闭 openclaw 等：升级后仍保持关闭
- [ ] 删除时 live 清理失败 → toast 错误且统一记录仍在，可重试
- [ ] 同步时单端 live 失败 → 其它端仍尝试；错误信息含失败端
- [ ] Claude Desktop 子供应商 meta 路由：Opus/Haiku 不等于仅主模型

## 自动探测

| 符号/路径 | 角色 |
|---|---|
| `src/App.tsx` → `createNewApiFromCredentials` | 快速导入成功后调用 `scheduleAutoProbeProviders([provider.id])` |
| `src/App.tsx` → `scheduleAutoProbeProviders` | 与新建/复制共用；对指定 id 静默探测（无重试） |
| `src/hooks/useFetchCurrentProviderModels.ts` → `probeProviders` | 实际 `/models` 探测与历史合并 |



## 增量：Key 噪声

- `recoverSkKeyFromNoise` / `resolveApiKeyCandidate`：拒绝纯中文标签值，清洗 sk 内嵌 CJK
- 单测：`src/utils/parseNewApiClipboard.test.ts`


## Grok Build TOML 点号 profile（易冲突）

| 项 | 说明 |
|---|---|
| 共享构建 | `src-tauri/src/grok_config.rs` → `build_provider_config_toml`（统一供应商同步 + deeplink 共用） |
| 调用点 | `provider.rs` → `to_grokbuild_provider`；`deeplink/provider.rs` → `build_grokbuild_settings` |
| 问题 | 默认 model `grok-4.5`；`document["model"][profile]` 会被 toml_edit 拆成嵌套路径，序列化 `model = {}`，丢失 base_url/api_key |
| 正确写法 | `model_root.insert(profile, Item::Table(...))` 再挂到 `document["model"]`；禁止 IndexMut 点号路径 |
| 对照 | 前端 `src/utils/grokBuildConfig.ts`（smol-toml）会正确写出 `[model."grok-4.5"]` |
| 验证 | `build_provider_config_toml_keeps_dotted_profile_credentials` + `universal_provider_to_grokbuild_provider_builds_valid_config` |

