# CODEMAP — s3-toolbar-quick-sync

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/components/sync/S3QuickSyncButtons.tsx` | **新增**：工具栏上传/下载 + 确认框 + 状态机 |
| `src/App.tsx` | providers 工具栏挂载 `<S3QuickSyncButtons />`（在一键拉取模型左侧） |
| `src/lib/api/settings.ts` | 既有 `s3SyncUpload` / `s3SyncDownload` / `s3SyncFetchRemoteInfo` |
| `src/types.ts` | 既有 `S3SyncSettings` / `RemoteSnapshotInfo` |
| `src/components/settings/WebdavSyncSection.tsx` | 设置页完整 S3 UI（本特性不改逻辑） |
| `src/i18n/locales/*.json` | 复用 `settings.s3Sync.*` |
| `src-tauri/src/commands/s3_sync.rs` | 既有命令（require enabled） |
| `src-tauri/src/services/s3_sync.rs` | 既有 S3 实现 |
| `FEATURE/s3-toolbar-quick-sync/*` | 本文档 |

## 组件状态

```ts
type S3ActionState =
  | "idle"
  | "fetching_upload"
  | "fetching_download"
  | "uploading"
  | "downloading";

type S3ConfirmType = "upload" | "download" | null;
```

## 就绪判断

```ts
hasSavedConfig = Boolean(s3Config?.bucket?.trim() && s3Config?.accessKeyId?.trim())
isEnabled = s3Config?.enabled === true
```

## 数据流

```text
S3QuickSyncButtons
  useSettingsQuery() → settings.s3Sync
  settingsApi.s3SyncFetchRemoteInfo
  settingsApi.s3SyncUpload / s3SyncDownload
  ConfirmDialog
  queryClient.invalidateQueries()
```

## UI 接线检查

```powershell
rg -n "S3QuickSyncButtons" src/App.tsx
rg -n "export function S3QuickSyncButtons" src/components/sync
rg -n "s3_sync_upload|s3_sync_download|s3_sync_fetch_remote_info" src-tauri/src
```

## 与设置页关系

| 能力 | 设置页 | 工具栏 |
|------|--------|--------|
| 配置编辑 / 测试连接 | 是 | 否 |
| 手动上传/下载 | 是 | 是 |
| 远端详情 | 富文本 Dialog | ConfirmDialog 摘要 |
| 自动同步开关 | 是 | 否 |
