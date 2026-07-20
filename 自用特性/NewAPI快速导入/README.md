# NewAPI 快速导入

> 维护目录：\`自用特性/NewAPI快速导入/\`

> 文档状态：最后同步：八端一致性（旧 JSON 扩展端迁移 / 删除失败可重试 / 同步分端聚合 / Desktop 三档模型）

## 目标

在「添加供应商」按钮右侧提供 **快速导入** 入口：

1. 直接读取系统剪贴板
2. 解析出 `BASE URL` + `API KEY`
3. 以 **统一供应商 / NewAPI** 预设 **直接创建并同步**
4. **不打开** NewAPI 表单让用户手填
5. 默认同步到全部八个模型客户端：Claude、Claude Desktop、Codex、Gemini、Grok Build、OpenCode、OpenClaw、Hermes

产品路径语义：`添加供应商 → 统一供应商 → NewAPI`  
实现上走 `findPresetByType("newapi")` + `createUniversalProviderFromPreset` + `universalProvidersApi.upsert/sync`。

## 交互

### 完整凭证一次粘贴

剪贴板同时包含 URL 与 Key：

1. 点击剪贴板图标按钮
2. 解析成功 → 立即创建供应商并同步
3. Toast：`已快速导入 NewAPI 供应商「…」并同步`

### 分两次复制（半量等待）

剪贴板只有 URL 或只有 Key：

1. 第一次点击：识别到一半，进入 **等待状态**
2. UI：按钮旋转动画 + 琥珀色提示文案
3. 后台每 **800ms** 轮询剪贴板
4. 捕捉到缺失的另一半 → 自动合并并创建
5. 等待中再次点击 → **取消等待**

| 已识别 | 等待提示 |
|--------|----------|
| 仅 URL | 已识别 BASE URL，请复制 API Key（将自动导入） |
| 仅 Key | 已识别 API Key，请复制 BASE URL（将自动导入） |

### 创建结果字段

| 字段 | 规则 |
|------|------|
| 供应商类型 | NewAPI 预设（`providerType: "newapi"`） |
| 同步目标 | 全部八个模型客户端（默认全开，可在统一供应商编辑页逐项关闭） |
| 名称 | `M月D日 HH:mm {baseUrl}`（例：`7月14日 23:40 https://sub2.zmoon.top/v1`） |
| websiteUrl | 等于 `baseUrl`（不再写死官网） |
| baseUrl / apiKey | 解析结果 |
| meta.apiFormat | 默认 `openai_chat`（Chat Completions，需开启路由）；同步到 Codex 时写入子供应商 meta |

## 剪贴板解析能力

实现：`src/utils/parseNewApiClipboard.ts`

支持常见粘贴形态：

- 带标签文本：`URL: ...` / `API Key: ...` / 裸 `API：` / 裸 `KEY：`（含中文冒号）/ 中文「地址」「密钥」等
- JSON（`baseUrl`/`apiKey` 及 snake_case 变体）
- 自由文本混排
- 裸域名：`sub2api.cursorlao.online`
- Markdown 链接：`[Sub2API - AI API Gateway](https://sub2.zmoon.top/v1)`
- Query 参数中的 key
- `sk-` 开头 Key
- Base64 Key（含 `c2st…` 即 `base64("sk-...")`，以及非 `sk-` 密文）自动解密；默认只解一层，避免二次解码变成乱码
- 整段 Base64 文本解码后再解析
- 非 `sk-` 明文长 token（如 `linuxdo-...`）

### 样本

**样本 A：域名 + Base64 Key**

```text
sub2api.cursorlao.online1Sub2API - AI API Gatewayc2stYWViODgyODhiZTZkNTFjOWVhNGM3ZjZjODlhMzI1ZmNkMGRlNzU4MjFhZTU5MmFlNzk4NmYwMjc3Y2I1YTVmYw==
```

期望：

- baseUrl ≈ `https://sub2api.cursorlao.online`
- apiKey 为解码后的 `sk-...`

**样本 B：Markdown + 明文 Key**

```text
[Sub2API - AI API Gateway](https://sub2.zmoon.top/v1)
linuxdo-suiranjintianbushixingqisidanshiVwo50quchiKFC
```

期望：

- baseUrl = `https://sub2.zmoon.top/v1`
- apiKey = `linuxdo-suiranjintianbushixingqisidanshiVwo50quchiKFC`

