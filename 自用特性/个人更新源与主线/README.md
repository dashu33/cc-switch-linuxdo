# 个人更新源与主线

> 维护目录：`自用特性/个人更新源与主线/`

## 目标与范围

把本分叉的检查更新、发布与日常开发统一到个人仓库与自用主线：

- 仓库：`dashu33/cc-switch`
- 自用主线：`main`
- 上游镜像线：`upstream-sync`（跟踪 `farion1231/cc-switch`）
- 检查更新：只看 `dashu33/cc-switch` 的 GitHub Releases / `latest.json`

## 用户行为

1. 设置 → 关于 → 检查更新：拉取个人仓库 `releases/latest` 的 `latest.json`。
2. 便携版或更新失败回退：打开 `https://github.com/dashu33/cc-switch/releases/latest`。
3. 关于页 GitHub / 发布说明链接：指向 `dashu33/cc-switch`，不再指向上游作者仓库。
4. 日常开发与 personal 出包：默认在 `main` 上完成。

## 关键决策

1. **一个分叉**：只保留 `dashu33/cc-switch` 作为个人分叉。
2. **一条自用主线**：`main` 是产品线，不再把自用长期挂在 `codex/*`。
3. **一条上游镜像线**：`upstream-sync` 保持接近作者 `main`，不写自用功能。
4. **更新看 Release，不看分支名**：应用只消费 `/releases/latest`；分支只决定“打 tag 时包含哪些提交”。
5. **personal release 作为 latest**：自用 tag `v*-personal*` 发布时设为 latest，确保 `/releases/latest` 能命中自用包。
6. **发布时戳版本**：CI 用 tag 回写 `package.json` / `tauri.conf.json` / `Cargo.toml`，避免 `3.17.1` 与 `3.17.1-personal.x` 无法比较。

## 非目标

- 不把作者上游仓库当更新源。
- 不要求应用内按 branch 名检查更新。
- 不默认触发带 Apple 签名的全量 `release.yml`。

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

- [ ] `tauri.conf.json` updater endpoint 指向 `dashu33/cc-switch`
- [ ] 关于页 / 数据库升级页 / `check_for_updates` 回退链接指向个人仓库
- [ ] personal Windows release 生成 `latest.json` 且 release 为 latest
- [ ] 默认开发与发布主线为 `main`
- [ ] 存在 `upstream-sync` 作为作者镜像
- [ ] 旧自用分支已删除或标注退役

## 回归清单

1. 打开关于页，确认 GitHub 链接是 `dashu33/cc-switch`
2. 点击检查更新：请求个人仓库 latest，不请求作者仓库
3. 打 personal tag 后，Release 页可作为 `/releases/latest`
4. 本机 `main` 可继续开发与发布
