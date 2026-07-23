# OpenClaw 同步模型与密钥保护

> 维护目录：`自用特性/OpenClaw同步模型与密钥保护/`

> 文档状态：2026-07-24 · 修复 NewAPI/跨端默认写死 gpt-5.5 + live↔DB 脏 key 覆盖 + 切换写默认模型

## 目标

修复 OpenClaw 供应商被 CC Switch 同步/导入时写错模型与密钥的问题：

1. 新建/统一供应商 → OpenClaw 默认模型优先 **Grok（grok-4.5）**，不再绑 Codex 的 gpt-5.5
2. 默认 API 协议：Grok 系 → `openai-responses`；否则 `openai-completions`
3. live ↔ DB 同步 **保护** 已修好的 key / 模型，不被脏 live 或错误模板刷回
4. 切换 OpenClaw 供应商时：写 `is_current` + `agents.defaults.model.primary = providerId/modelId`

## 用户行为

| 动作 | 期望 |
|------|------|
| NewAPI/统一供应商同步到 OpenClaw | 模型默认 grok-4.5（或 explicit grokbuild 模型）；api 按规则映射 |
| 从 Grok Build 跨应用复制到 OpenClaw | 带上 grok 模型；api 倾向 responses |
| 启动/导入 live | 若 live key 脏（ERR_*/含空格/占位）而 DB 有好 key → 保留 DB |
| 启动/导入 live | 若 live 主模型是 gpt-5.5 等陈旧默认而 DB 有 grok-4.5 → 保留 DB models |
| DB→live 写出 | 若 DB key 脏而 live 已有好 key → 不覆盖 live 好 key |
| 点击切换 OpenClaw 供应商 | DB/settings 记录 current；`agents.defaults.model.primary` 更新 |

## 非目标

- 不给 OpenClaw 做本地 proxy 接管（仍直连 baseUrl）
- 不自动删除不可用中转站（仍靠批量探测 + 用户清理）
- 不自动把历史已写入的全部 gpt-5.5 供应商批量改写（新写入与合并保护为主；历史需手改或再同步好配置）

## 脏 key 判定（启发式）

- 空 / 过短（<8）
- 占位：`sk-xxx` / `your-api-key` / `changeme` 等
- 含空格或 `ERR_` / `unreachable` / `forbidden` 等错误串

## 验收清单

- [ ] NewAPI 同步出的 OpenClaw 供应商模型为 grok-4.5（或 grokbuild 配置值），api 为 openai-responses
- [ ] 手改 live 为正确 g2a key + grok-4.5 后，启动导入不会被脏 live 反向刷坏（DB 侧保护）
- [ ] DB 有好配置、live 脏：写出 live 时保留/写回好配置
- [ ] 切换 OpenClaw 供应商后 `agents.defaults.model.primary` = `该id/主模型`
- [ ] `openclaw models status` / agent ping 可用（依赖真实上游）

## 验证命令

```powershell
cargo test -p cc-switch --lib provider::tests::universal_provider_builds_all_remaining_app_configs -- --nocapture
cargo test -p cc-switch --lib services::provider::live::tests::merge_openclaw -- --nocapture
cargo test -p cc-switch --lib services::provider::live::tests::openclaw_api_key -- --nocapture
```

## 相关

- 卡片快速调整：[../Codex供应商快速调整/](../Codex供应商快速调整/)
- 本地用量/最近调用：[../供应商卡片本地用量与可用性/](../供应商卡片本地用量与可用性/)
