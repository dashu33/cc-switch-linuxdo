# 新建供应商默认上游格式：openai_chat

> 文档状态：最后同步 2026-07-15 · Chat Completions + 需开启路由

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

## 不强制覆盖（不改用户已选）

| 场景 | 行为 |
|------|------|
| 编辑已有供应商 | 不覆盖已有 `meta.apiFormat` |
| 卡片「上游格式」手动选择 | 用户值持久优先 |
| 官方 / OAuth / 专用鉴权供应商 | 不走该默认（通常无此 meta 或另有逻辑） |
| 非 NewAPI/custom_gateway 的统一预设 | `createUniversalProviderFromPreset` 不写默认 apiFormat |

## 与 wire_api 的关系（Codex）

- Codex 客户端侧 `wire_api` 仍常固定 **`responses`**
- **上游真实协议** 由 `meta.apiFormat` 驱动代理转换
- 因此默认 `openai_chat` **不等于** 把 `wire_api` 改成 chat

详见：[../codex-provider-quick-adjust/](../codex-provider-quick-adjust/)

## 用户可见影响

1. 快速导入 / 新建 NewAPI 后，Codex 卡片「上游格式」默认显示 **Chat Completions（需开启路由）**
2. 代理运行时需开启路由才能正确转换（与徽章「需要路由」一致）
3. 若上游实际是 Responses 原生，用户可一键改「Responses（原生）」

## 回归清单

- [ ] 快速导入 NewAPI → 同步到 Codex 后 `meta.apiFormat === "openai_chat"`
- [ ] 统一供应商选 NewAPI 新建 → 同上
- [ ] 手动改为 Responses 后刷新仍保持用户选择
- [ ] `wire_api` 未被改成 chat_completions（仍 responses）
- [ ] Claude 等目标若另有强制 anthropic（复制到应用），不与本默认冲突

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)
- 快速导入：[../newapi-quick-import/](../newapi-quick-import/)
- Codex 快速调整：[../codex-provider-quick-adjust/](../codex-provider-quick-adjust/)
