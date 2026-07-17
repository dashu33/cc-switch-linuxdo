# CODEMAP — 跨应用复制供应商

> 维护目录：\`自用特性/跨应用复制供应商/\`

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/utils/copyProviderToApp.ts` | **核心**：提取凭证、URL 规范化、meta 清洗、`convertProviderToApp`、`getCopyTargetApps` |
| `src/utils/grokBuildConfig.ts` | Grok Build TOML 构建/解析（复制到 Grok Build 时使用） |
| `src/utils/copyProviderToApp.test.ts` | 单元测试 |
| `src/hooks/useCopyProviderToApp.ts` | 异步执行：拉目标列表、防 key 冲突、add、缓存失效、toast |
| `src/components/providers/ProviderContextMenu.tsx` | 右键菜单 UI：Duplicate + 复制到… 子菜单 |
| `src/components/providers/ProviderCard.tsx` | 有 `onCopyToApp` 时用 ContextMenu 包裹卡片 |
| `src/components/providers/ProviderList.tsx` | 透传 `onCopyToApp` |
| `src/App.tsx` | `useCopyProviderToApp(activeApp)` → `onCopyToApp={copyProviderToApp}` |
| `src/config/appConfig.ts` | `APP_IDS` / `APP_ICON_MAP`（目标列表与图标） |
| `src/config/codexProviderPresets.ts` | `generateThirdPartyAuth` / `generateThirdPartyConfig`（写 Codex 配置） |
| `src/config/codingPlanProviders.ts` | `injectCodingPlanUsageScript`（部分目标注入用量脚本） |
| `src/utils/providerSort.ts` | `nextProviderSortIndex` |
| `src/i18n/locales/*.json` | `provider.copyToApp*` / `copiedToApp` |

## 调用链

```text
ProviderCard 右键
  └─ ProviderContextMenu
       ├─ Duplicate → onDuplicate(provider)
       └─ 复制到… → onCopyToApp(provider, targetApp)
            └─ useCopyProviderToApp(sourceApp)
                 ├─ providersApi.getAll(targetApp)
                 ├─ (opencode/openclaw/hermes) get*LiveProviderIds()
                 ├─ convertProviderToApp(provider, source, target, { existingTargetKeys })
                 │    ├─ extractPortableCredentials
                 │    ├─ sanitizeMetaForTarget
                 │    ├─ buildSettingsConfig
                 │    └─ (claude*) meta.apiFormat = "anthropic"
                 ├─ injectCodingPlanUsageScript
                 ├─ providersApi.add(newProvider, targetApp, addToLive?)
                 └─ invalidateQueries + updateTrayMenu + toast
```

## 关键导出

```ts
// copyProviderToApp.ts
COPYABLE_APP_IDS
extractPortableCredentials(provider, sourceApp)
convertProviderToApp(provider, sourceApp, targetApp, options?)
getCopyTargetApps(currentApp, visibleApps?)
normalizeCodexBaseUrl(url)
normalizeClaudeBaseUrl(url)
slugifyProviderKey(name)
generateUniqueProviderKey(preferred, existingKeys)

// hook
useCopyProviderToApp(sourceApp): (provider, targetApp) => Promise<void>
```

## Codex ↔ Claude 转换要点

| 方向 | Base URL | settingsConfig | meta |
|------|----------|----------------|------|
| Claude → Codex | 补 `/v1`（origin-only） | `auth` + TOML `config` | 去掉 authBinding / oauth providerType |
| Codex → Claude | 去尾部 `/v1` | Anthropic env | **强制** `apiFormat: "anthropic"` |

## UI 接线检查

```powershell
rg -n "onCopyToApp|useCopyProviderToApp|getCopyTargetApps|convertProviderToApp" src --glob "*.{ts,tsx}"
```

期望：

- `App.tsx`：`const copyProviderToApp = useCopyProviderToApp(activeApp)` 且传给 `ProviderList`
- `ProviderList` map / Sortable 透传 `onCopyToApp`
- `ProviderCard` 在 `onCopyToApp` 存在时包 `ProviderContextMenu`

## 回归清单

- [ ] Codex 卡片右键 → 复制到 Claude → 目标列表出现同名供应商
- [ ] Claude → Codex：base_url 含 `/v1`，auth 有 OPENAI_API_KEY
- [ ] Codex → Claude：BASE_URL 无尾部 `/v1`，`meta.apiFormat === anthropic`
- [ ] 隐藏的 App 不出现在「复制到…」子菜单
- [ ] OpenCode/OpenClaw/Hermes：key 冲突时生成 `-copy`，且未自动 addToLive
- [ ] official 源复制后目标 category 为 third_party
- [ ] 失败时有错误 toast；liveIds 读取失败有专用文案

## 测试命令

```powershell
pnpm exec vitest run src/utils/copyProviderToApp.test.ts
```
