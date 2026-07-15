# 一键拉取模型（批量供应商有效性探测）

> 维护目录：`自用特性/批量拉取模型探测/`

> 文档状态：最后同步 2026-07-16 · 持久状态图标 + 子菜单搜索定位 + 雷达探测图标

## 目标

Provider sticky 子菜单中的「一键拉取模型」按钮，对 **当前 app 下全部可探测供应商** 并发调用 `fetchModelsForConfig`（兼容 `/v1/models`）：

| 结果     | 子菜单按钮               | 卡片瞬时边框 | 右上角持久图标     | 含义                  |
| -------- | ------------------------ | ------------ | ------------------ | --------------------- |
| probing  | 琥珀 + spinner + `N✓ M✗` | 琥珀 + pulse | 保留上次结果       | 探测中不覆盖旧结论    |
| success  | 绿 + 汇总短文案          | **粗绿边**   | 绿色 `CircleCheck` | 拿到 ≥1 模型          |
| empty    | 橙                       | **粗橙边**   | 红色 `CircleX`     | 可连通但 0 模型       |
| failed   | 红                       | **粗红边**   | 红色 `CircleX`     | 请求失败              |
| skipped  | 灰弱（全跳过时）         | 不变         | 红色 `CircleX`     | 官方 / OAuth / 缺配置 |
| 从未探测 | 空闲                     | 不变         | 灰色 `CircleMinus` | 尚无手动结果          |

## 位置

```text
[排序方式]  |  [S3上传][S3下载] | [雷达：一键拉模型][放大镜：搜索定位][准星：定位当前]  [Provider 数量]
```

- 空闲：仅 Radar 图标（`size=icon`）
- 探测中 / 有结果：按钮展开为 `sm`，显示 `可用✓ 无模型○ 失败✗` 短文案
- 子菜单探测按钮与卡片边框约 **60s** 后复位 idle
- 右上角状态图标使用绝对定位，不参与卡片布局宽度，不挤压名称、徽章或操作按钮

> 快速定位准星按钮见独立文档：[../快速定位当前供应商/](../快速定位当前供应商/)

## 行为

1. 遍历当前 app 全部 `providers`
2. `resolveProviderModelsProbeTarget`：不可探测 → `skipped`
3. 可探测项 **并发 4** 路 `fetchModelsForConfig`
4. 边完成边写 `probeById[providerId]`，卡片实时变色
5. 结束 toast 汇总：可用 / 无模型 / 失败 / 跳过
6. 完成后一次性覆盖 `probeHistoryById` 并写入按应用区分的 localStorage
7. 60s 自动清空瞬时 `probeResult` + `probeById`，持久图标不清空
8. 切换 `appId` 只清瞬时状态，同时载入该应用上次完成的持久结果

## 状态传递

```text
useFetchCurrentProviderModels
  ├─ probeResult     → 子菜单探测按钮汇总色/文案
  ├─ probeById       → ProviderList
        → ProviderCard.modelsProbeStatus（边框）
        → CodexProviderQuickAdjust.modelsProbeStatus（「获取」色）
  └─ probeHistoryById → ProviderCard.modelsProbeHistoryStatus（持久图标）
```

持久化键：`cc-switch-models-probe-history:v1:<appId>`。仅保存 provider ID、终态、时间、模型数和跳过原因，不保存 URL、API Key 等凭证。新一轮探测进行中保留旧图标，整批结束后才替换。

## 搜索并定位

- 子菜单独立放大镜按钮调用 `ProviderListHandle.openSearch()`。
- 输入名称、备注或网址后按 Enter：名称完全匹配优先，否则定位第一个匹配项。
- 定位复用 `scrollToProvider` 的嵌套滚动、二次校正与 1.8 秒高亮逻辑。
- 定位完成后关闭搜索并恢复完整列表。

### 优先级

- **卡片手动「获取」** 本地 `fetchStatus` 在请求中优先
- 批量结果通过 `useEffect` 同步进 `fetchStatus`（idle/skipped 不覆盖）

## 跳过规则

| 类型                             | status                 |
| -------------------------------- | ---------------------- |
| 无供应商列表                     | toast，不进入 probing  |
| `category === "official"`        | skipped                |
| `github_copilot` / `codex_oauth` | skipped                |
| 缺 baseUrl 与 apiKey             | skipped                |
| 仅缺其一                         | skipped（reason 区分） |

## 凭证解析

`src/utils/providerModelsProbe.ts` 复用 `extractPortableCredentials`：

- baseUrl / apiKey
- 透传 `meta.isFullUrl`、`meta.customUserAgent`

## i18n（`provider.*`）

| Key                                                          | 用途                        |
| ------------------------------------------------------------ | --------------------------- |
| `fetchModelsProbe`                                           | 按钮 aria / 默认 title      |
| `fetchModelsProbeRunning` / `RunningShort`                   | 进行中                      |
| `fetchModelsProbeDoneShort`                                  | 完成后短文案                |
| `fetchModelsProbeButtonSuccess/Empty/Failed`                 | title 详情                  |
| `fetchModelsBatchDone` / `BatchDoneHint`                     | 结束 toast                  |
| `fetchModelsAllSkipped`                                      | 全跳过                      |
| `fetchModelsNoProviders`                                     | 空列表                      |
| `modelsProbeAvailable/Unavailable/NotChecked`                | 持久图标 title / aria-label |
| `searchAndLocate`                                            | 子菜单放大镜按钮            |
| 另有历史 `fetchModelsNoCurrent` 等（单测路径遗留文案可保留） |

## 热重载

纯前端：Vite HMR / `pnpm dev`。

## 回归清单

- [ ] 点雷达按钮 → 多卡同时变琥珀 → 逐个变绿/橙/红
- [ ] 子菜单探测按钮出现 `3✓ 1○ 2✗` 类短文案
- [ ] Codex 卡「获取」按钮同步变色
- [ ] 官方 / OAuth 卡不变色（skipped）
- [ ] 结束 toast 数字与卡片一致
- [ ] ~60s 后边框复位，右上角绿勾/红叉仍保留
- [ ] 重启或切 app 后各应用恢复自己的上次图标，不串色
- [ ] 下一次手动批量拉取完成后，旧图标被新结果整体替换
- [ ] 状态图标绝对定位，不挤压后续 UI
- [ ] 点击放大镜、输入并按 Enter 后直接滚动高亮目标 Provider
- [ ] 与单卡手动「获取」共用 `fetchModelsForConfig`

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)
- Codex 快速调整：[../Codex供应商快速调整/](../Codex供应商快速调整/)
- 快速定位：[../快速定位当前供应商/](../快速定位当前供应商/)
