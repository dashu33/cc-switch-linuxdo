# FEATURE 文档索引

本目录记录 CC Switch 近期新增/落地的特性说明，方便后续维护、联调与 **主程序更新对齐**。

> 约定：每个特性目录至少包含 `README.md`（产品/交互）与 `CODEMAP.md`（代码落点）。  
> 行为以代码为准；文档与实现冲突时，先改实现或同步更新文档。  
> **每个功能单独目录**，避免多个 FEAT 揉在一篇里导致对齐困难。

## 特性列表

| 特性 | 目录 | 状态 | 一句话 | 需重编后端 |
|------|------|------|--------|------------|
| NewAPI 快速导入 | [newapi-quick-import](./newapi-quick-import/) | 已落地 | 剪贴板 URL+Key → 直接创建 NewAPI 统一供应商；半量等待；Base64 解密 | 否 |
| Codex 供应商快速调整 | [codex-provider-quick-adjust](./codex-provider-quick-adjust/) | 已落地 | 卡片就地改上游格式/模型；获取按钮绿橙红状态色 | 否 |
| 跨应用复制供应商 | [copy-provider-to-app](./copy-provider-to-app/) | 已落地 | 右键「复制到…」移植凭证（如 Codex→Claude） | 否 |
| 供应商卡片本地用量/可用性 | [provider-card-proxy-usage](./provider-card-proxy-usage/) | 已落地 | 近5分钟成功率、总成功率、用时/首字、行内最近调用+缓存 | **是**（部分 stats 字段）；UI/日志缓存纯前端 |
| 一键拉取模型（批量探测） | [provider-fetch-models-probe](./provider-fetch-models-probe/) | 已落地 | 顶部按钮批量 `/models`；卡边框+获取按钮着色；60s 复位 | 否 |
| 快速定位当前供应商 | [provider-scroll-to-current](./provider-scroll-to-current/) | 已落地 | 准星按钮滚动到使用中供应商并高亮 | 否 |
| 供应商列表可见滚动条 | [provider-list-scrollbar](./provider-list-scrollbar/) | 已落地 | provider 页显示细滚动条便于手动浏览 | 否 |
| 供应商名称行内编辑 | [provider-inline-rename](./provider-inline-rename/) | 已落地 | 名称前铅笔按钮，Enter 保存 / Esc 取消 | 否 |
| 新建默认 openai_chat | [provider-default-openai-chat](./provider-default-openai-chat/) | 已落地 | NewAPI/网关新建默认 Chat Completions（需路由） | 否（Rust 同步补全已有） |
| 同步用量日聚合 | [sync-usage-daily-rollups](./sync-usage-daily-rollups/) | 已落地 | WebDAV/S3 同步 `usage_daily_rollups`；明细日志仍本机 | **是** |

## 近期产品决策摘要

1. **快速导入**：直接创建，不打开 NewAPI 表单；支持半量等待（先 URL 再 Key 或反过来）。
2. **导入命名**：`M月D日 HH:mm {baseUrl}`；`websiteUrl = baseUrl`；默认 `meta.apiFormat = openai_chat`。
3. **Codex 快速调整**：写 `meta.apiFormat`，不改 `wire_api`；模型写 TOML 顶层 `model`；获取按钮按结果着色。
4. **跨应用复制**：只搬可移植凭证；Codex→Claude 强制 `apiFormat=anthropic` 并去尾部 `/v1`。
5. **卡片用量**：复用本地 `get_provider_stats` / 请求日志；**不是** `UsageFooter` 上游配额；最近调用行内窗口 + query 缓存防设置页返回卡顿。
6. **一键拉模型**：对 **全部** 可探测供应商批量并发（4），不再只测「当前」；每卡独立边框色；Codex「获取」同步。
7. **快速定位**：嵌套滚动祖先全滚 + 多拍重试 + 短暂高亮。
8. **行内改名**：铅笔标记；Hermes 只读 / OMO 不显示。
9. **同步用量日聚合（Plan A）**：WebDAV/S3 导出/导入包含 `usage_daily_rollups`；`proxy_request_logs` 仍本机；导入时远端 rollup 覆盖本机 rollup 快照；不因 rollup 写入触发自动同步。

## 主程序更新对齐建议

合并/升级主干时，按目录逐个 diff：

```text
1. 读 FEATURE/<feat>/README.md 确认产品契约
2. 读 CODEMAP.md 对照文件是否仍存在、符号是否改名
3. 用 CODEMAP 内 rg 检查命令验证接线
4. 跑 README 回归清单（或对应 vitest）
```

优先对齐顺序（依赖从底到上）：

1. `newapi-quick-import` / `provider-default-openai-chat` / `copy-provider-to-app`（工具函数与默认 meta）
2. `provider-card-proxy-usage`（若有 Rust 字段）
3. `sync-usage-daily-rollups`（同步 skip/preserve 常量）
4. `provider-fetch-models-probe` + `codex-provider-quick-adjust`（探测↔获取色）
5. `provider-scroll-to-current` + `provider-list-scrollbar`
6. `provider-inline-rename`

## 开发与验证

```powershell
# 若 pnpm 不在 PATH
$env:Path = "$env:APPDATA\npm;" + $env:Path
cd D:\CCSWITCH

# 纯前端
pnpm dev
# 或
pnpm dev:renderer

# 含 Rust（用量字段等）
pnpm tauri dev

# 相关单测
pnpm exec vitest run `
  src/utils/parseNewApiClipboard.test.ts `
  src/utils/providerConfigUtils.test.ts `
  src/utils/copyProviderToApp.test.ts

# 同步 rollup（Rust）
cd src-tauri
cargo test sync_import_preserves_local_only_tables -- --nocapture
```

## 目录结构

```text
FEATURE/
  README.md                          # 本索引
  newapi-quick-import/
  codex-provider-quick-adjust/
  copy-provider-to-app/
  provider-card-proxy-usage/
  provider-fetch-models-probe/
  provider-scroll-to-current/
  provider-list-scrollbar/
  provider-inline-rename/
```

## 约定

- 路径均为仓库相对路径
- i18n 覆盖 zh / en / zh-TW / ja（本批 rename / 批量探测 / quickFetch 状态文案已四语）
- **新增特性**：先落代码 → 再新增本目录下独立文件夹 → 更新本索引表
- 禁止把多个互不依赖的 FEAT 写进同一 README（交叉链接即可）