**样本 C：`API：` + Markdown URL + `KEY：` Base64（非 sk）**

```text
API：[https://xai.nds.kdns.fr:8443/v1](https://xai.nds.kdns.fr:8443/v1)

KEY：YkhOd1Q0OEhoWkZwM2lUZHRBNjFOR3p4Q1lpNkNyY2Q5WlJzQ0o0NG1xWjhHaDhtOHFYNmRGYmRzUGJZZEdMWQ==
```

期望：

- baseUrl = `https://xai.nds.kdns.fr:8443/v1`
- apiKey = `bHNwT48HhZFp3iTdtA61NGzxCYi6Crcd9ZRsCJ44mqZ8Gh8m8qX6dFbdsPbYdGLY`（单层 Base64 解密；不再二次解码）

## API 面

```ts
parseNewApiClipboardPartial(text): PartialNewApiCredentials | null
// 只识别到 URL 或 Key 时也返回；都没有则 null

mergeNewApiCredentials(current, next): PartialNewApiCredentials
// 合并半量结果，后者非空覆盖

parseNewApiClipboard(text): ParsedNewApiCredentials | null
// 完整凭证才返回；否则 null
```

## i18n Key

命名空间：`provider.*`（四语：zh / zh-TW / en / ja）

- `quickImport`
- `quickImportEmptyClipboard`
- `quickImportParseFailed`
- `quickImportClipboardError`
- `quickImportMissingPreset`
- `quickImportCreated`
- `quickImportWaitingUrl`
- `quickImportWaitingKey`
- `quickImportWaitingHint`
- `quickImportCancelled`
- `quickImportPartialNoMatch`

## 测试

```powershell
pnpm exec vitest run src/utils/parseNewApiClipboard.test.ts
```

覆盖：标签/JSON/Base64/Markdown/半量/合并/`API：`+`KEY：` 非 sk Base64 等（14+ cases）。

## 已知边界

- 等待期间剪贴板无关内容会被跳过，不中断等待
- 需系统剪贴板权限（`@tauri-apps/plugin-clipboard-manager` 的 `readText`）
- 名称用当前本地时间，不使用剪贴板里的产品名（产品决策）
- 不打开编辑表单；失败时 toast，不静默吞错
- Grok Build 使用独立 TOML 子供应商（`universal-grokbuild-*`），模型默认 `grok-4.5`
- Claude Desktop 复用 Claude 的 **sonnet/opus/haiku 三档** 模型做 proxy 路由（不是全部指向主模型）；OpenCode/OpenClaw/Hermes 复用 Codex/OpenAI 模型
- OpenCode/OpenClaw/Hermes 同步时先写 additive live 再落 DB；live 失败不落库，且不阻断其余端；任一端失败返回聚合错误
- 删除统一供应商时先清理全部可能的子供应商与 live 密钥，**全部成功后才删统一记录**；清理失败保留记录并提示错误以便重试
- 升级前创建的旧 JSON 若缺少 `grokbuild` / `claudeDesktop` / `opencode` / `openclaw` / `hermes` 字段：读取时按「启用」迁移并回写，而不是 `false`

## 外部格式核验（2026-07-20）

本特性的八端转换不是按本仓库注释推断，已对照实际配置与客户端实现核验：

