# CODEMAP — Claude 模型映射批量设置

> 维护目录：\`自用特性/Claude模型映射批量设置/\`

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/components/providers/forms/ClaudeFormFields.tsx` | 唯一实现：拉取序号与作废、角色表、按角色落位、按钮渲染 |
| `src/components/providers/forms/shared/ModelInputWithFetch.tsx` | 各角色输入框的候选下拉；只消费传入的 `fetchedModels` |
| `src/lib/api/model-fetch.ts` | `fetchModelsForConfig` / `showFetchModelsError` / `FetchedModel` |
| `src/i18n/locales/{zh,en,ja,zh-TW}.json` | `providerForm.syncFetchedModels*` 四个键 |
| `src/utils/providerQuickAdjust.test.ts` | 相邻的卡片侧格式单测（本特性自身的验证以手工回归为主） |

## 关键符号（`ClaudeFormFields.tsx`）

| 符号 | 位置 | 说明 |
|------|------|------|
| `fetchModelsSeqRef` | 行 259 | 拉取请求序号；请求身份变化即自增 |
| 作废 effect | 行 261-265 | 依赖 `[baseUrl, isFullUrl, apiKey, customUserAgent]`，自增序号 + 清空列表 |
| `handleFetchModels` | 行 ~275 | 取号后在所有 then/catch 中比对序号，过期响应直接 return |
| `modelRoleRows` | 行 543 | 五个角色定义（sonnet/opus/fable/haiku/subagent），含 `modelField` / `displayNameField` / `supportsOneM` |
| `handleRoleModelChange` | 行 596 | 写模型字段 + 按需同步显示名称 + 处理 1M 标记 |
| `handleSyncFetchedModelsToRoles` | 行 619 | 关键词匹配 + 落位 + toast |
| 「同步拉取结果」按钮 | 行 ~875-895 | `fetchedModels.length > 0` 时渲染，位于「一键设置」左侧 |
| 「一键设置」按钮 | 行 ~896+ | 原有行为，未改动 |

## 数据流

```text
点击「获取模型列表」
  → handleFetchModels（取 seq）
  → fetchModelsForConfig(baseUrl, apiKey, isFullUrl, modelsUrl, customUserAgent)
  → 成功且 seq 未过期 → setFetchedModels(models) → toast
  → 按钮出现（fetchedModels.length > 0）

点击「同步拉取结果」
  → handleSyncFetchedModelsToRoles
  → fetchedIds = 去重后的 model.id（剥离 1M 标记）
  → 每个角色：subagent 取兜底模型，其余取首个 id 含 role 名的模型
  → handleRoleModelChange(row, match) → onModelChange(...) 顶层表单
```

`fetchedModels` 只在本组件内存在，不持久化。

## 易冲突点

- `modelRoleRows` 的角色 `role` 字段同时用于 i18n 标签、输入框 id 和关键词匹配；新增角色时三处都会受影响
- `handleRoleModelChange` 承担显示名称同步与 1M 标记，绕过它直接调 `onModelChange` 会漏掉这两项
- 作废 effect 的依赖数组必须覆盖全部请求身份字段，漏一个就会出现「换 X 后仍显示旧模型」
- `ClaudeFormFields.tsx` 同时服务 `claude` 与 `claude-desktop`；`isCopilotPreset` / `isCodexOauthPreset` 分支有各自的模型来源，不要与 `fetchedModels` 混用
- 同一文件也承载「一键设置」，两者共用标题行布局，改动时注意不要互相遮挡

## 验证命令

```bash
pnpm typecheck
pnpm vitest run src/utils/providerQuickAdjust.test.ts
```

手工回归：Claude 供应商 → 编辑 → 高级选项 → 模型映射 → 获取模型列表 → 同步拉取结果；
再改 API Key 后确认列表与按钮消失。
