# WebDAV/S3 同步：用量日聚合（Plan A）

> 文档状态：最后同步：同步 `usage_daily_rollups`；保留原始请求日志本地

## 目标

换机器 / 云同步后，**立刻能从供应商卡片与用量统计看到历史可用性与调用体量**，便于切换 provider。

选择 **方案 A**：

| 数据 | 是否同步 | 说明 |
|------|----------|------|
| `usage_daily_rollups` | **是** | 日聚合：请求数、成功率、token、成本、平均延迟等 |
| `proxy_request_logs` | 否 | 明细日志体积大；「最近调用」行内窗口仍仅本机 |
| `stream_check_logs` | 否 | 探测日志本机 |
| `provider_health` | 否 | 运行时可重建 |
| `proxy_live_backup` | 否 | 本机热备 |

## 导入策略（简单 A）

- **导出**：`export_sql_string_for_sync` 不再跳过 `usage_daily_rollups`
- **导入**：`usage_daily_rollups` **不在** `SYNC_PRESERVE_TABLES`  
  → 远端 rollup 快照进入本机；本机原先仅本地的 rollup **被远端覆盖**（适合新机为空 / 以云端为主）
- **仍保留本机**：`proxy_request_logs` / `stream_check_logs` / `proxy_live_backup`

> 不做双机 PK merge（`INSERT OR REPLACE` 取 max）— 后续有需要再加。

## 自动同步触发

**不**因 rollup 表写入触发 WebDAV/S3 自动上传（避免 churn）。

仍仅在配置类表变更时触发（`providers` / `settings` / MCP / prompts / skills / proxy_config 等）。  
rollup 数据随下一次配置同步「顺带」导出。

用户也可手动「立即同步」把当前 rollup 推到云端。

## 用户可见效果

1. 机器 A 有历史用量 → 同步到 WebDAV/S3  
2. 机器 B 拉配置 → 供应商列表卡片可显示总成功率 / 请求数 / tokens 等累计指标  
3. **近 5 分钟成功率**、**最近调用**仍依赖本机 `proxy_request_logs`，换机后需重新产生流量后才有

## 隐私与体积

- 日聚合不含完整 prompt/response，比明细日志安全得多、体积也小
- 仍含 `provider_id` / `model` / 成本聚合，仅应同步到自己的私有 WebDAV/S3

## 回归清单

- [ ] 导出 SQL for sync 含 `INSERT INTO usage_daily_rollups`
- [ ] 导入后远端 rollup 存在
- [ ] 导入后本机 `proxy_request_logs` 条数不变
- [ ] 导入后本机仅有的旧 rollup 被远端快照替换（简单 A）
- [ ] 自动同步不因单独写 rollup 触发（`should_trigger_for_table("usage_daily_rollups") == false`）
- [ ] 卡片用量 / 用量统计页在同步后能读到历史 rollup

## 单测

```powershell
cd D:\CCSWITCH\src-tauri
cargo test sync_import_preserves_local_only_tables -- --nocapture
```
