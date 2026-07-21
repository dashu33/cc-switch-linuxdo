# 个人更新源与主线

> 维护目录：`自用特性/个人更新源与主线/`

## 目标与范围

把本分叉的检查更新、发布与日常开发统一到个人仓库与自用主线：

- 仓库：`dashu33/cc-switch-linuxdo`
- 自用主线：`main`
- 上游镜像线：`upstream-sync`（跟踪 `farion1231/cc-switch`）
- 检查更新：只看 `dashu33/cc-switch-linuxdo` 的 GitHub Releases / `latest.json`

## 用户行为

### 检查更新（关于页）

1. 设置 → 关于 → **检查更新**：拉取个人仓库 `releases/latest` 的 `latest.json`。
2. **无更新**：提示「已是最新」。
3. **有更新**：弹出确认框「是否立即下载并替换当前安装？」。
4. 用户选 **是**：
   - **安装版**：调用 `install_update_and_restart` → 下载 MSI → 安装替换 → 重启应用。
   - **便携版**：无法自动替换 exe，改为打开 releases 下载页，并提示需手动下载。
5. 用户选 **暂不更新**：关闭弹窗，按钮仍可显示「更新到 vX」。
6. 若安装失败：toast 报错，并回退打开 releases 页。

### 其它入口

- 便携版或更新失败回退：打开 `https://github.com/dashu33/cc-switch-linuxdo/releases/latest`。
- 关于页 GitHub / 发布说明链接：指向 `dashu33/cc-switch-linuxdo`，不再指向上游作者仓库。
- 启动时仍会后台静默检查更新（角标 / 按钮变「更新到 vX」）；**不会**自动下载，需用户点按钮并确认。
- 日常开发与 personal 出包：默认在 `main` 上完成。

## 关键决策

1. **一个分叉**：只保留 `dashu33/cc-switch-linuxdo` 作为个人分叉。
2. **一条自用主线**：`main` 是产品线，不再把自用长期挂在 `codex/*`。
3. **一条上游镜像线**：`upstream-sync` 保持接近作者 `main`，不写自用功能。
4. **更新看 Release，不看分支名**：应用只消费 `/releases/latest`；分支只决定“打 tag 时包含哪些提交”。
5. **personal release 作为 latest**：自用 tag `v*-personal*` 发布时设为 latest，确保 `/releases/latest` 能命中自用包。
6. **发布时戳版本（方案 A 日期）**：CI 用 tag 回写 package.json / tauri.conf.json / Cargo.toml，以及 latest.json 的 version：
   - 推荐：`v3.17.2-personal.20260721` → 应用与 manifest 均为 `3.17.2-20260721`
   - 兼容旧序号：`v3.17.2-personal.7` → `3.17.2-7`
   - tag 保留 `personal` 字样，避免误触全量 `release.yml`（匹配 `v*`）；应用内版本去掉 `personal`，只留数字日期，避免 WiX 拒绝非数字 prerelease。
7. **禁止裸版本当 personal 发布版（SemVer）**：`3.17.2-20260721` 是 pre-release，**小于** 正式版 `3.17.2`。personal 安装包 / 本机替换 / `latest.json` 必须始终是 `X.Y.Z-YYYYMMDD`（或旧 `X.Y.Z-N`），不要用裸 `X.Y.Z` 作为已发布 personal 版本，否则本机停在裸版后，检查更新不会把同号日期包当成“更新”。完整条文见根目录 `AGENTS.md` →「版本号约束」。
8. **先确认再装**：检查到更新后必须用户确认，再走下载+替换；避免误触立刻安装。
9. **安装版 vs 便携版**：自动替换依赖 Tauri updater + MSI/NSIS 安装器；便携 zip 只打开下载页。

## 非目标

- 不把作者上游仓库当更新源。
- 不要求应用内按 branch 名检查更新。
- 不默认触发带 Apple 签名的全量 `release.yml`。
- 不在后台自动下载/安装（启动静默检查仅改 UI 状态）。
- 便携版不尝试直接覆盖运行中的 `cc-switch.exe`（Windows 文件锁 + 无安装器签名链）。
- 不用裸 `X.Y.Z` 作为 personal 已发布 / 检查更新对照版本。

## 分支约定

| 分支 | 角色 |
|---|---|
| `main` | 自用主线：开发、发布、本机安装来源 |
| `upstream-sync` | 作者干净镜像：只同步 `upstream/main` |
| `codex/*` | 临时专题分支；做完并回 `main` 后删除 |

已退役：

- `codex/personal-provider-ux`（内容已并入后续自用线）
- `codex/provider-row-ui-filter`（升格为 `main` 后删除）

## 上游同步流程

1. `git fetch upstream`
2. 更新 `upstream-sync` 到 `upstream/main`
3. 把 `upstream-sync` 合入 / rebase 到 `main`
4. 按 `自用特性/` 逐项回归
5. 需要时打 `v*-personal*` 并完成本机替换

## 验收标准

- [ ] `tauri.conf.json` updater endpoint 指向 `dashu33/cc-switch-linuxdo`
- [ ] 关于页 / 数据库升级页 / `check_for_updates` 回退链接指向个人仓库
- [ ] personal Windows release 生成 `latest.json` 且 release 为 latest
- [ ] 日期 tag `v3.17.2-personal.20260721` stamp 后应用版本为 `3.17.2-20260721`（latest.json 同步）
- [ ] 旧序号 tag `v3.17.2-personal.N` 仍可 stamp 为 `3.17.2-N`
- [ ] personal 发布产物 / latest.json **不是**裸 `X.Y.Z`（见 `AGENTS.md` 版本号约束）
- [ ] 默认开发与发布主线为 `main`
- [ ] 存在 `upstream-sync` 作为作者镜像
- [ ] 旧自用分支已删除或标注退役
- [ ] 检查更新：无更新 → toast「已是最新」
- [ ] 检查更新：有更新 → 确认弹窗 → 是 → 安装版下载并替换重启
- [ ] 检查更新：有更新 → 确认弹窗 → 否 → 不下载
- [ ] 便携版有更新确认后打开下载页，不调用安装器替换

## 回归清单

1. 打开关于页，确认 GitHub 链接是 `dashu33/cc-switch-linuxdo`
2. 点击检查更新：请求个人仓库 latest，不请求作者仓库
3. 无更新时提示「已是最新」
4. 有更新时出现确认框；点「暂不更新」不开始下载
5. 安装版点「是，立即更新」：进入「更新中...」，随后安装并重启
6. 便携版点确认：打开 releases 页并提示手动下载
7. 打 `vX.Y.Z-personal.YYYYMMDD` 后，关于页版本显示 `X.Y.Z-YYYYMMDD`，Release 为 `/releases/latest`
8. 本机 `main` 可继续开发与发布