- NewAPI 官方路由源码确认 OpenAI Chat/Responses 为 `/v1/*`、Anthropic 为 `/v1/messages`、Gemini 原生为 `/v1beta/models/*`。
- Claude Code `2.1.211` 实际 bundle 使用 `ANTHROPIC_BASE_URL` 并追加 `/v1/messages`，所以 Claude 目标会去掉输入 URL 末尾 `/v1`。
- Claude Desktop `1.11187.4.0` 本机 AppX 的 `app.asar` schema 声明 3P gateway 使用 `inferenceGatewayBaseUrl`、`inferenceGatewayAuthScheme` 与 `inferenceModels`，模型项为 `name`/`labelOverride`/`supports1m`；当前 Desktop proxy profile 与该形状一致。
- Gemini CLI 官方源码（commit `acae7124bdd849e554eaa5e090199a0cf08cd782`）把 `GOOGLE_GEMINI_BASE_URL` 传给 `@google/genai`；`@google/genai@1.30.0` 的实际 URL 构造为 `baseUrl/v1beta/models/...`，所以 Gemini 目标会去掉末尾 `/v1` 或 `/v1beta`。
- Grok Build `0.2.103` 的实际 `~/.grok/config.toml` 与内置配置说明使用 `[models].default`、`[model.<profile>]`、`model`、`base_url`、`api_backend = "responses"`。
- OpenCode `1.17.15` 实际配置与官方 provider schema 使用 `npm: "@ai-sdk/openai-compatible"`、`options.baseURL`/`apiKey`、`models.<id>.name`。
- OpenClaw 官方 `ModelProviderSchema` 要求 `baseUrl`、`apiKey`、`api: "openai-completions"` 与模型数组中的 `id`/`name`；当前写入形状符合该 schema。
- Hermes 官方 `config.py` / `runtime_provider.py` 接受 `base_url`、`api_key`、`model`、`models` 和 `api_mode`，默认 OpenAI 兼容线路为 `chat_completions`；当前写入显式固定该模式，模型数组中的 `name` 会由 Hermes 正常化器作为显示字段丢弃。

核验用的只读源码快照位于 `C:\WINDOWS\TEMP\codex-vendor-*`，未加入本仓库。

## 增量：统一供应商八端一致性修复

| 问题 | 处理 |
|------|------|
| 旧记录缺扩展端字段 → 永远关 | `UniversalProviderApps` 自定义反序列化 + DAO 回写迁移；前端 `?? true` |
| 删除成功但 live 残留密钥 | 先 live/DB 清理，失败则不删统一记录 |
| 八端同步部分成功被中断 | 各端独立收集错误；additive live 先写后 DB |
| Desktop 三档全走主模型 | `to_claude_desktop_provider` 分别映射 sonnet/opus/haiku |

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)

## 相关：默认 openai_chat

见 [../新建供应商默认openai_chat/](../新建供应商默认openai_chat/)。

## 导入后自动探测

- 快速导入成功后复用 `scheduleAutoProbeProviders([provider.id])`。
- 与新建/复制同一路径：静默 `probeProviders`，延迟约 400ms 后静默探测一次。
- 探测结果进入可用性排序与状态图标，不自动改写供应商默认模型配置。


## 增量：Key 中文噪声清洗

支持分享文案把说明文字嵌进 key 的场景：

```text
base url：https://welfare.0xpsyche.me/v1
key：删掉中文！！！
sk-5d80删7485003掉463577653d中9122445fc162fb7文b8c35928d966
```

规则：
- 标签行若是纯中文说明（如 `key：删掉中文！！！`）→ **忽略**，继续扫后面真正的 key
- `sk-` 中间夹中文/全角标点 → 自动剔除后拼接
- 标签后同一行就是带噪声的 sk key → 同样清洗


## 缺陷修复：Grok Build 同步后 KEY/BASEURL 为空（2026-07-20）

### 现象

一键/快速导入 NewAPI 后，同步到 **Grok Build** 的子供应商卡片上 **API Key** 或 **Base URL** 为空（其它端如 Codex/Claude 正常）。

### 根因

`UniversalProvider::to_grokbuild_provider` 默认模型为 `grok-4.5`。写入 TOML 时使用：

```rust
document["model"][profile] = Item::Table(...);
```

`toml_edit` 的 `IndexMut` 会把带点的 key 当成**嵌套路径**（`model` → `grok-4` → `5`），结果序列化成：

```toml
models = { default = "grok-4.5" }
model = {}
```

前端 `parseGrokBuildConfig` / 后端 `extract_model_config` 按 `[model."grok-4.5"]` 查找，读不到 `base_url` / `api_key`，表现为「漏掉 KEY 或 BASEURL」。

凭证本身在统一供应商记录里是完整的；问题只在 **Grok 子供应商 TOML 序列化**。

### 修复

抽取 `grok_config::build_provider_config_toml`，用 `Table::insert(profile, ...)` 把 profile 作为**单一键**插入（统一供应商同步与 deeplink 共用），生成：

```toml
[models]
default = "grok-4.5"

[model."grok-4.5"]
base_url = "..."
api_key = "..."
...
```

### 回归

- 重新快速导入 → 打开 Grok Build 供应商编辑/卡片，确认 Base URL 与 API Key 非空
- 或对已有统一供应商点「同步」后检查 Grok 子供应商

