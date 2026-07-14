# 同步 usage_daily_rollups · 代码地图

## 变更点

| 文件 | 变更 |
|------|------|
| `src-tauri/src/database/backup.rs` | 从 `SYNC_SKIP_TABLES` / `SYNC_PRESERVE_TABLES` **移除** `usage_daily_rollups` |
| 同上 · `sync_import_preserves_local_only_tables` | 断言：导出含 rollup；导入取远端；本机 request/stream 日志仍保留 |
| `FEATURE/README.md` | 索引增加本特性 |

## 相关但未改

| 文件 | 原因 |
|------|------|
| `src-tauri/src/services/webdav_auto_sync.rs` | `should_trigger_for_table` 本就不含 rollup；保持 |
| `src-tauri/src/services/s3_auto_sync.rs` | 同上 |
| `src-tauri/src/services/usage_stats.rs` | 读 rollup 的统计查询无需改 |
| `src-tauri/src/database/dao/usage_rollup.rs` | 本地聚合写入逻辑不变 |

## 常量契约（Plan A 后）

```text
SYNC_SKIP_TABLES:
  proxy_request_logs
  stream_check_logs
  provider_health
  proxy_live_backup
  # usage_daily_rollups  ← 已移除，参与导出

SYNC_PRESERVE_TABLES:
  proxy_request_logs
  stream_check_logs
  proxy_live_backup
  # usage_daily_rollups  ← 已移除，导入用远端快照
```

## 调用链

```text
WebDAV/S3 上传
  └─ Database::export_sql_string_for_sync()
       └─ dump_sql(snapshot, SYNC_SKIP_TABLES)
            └─ 写出 usage_daily_rollups 行

WebDAV/S3 下载/导入
  └─ Database::import_sql_string_for_sync(sql)
       ├─ 临时库执行远端 SQL（含 rollups）
       ├─ restore_tables(local_snapshot, temp, SYNC_PRESERVE_TABLES)
       │    └─ 仅覆盖回本机 request/stream/live_backup
       └─ 替换主库 → 远端 rollups 保留
```

## 核对命令

```powershell
rg -n "SYNC_SKIP_TABLES|SYNC_PRESERVE_TABLES|usage_daily_rollups" src-tauri/src/database/backup.rs
rg -n "should_trigger_for_table" src-tauri/src/services/webdav_auto_sync.rs src-tauri/src/services/s3_auto_sync.rs
```

## 主程序对齐注意

若主干重新把 `usage_daily_rollups` 加回 skip/preserve，会回退本特性。  
合并时以本目录 README 产品契约为准。
