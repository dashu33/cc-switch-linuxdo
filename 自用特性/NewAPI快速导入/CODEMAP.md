# CODEMAP — NewAPI 快速导入

> 维护目录：\`自用特性/NewAPI快速导入/\`

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/utils/parseNewApiClipboard.ts` | 剪贴板解析核心：URL/Key 提取、Base64 解密、半量解析、合并 |
| `src/utils/parseNewApiClipboard.test.ts` | 单元测试 |
| `src/App.tsx` | 按钮 UI、等待状态、轮询、创建/同步流程 |
| `src/components/universal/UniversalProviderFormModal.tsx` | 预留 quick-import prefill 类型（表单路径；快速导入主路径不依赖打开表单） |
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

## 自动探测

| 符号/路径 | 角色 |
|---|---|
| `src/App.tsx` → `createNewApiFromCredentials` | 快速导入成功后调用 `scheduleAutoProbeProviders([provider.id])` |
| `src/App.tsx` → `scheduleAutoProbeProviders` | 与新建/复制共用；对指定 id 静默探测（无重试） |
| `src/hooks/useFetchCurrentProviderModels.ts` → `probeProviders` | 实际 `/models` 探测与历史合并 |



## 增量：Key 噪声

- `recoverSkKeyFromNoise` / `resolveApiKeyCandidate`：拒绝纯中文标签值，清洗 sk 内嵌 CJK
- 单测：`src/utils/parseNewApiClipboard.test.ts`
