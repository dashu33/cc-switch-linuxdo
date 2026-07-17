# 跨应用复制供应商（Copy Provider To App）

> 维护目录：\`自用特性/跨应用复制供应商/\`

> 文档状态：最后同步：右键复制到其他 App（Codex↔Claude 等）

## 目标

在供应商卡片上 **右键菜单** 提供「复制到…」，把当前应用的供应商 **可移植字段**（Base URL / API Key / Model / 名称与品牌信息）转换后，新增到另一个应用的供应商列表。

典型场景：

- Codex Provider → Claude
- Claude Provider → Codex
- 任意可见 App 之间互拷（受可见性开关过滤）

> 这是 **跨应用新建**，不是同应用「复制/Duplicate」。同应用复制仍走菜单里的「复制」。

## 入口

1. 打开任意应用的供应商列表
2. 在供应商卡片上 **右键**
3. 菜单项：
   - **复制**：同应用 Duplicate
   - **复制到…** → 子菜单列出其他可见应用（如 Claude / Codex / Gemini / OpenCode / OpenClaw / Hermes / Claude Desktop）
4. 选择目标应用后立即执行，成功 Toast：`已复制到 {{app}}`

### 目标应用过滤

`getCopyTargetApps(currentApp, visibleApps)`：

- 排除当前应用
- `visibleApps[app] === false` 的隐藏
- `undefined` 视为可见（与 `App.tsx` 默认一致）

## 可移植字段

从源供应商抽取：

| 字段 | 含义 |
|------|------|
| `baseUrl` | API 端点 |
| `apiKey` | 密钥 |
| `model` | 默认模型（无则用目标 App 默认模型） |

另会保留/改写：

- `name`、`websiteUrl`、`notes`、`icon`、`iconColor`
- `category`：源为 `official` 时落到目标改为 `third_party`（便于编辑）
- `meta`：经 `sanitizeMetaForTarget` 清洗

## 各源应用如何提取凭证

| 源 App | Base URL | API Key | Model |
|--------|----------|---------|-------|
| Claude / Claude Desktop | `env.ANTHROPIC_BASE_URL` | `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` 等角色模型 |
| Codex | config.toml `base_url` | `auth.OPENAI_API_KEY` 或 experimental bearer | 顶层 `model` |
| Gemini | `GOOGLE_GEMINI_BASE_URL` | `GEMINI_API_KEY` | `GEMINI_MODEL` |
| OpenCode | `options.baseURL` | `options.apiKey` | 第一个 model id |
| OpenClaw | `baseUrl` | `apiKey` | 第一个 model |
| Hermes | `base_url` | `api_key` | 第一个 model |
| Grok Build | `settingsConfig.config` TOML 的 `base_url` | 同 TOML 的 `api_key` | `upstream model` / profile |

## 写入目标应用时的形态

### Claude / Claude Desktop

```ts
env: {
  ANTHROPIC_BASE_URL,      // normalizeClaudeBaseUrl：去掉尾部 /v1
  ANTHROPIC_AUTH_TOKEN,
  ANTHROPIC_MODEL,         // 及 haiku/sonnet/opus 默认同值
  ...
}
meta.apiFormat = "anthropic"   // 强制，避免继续按 OpenAI 兼容处理
```

**Codex → Claude 示例**

- 源：`https://proxy.example.com/v1` + `sk-codex` + `gpt-5.5` + `apiFormat: openai_responses`
- 目标：
  - `ANTHROPIC_BASE_URL = https://proxy.example.com`（去 `/v1`）
  - `ANTHROPIC_AUTH_TOKEN = sk-codex`
  - 模型字段填源模型
  - `meta.apiFormat = anthropic`

### Codex

```ts
auth: generateThirdPartyAuth(apiKey)
config: generateThirdPartyConfig(label, normalizeCodexBaseUrl(baseUrl), model)
// normalizeCodexBaseUrl：纯 origin 会补 /v1，已有 path 保留
```

### Gemini / OpenCode / OpenClaw / Hermes

按各自 settingsConfig 约定重建（OpenAI-compatible 系多为 chat completions 形态）。  
OpenCode / OpenClaw / Hermes 为 **additive** 模式：

- 生成唯一 `providerKey`（slug + `-copy` / `-copy-N` 防冲突）
- `addToLive = false`：只进列表，**不自动启用进 live 配置**，等用户手动启用

## meta 清洗规则

| 字段 | 处理 |
|------|------|
| `authBinding` / `githubAccountId` | 删除（账号绑定不可移植） |
| `claudeDesktopMode` / `claudeDesktopModelRoutes` | 仅目标为 Claude Desktop 时保留；目标 Desktop 且无 mode 时默认 `proxy` |
| `providerType` 为 `github_copilot` / `codex_oauth` | 删除 |
| 目标 Claude 系 | 强制 `apiFormat = anthropic` |

## 执行流程（Hook）

```text
useCopyProviderToApp(sourceApp)
  → providersApi.getAll(targetApp)
  → (additive) 读 live provider IDs，合并 existingKeys
  → convertProviderToApp(...)
  → 生成 id（UUID 或 providerKey）
  → sortIndex = 列表末尾
  → injectCodingPlanUsageScript(targetApp, provider)
  → providersApi.add(..., addToLive?)
  → invalidate providers / live ids / tray
  → toast 成功
```

## i18n（`provider.*`）

- `copyToApp` — 复制到…
- `copyToAppTarget` — 复制到 {{app}}
- `copiedToApp` — 已复制到 {{app}}
- `copyToAppFailed` — 复制到其他应用失败
- `copyToAppLiveIdsLoadFailed` — 读目标 live IDs 失败

## 测试

```powershell
pnpm exec vitest run src/utils/copyProviderToApp.test.ts
```

覆盖：slug 冲突、URL 规范化（Codex 补 `/v1` / Claude 去 `/v1`）、Claude↔Codex 转换、official→third_party、目标过滤等。

## 边界与注意

- 只搬运「可移植凭证 + 品牌字段」，**不是**完整 config 深拷贝
- 源官方账号 / OAuth 类往往没有可移植 Key，复制后目标可能缺凭证，需用户补
- Codex→Claude 会 **强制 Anthropic 格式**；若上游实际是 OpenAI 兼容，用户需在 Claude 侧再改 API 格式/路由
- 同应用转换会抛错（`Source and target app must differ`）
- 右键在输入框 / contenteditable / 已有 menu 上不弹出

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)


### Grok Build

```ts
settingsConfig: {
  config: `
[models]
default = "<model-or-default>"

[model."<model-or-default>"]
model = "<model-or-default>"
base_url = "..."
name = "<provider name>"
api_key = "..."
api_backend = "responses"
context_window = 500000
`
}
meta.apiFormat = "openai_responses" // 若源不是 openai_chat/responses
```

说明：

- Grok Build 校验需要完整 TOML 字段；复制时不能只写空对象，否则会提示“缺少字段”。
- 默认 `api_backend=responses`，`context_window=500000`。
- Base URL 与 Codex 同语义：`normalizeCodexBaseUrl`，纯 origin 会补 `/v1`（因为 Grok 客户端会拼 `{base_url}/responses`）。
- 例：Claude 源 `https://api.example.com` → Grok `https://api.example.com/v1`；Codex 源已有 `/v1` 则原样保留。
