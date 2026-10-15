# 新建供应商默认上游格式：openai_chat

> 维护目录：\`自用特性/新建供应商默认openai_chat/\`

> 文档状态：最后同步 2026-10-15 · Codex 默认 openai_chat；Claude / Claude Desktop 不继承该默认，落 anthropic

## 目标

新建 **NewAPI / 自定义网关类** 供应商时，默认上游格式为：

```text
meta.apiFormat = "openai_chat"
```

即 **OpenAI Chat Completions**，走本地路由转换；**不是** Responses 原生。

产品文案侧对应：「Chat Completions（需开启路由）」。

## 为什么

多数第三方 / 聚合网关（含 NewAPI）提供的是 Chat Completions 兼容接口。  
默认 `openai_chat` 可减少「导入后还要手改上游格式」的步骤；用户仍可在卡片快速调整或编辑弹窗中改回 `openai_responses` / `anthropic`。

## 适用范围（会默认）

| 路径 | 默认行为 |
|------|----------|
| 统一供应商 NewAPI 预设创建 | `meta.apiFormat = openai_chat` |
| 统一供应商 custom_gateway 预设创建 | 同上 |
| 快速导入 NewAPI | 创建后再次强制写入 `openai_chat`（双保险） |
| 统一供应商同步到 Codex（`to_codex_provider`） | 若 meta 无 `apiFormat`，补 `openai_chat` |

**仅限 Codex。** 该默认值不会带到 Claude / Claude Desktop，见下节。

## Claude 侧不继承该默认（2026-10-15 起）

`openai_chat` 是给 Codex 准备的（Codex 客户端说 Responses，代理再转 Chat）。Claude 与 NewAPI 网关之间通常直接说 Anthropic Messages，把这个默认继承过去会让 Claude 卡片错误显示「Chat Completions（需开启路由）」。

| 路径 | 行为 |
|------|------|
| 统一供应商同步到 Claude（`to_claude_provider`） | `apiFormat` 为空**或为 `openai_chat`** 时一律写 `anthropic`；其它显式值（`openai_responses` / `gemini_native`）原样保留 |
| 统一供应商同步到 Claude Desktop（`to_claude_desktop_provider`） | 同上 |
| 重新同步统一供应商 | 若子供应商的 `meta.apiFormatExplicit === true`（用户手动改过），保留该值与标记，不被覆盖 |

`apiFormatExplicit` 在两个入口置位：

- 卡片「上游格式」下拉 → `applyProviderApiFormat`
- Claude 编辑弹窗的「API 格式」下拉（用户点过才置位）

由此得到的行为：

- 新建 / 重新同步后，Claude 卡片默认显示「Anthropic Messages（原生）」
- 历史遗留的 Claude 子供应商（被写成 `openai_chat` 且未被手动改过）下次同步会**自动纠正**为 `anthropic`
- 用户在 Claude 卡片或弹窗里手动选过 `openai_chat` / `openai_responses` / `gemini_native` 的，重新同步统一供应商时**保持不动**

## 不强制覆盖（不改用户已选）

| 场景 | 行为 |
|------|------|
| 编辑已有供应商 | 不覆盖已有 `meta.apiFormat` |
| 卡片「上游格式」手动选择 | 用户值持久优先，并写入 `apiFormatExplicit` |
| 官方 / OAuth / 专用鉴权供应商 | 不走该默认（通常无此 meta 或另有逻辑） |
| 非 NewAPI/custom_gateway 的统一预设 | `createUniversalProviderFromPreset` 不写默认 apiFormat |

## 与 wire_api 的关系（Codex）

- Codex 客户端侧 `wire_api` 仍常固定 **`responses`**
- **上游真实协议** 由 `meta.apiFormat` 驱动代理转换
- 因此默认 `openai_chat` **不等于** 把 `wire_api` 改成 chat

详见：[../Codex供应商快速调整/](../Codex供应商快速调整/)

## 用户可见影响

1. 快速导入 / 新建 NewAPI 后，Codex 卡片「上游格式」默认显示 **Chat Completions（需开启路由）**
2. 代理运行时需开启路由才能正确转换（与徽章「需要路由」一致）
3. 若上游实际是 Responses 原生，用户可一键改「Responses（原生）」
4. 同一个统一供应商同步出来的 **Claude 卡片**默认显示「Anthropic Messages（原生）」，不是 Chat Completions

## 回归清单

- [ ] 快速导入 NewAPI → 同步到 Codex 后 `meta.apiFormat === "openai_chat"`
- [ ] 统一供应商选 NewAPI 新建 → 同上
- [ ] 手动改为 Responses 后刷新仍保持用户选择
- [ ] `wire_api` 未被改成 chat_completions（仍 responses）
- [ ] 同一统一供应商同步出的 Claude 子供应商 `meta.apiFormat === "anthropic"`
- [ ] 在 Claude 卡片手动改成 `openai_chat` 后重新同步统一供应商，仍是 `openai_chat`（`apiFormatExplicit === true`）
- [ ] 历史遗留的 Claude 子供应商（`openai_chat` 且无 `apiFormatExplicit`）重新同步后纠正为 `anthropic`
- [ ] `to_claude_provider` 对显式的 `openai_responses` / `gemini_native` 不做改写

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)
- 快速导入：[../NewAPI快速导入/](../NewAPI快速导入/)
- Codex 快速调整：[../Codex供应商快速调整/](../Codex供应商快速调整/)
