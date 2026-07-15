# Provider 子菜单 S3 云同步快捷上传/下载

> 维护目录：\`自用特性/S3工具栏快捷同步/\`

> 文档状态：最后同步 2026-07-16 · Provider 子菜单一键 S3 上传/下载

## 目标

在供应商页 sticky 子菜单中，**「一键拉取模型」左侧**提供两个 S3 兼容存储快捷按钮：

| 按钮       | 形态                                    | 行为                                                  |
| ---------- | --------------------------------------- | ----------------------------------------------------- |
| 上传到云端 | 纯图标 `UploadCloud`（`size="icon"`）   | 拉取远端信息 → 确认 → `s3_sync_upload`                |
| 从云端下载 | 纯图标 `DownloadCloud`（`size="icon"`） | 拉取远端信息 → 兼容性校验 → 确认 → `s3_sync_download` |

复用设置页「云同步 → S3」已有后端与 API，**不新增** Rust 命令。

## UI 形态

- 两个**方形图标按钮**，与「定位当前供应商」准星按钮同类
- 默认**不显示**长文案；悬停 `title` / `aria-label` 为「上传到云端」「从云端下载」
- loading 时仅图标变转圈，**不会**拉成长条文字按钮

子菜单顺序（providers 视图）：

```text
[排序方式] | [S3上传] [S3下载] | [一键拉取模型] [搜索] [定位当前] [Provider 数量]
```

## 前置条件

1. **设置 → 云同步 → S3** 已填写 Bucket / Region / Access Key 等并保存
2. 已打开 **启用 S3 同步**（`s3Sync.enabled === true`）
3. 与 WebDAV 互斥（既有逻辑）

未配置 / 未启用时点击 toast：

- `settings.s3Sync.notConfigured`
- `settings.s3Sync.disabled`

## 交互流程

### 上传

```text
点击上传
  → ensureReady(配置+启用)
  → s3SyncFetchRemoteInfo()
      empty  → remoteInfo = null（首次上传）
      有数据 → 确认框展示设备名/时间
  → ConfirmDialog
  → s3SyncUpload()
  → toast 成功 + invalidateQueries
```

### 下载

```text
点击下载
  → ensureReady
  → s3SyncFetchRemoteInfo()
      empty        → toast 无远端数据
      !compatible  → toast 版本不兼容
      ok           → ConfirmDialog（覆盖本地警告）
  → s3SyncDownload()
  → toast 成功 + invalidateQueries
```

确认文案复用 i18n：`settings.s3Sync.confirmUpload.*` / `confirmDownload.*`。

## 同步内容

与设置页手动 S3 同步一致：数据库、技能包、manifest。
若已启用用量日聚合同步，见 [用量日聚合同步](../用量日聚合同步/)。

## 回归清单

- [ ] 未配置 / 未启用时 toast，不崩溃
- [ ] 启用后上传确认框；远端已有数据时显示设备信息
- [ ] 下载：无远端 / 不兼容分别提示
- [ ] 下载成功后列表刷新
- [ ] loading 时两按钮互斥禁用
- [ ] 两按钮位于 Provider 子菜单，列表为空时仍可用
- [ ] 设置页原有 S3 上传/下载仍可用
- [ ] 按钮始终为 icon，不变成长文字条

## 开发与验证

```powershell
cd D:\CCSWITCH
pnpm dev:renderer   # UI
pnpm tauri dev      # 真实 S3
rg -n "S3QuickSyncButtons|s3SyncUpload|s3SyncDownload" src --glob "*.{ts,tsx}"
```
