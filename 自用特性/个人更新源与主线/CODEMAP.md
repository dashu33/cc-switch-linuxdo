# CODEMAP · 个人更新源与主线

> 维护目录：`自用特性/个人更新源与主线/`

## 生产实现

| 路径 | 作用 |
|---|---|
| `src-tauri/tauri.conf.json` | updater endpoint → `dashu33/cc-switch-linuxdo/.../latest.json` |
| `src-tauri/src/commands/misc.rs` | `check_for_updates` 打开个人 releases/latest（回退/便携） |
| `src-tauri/src/commands/settings.rs` | `install_update_and_restart` 下载+安装+重启；`check_app_update_available` |
| `src/lib/updater.ts` | 前端 `checkForUpdate`（Tauri updater `check`） |
| `src/lib/api/settings.ts` | `installUpdateAndRestart` / `checkUpdates` invoke 封装 |
| `src/contexts/UpdateContext.tsx` | 启动静默检查、hasUpdate 状态 |
| `src/components/settings/AboutSection.tsx` | 检查更新 UI：确认弹窗 → 下载替换；关于页链接 |
| `src/components/ConfirmDialog.tsx` | 通用确认框（更新确认复用） |
| `src/components/UpdateBadge.tsx` | 有更新角标，点进设置关于页 |
| `src/components/DatabaseUpgrade.tsx` | 数据库过新时的升级下载入口 |
| `src/i18n/locales/{zh,zh-TW,en,ja}.json` | `settings.updateConfirm*` 等文案 |
| `src-tauri/Cargo.toml` | repository 字段 |
| `.github/workflows/release-personal-windows.yml` | 自用 Windows 发布、latest.json、make_latest、版本戳 |
| `.github/workflows/release-personal-macos.yml` | 自用 macOS unsigned 发布、latest、版本戳 |

## 关键符号

- `plugins.updater.endpoints`
- `check_for_updates`
- `install_update_and_restart`
- `checkForUpdate` / `checkUpdate`
- `handleCheckUpdate` / `performInstallUpdate` / `showUpdateConfirm`
- `settings.updateConfirmTitle` / `updateConfirmMessage` / `updateConfirmYes`
- `RELEASES_URL`
- `handleOpenReleaseNotes`
- `Stamp personal version from tag`
- `make_latest` / `--latest`
- `update-download-progress`

## 数据流

### 手动检查更新（关于页）

1. 用户点「检查更新」→ `handleCheckUpdate`
2. 若尚无 hasUpdate：`checkUpdate()` → Tauri updater 读 endpoint
3. endpoint → `https://github.com/dashu33/cc-switch-linuxdo/releases/latest/download/latest.json`
4. 有新版本 → `showUpdateConfirm=true` → ConfirmDialog
5. 用户确认：
   - 安装版 → `settingsApi.installUpdateAndRestart()` → 后端 `install_update_and_restart`：check → download → install → restart
   - 便携版 → `settingsApi.checkUpdates()` 打开 releases 页
6. 安装失败 → toast + 打开 releases 回退页

### 启动静默检查

1. `UpdateProvider` 启动约 1s 后 `checkUpdate()`
2. 仅更新 `hasUpdate` / 角标 / 按钮文案，**不弹确认、不下载**

### 发布侧

1. personal tag push → personal workflow 构建并上传资产 + `latest.json`
2. GitHub 将该 personal release 标为 latest，供下次检查更新命中
3. `latest.json` platforms.`windows-x86_64` 指向 **NSIS Setup.exe** + signature（日期方案 A；旧序号时代曾用 MSI）

## 易冲突点

- 上游若改回 `farion1231` 链接，需要重新指回个人仓库
- personal release 若重新设为 prerelease，`/releases/latest` 会失效
- 版本号若不按 tag 戳写，updater 可能认为无更新
- 不要把自用改动写进 `upstream-sync`
- 关于页若恢复「有更新直接 install」，会绕过确认弹窗
- 便携版若误调 `install_update_and_restart`，可能因无 MSI 安装链路失败
- **SemVer 强制约束**（详见 `AGENTS.md`「版本号约束」与本特性 README 决策 7）：
  - `3.17.2`（正式） **>** `3.17.2-20260721`（预发布）
  - personal 已发布版本禁止裸 `X.Y.Z`；必须 `X.Y.Z-YYYYMMDD` 或兼容 `X.Y.Z-N`
  - 本机若是裸版，检查更新不会提示安装同号日期包
- MSI 的 prerelease 段必须 ≤65535：`20260721` 会直接让 `tauri build`（含 msi target）失败；personal Windows 必须 `--bundles nsis`
- 勿把 `personal` 字符串写进 app stamp（WiX 也不接受非数字标签）

## 验证命令

```powershell
# 更新源指向个人仓库
Select-String -Path src-tauri/tauri.conf.json,src-tauri/src/commands/misc.rs,src/components/settings/AboutSection.tsx,src/components/DatabaseUpgrade.tsx,src-tauri/Cargo.toml -Pattern "dashu33/cc-switch-linuxdo|farion1231/cc-switch"

# 确认弹窗与安装流程符号仍在
Select-String -Path src/components/settings/AboutSection.tsx -Pattern "showUpdateConfirm|performInstallUpdate|installUpdateAndRestart"

# i18n 键
Select-String -Path src/i18n/locales/*.json -Pattern "updateConfirm"

git branch -vv
git rev-parse --abbrev-ref HEAD
```

## latest.json 版本对齐（方案 A 日期）

| 项 | 值 |
|---|---|
| 推荐 tag | `v3.17.2-personal.20260721` |
| 应用 stamp / latest.json.version | `3.17.2-20260721` |
| Windows 安装器 | NSIS `*-Windows-Setup.exe`（**不用 MSI**，因日期 >65535） |
| 兼容旧 tag | `v3.17.2-personal.7` → `3.17.2-7` |
| 生成处 | `.github/workflows/release-personal-windows.yml` / `release-personal-macos.yml` → Stamp + Generate latest.json |
| 为何 tag 仍带 personal | 触发 `v*-personal*` 工作流，避免全量 `release.yml`（`v*`） |
| 为何 app 去掉 personal | 标签字符串非数字；日期数字可进版本字符串 |
| 易错 | latest.json.version 若仍写 `3.17.2-personal.20260721`，与本机 stamp `3.17.2-20260721` 比较会异常；或仍对日期版跑 MSI |
| 同一天多包 | 当前方案 A 一天一个日期；若同日再发需改方案 B（`.1`/`.2`）或等次日 |
