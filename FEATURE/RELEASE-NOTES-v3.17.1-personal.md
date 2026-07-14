# CC Switch v3.17.1-personal.1 更新说明（自用分支）

分支：`codex/personal-provider-ux`  
版本：`3.17.1`  
标签：`v3.17.1-personal.1`

## 会不会上传 FEATURE？

会。`FEATURE/` 整树已提交并推到 GitHub，本地丢了也能从仓库拉回。

## 更新内容

1. **NewAPI 快速导入**
   - 剪贴板读取 URL + API Key，直接创建 NewAPI 统一供应商
   - 支持半量等待（先只有 URL 或 Key 时继续监听剪贴板）
   - Base64 Key 自动解密；命名 `M月D日 HH:mm {baseUrl}`

2. **Codex 卡片快速调整**
   - 上游格式 / 模型就地修改
   - 获取模型按钮按结果绿/橙/红着色

3. **一键拉取模型（批量探测）**
   - 顶部按钮并发探测全部可测供应商
   - 成功/失败边框色 + 行内获取按钮同步着色

4. **供应商卡片本地用量 / 可用性**
   - 近5分钟成功率、总成功率、平均延迟/首字、最后使用
   - 行内最近调用窗口 + 查询缓存（避免设置页返回卡顿）

5. **列表体验**
   - 快速定位当前使用中的供应商
   - 可见滚动条
   - 名称前铅笔行内改名

6. **跨应用复制供应商**
   - 右键「复制到…」（如 Codex → Claude）

7. **默认格式**
   - NewAPI / 自定义网关新建默认 `meta.apiFormat = openai_chat`（Chat Completions 需路由）

8. **文档**
   - `FEATURE/` 每个功能独立 README + CODEMAP，方便主程序对齐

## 下载

GitHub Release（prerelease）：
- Windows MSI / Portable zip

## 说明

- 本标签走 **Personal Windows Release** workflow（仅 Windows x64）
- 完整多平台 `release.yml` 需要 Apple 签名等密钥，自用仓库暂不启用
- 签名私钥仅存 GitHub Actions Secret，**未**提交进仓库
