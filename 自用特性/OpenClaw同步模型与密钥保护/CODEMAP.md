# CODEMAP — OpenClaw 同步模型与密钥保护

## 文件

| 文件 | 角色 |
|------|------|
| `src-tauri/src/provider.rs` | `to_openclaw_provider`：模型 grokbuild→codex→grok-4.5；`openclaw_api_from_meta_and_model` |
| `src-tauri/src/services/provider/live.rs` | `import_openclaw_providers_from_live` 保护合并；DB→live 写保护；脏 key 启发式 |
| `src-tauri/src/services/provider/mod.rs` | `switch_normal`：OpenClaw 写 is_current；`apply_openclaw_switch_defaults` |
| `src-tauri/src/openclaw_config.rs` | `set_default_model` / `get_provider` |
| `src/utils/copyProviderToApp.ts` | 默认模型 grok-4.5；Grok 系 api→openai-responses |

## 数据流

```text
NewAPI/Universal
  → to_openclaw_provider (model/api)
    → DB providers openclaw
      → write live (merge_openclaw_settings_for_live_write)
        → ~/.openclaw/openclaw.json

启动 import_openclaw_providers_from_live
  live → merge_openclaw_settings_prefer_good(DB, live) → DB

切换 OpenClaw 供应商
  → set_current_provider + is_current
  → write live
  → set_default_model(primary = id/models[0].id)
```

## 易冲突点

- 上游若改 additive「不写 is_current」注释，需保留 OpenClaw 例外
- 脏 key 启发式过严可能误伤短测试 key；测试用 key 请 ≥8 且无空格
- `meta.apiFormat` 显式 openai_chat 时会写 openai-completions（有意）
