# CODEMAP · 个人更新源与主线

> 维护目录：`自用特性/个人更新源与主线/`

## 生产实现

| 路径 | 作用 |
|---|---|
| `src-tauri/tauri.conf.json` | updater endpoint → `dashu33/cc-switch-linuxdo/.../latest.json` |
| `src-tauri/src/commands/misc.rs` | `check_for_updates` 打开个人 releases/latest |
| `src/components/settings/AboutSection.tsx` | 关于页 GitHub / 发布说明链接 |
| `src/components/DatabaseUpgrade.tsx` | 数据库升级页下载链接 |
| `src-tauri/Cargo.toml` | repository 字段 |
| `.github/workflows/release-personal-windows.yml` | 自用 Windows 发布、latest.json、make_latest、版本戳 |
| `.github/workflows/release-personal-macos.yml` | 自用 macOS unsigned 发布、latest、版本戳 |

## 关键符号

- `plugins.updater.endpoints`
- `check_for_updates`
- `RELEASES_URL`
- `handleOpenReleaseNotes`
- `Stamp personal version from tag`
- `make_latest` / `--latest`

## 数据流

1. UI 检查更新 → Tauri updater 读 `tauri.conf.json` endpoint
2. endpoint → `https://github.com/dashu33/cc-switch-linuxdo/releases/latest/download/latest.json`
3. 便携版 / 失败回退 → `check_for_updates` 打开同一仓库 releases 页
4. personal tag push → personal workflow 构建并上传资产 + `latest.json`
5. GitHub 将该 personal release 标为 latest，供下次检查更新命中

## 易冲突点

- 上游若改回 `farion1231` 链接，需要重新指回个人仓库
- personal release 若重新设为 prerelease，`/releases/latest` 会失效
- 版本号若不按 tag 戳写，updater 可能认为无更新
- 不要把自用改动写进 `upstream-sync`

## 验证命令

```powershell
rg -n "dashu33/cc-switch-linuxdo|farion1231/cc-switch" src-tauri/tauri.conf.json src-tauri/src/commands/misc.rs src/components/settings/AboutSection.tsx src/components/DatabaseUpgrade.tsx src-tauri/Cargo.toml
git branch -vv
git rev-parse --abbrev-ref HEAD
```
