# CODEMAP — 批量拉取模型探测

> 维护目录：`自用特性/批量拉取模型探测/`

## 文件清单

| 文件                                                    | 角色                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/hooks/useFetchCurrentProviderModels.ts`            | 批量探测核心、60s 瞬时态、按应用持久化 `probeHistoryById`                            |
| `src/hooks/useFetchCurrentProviderModels.test.ts`       | 持久化解析、终态过滤与按应用隔离测试                                                 |
| `src/utils/providerModelsProbe.ts`                      | `resolveProviderModelsProbeTarget` 解析/跳过                                         |
| `src/lib/api/model-fetch.ts`                            | `fetchModelsForConfig` / `showFetchModelsError`                                      |
| `src/utils/copyProviderToApp.ts`                        | `extractPortableCredentials`（凭证抽取）                                             |
| `src/App.tsx`                                           | 组装 Radar 探测、Search 搜索按钮并通过 `toolbarActions` 传入列表；两类探测状态传列表 |
| `src/components/providers/ProviderList.tsx`             | sticky 子菜单操作区；瞬时/持久状态按 ID 分发；通用滚动定位；搜索 Enter 定位          |
| `src/components/providers/ProviderCard.tsx`             | 瞬时边框；右上角绝对定位的 CircleCheck/CircleX/CircleMinus                           |
| `tests/components/ProviderList.test.tsx`                | 历史状态按 ID 接线、搜索打开与 Enter 定位高亮                                        |
| `src/components/providers/CodexProviderQuickAdjust.tsx` | 同步批量结果 → 「获取」按钮色                                                        |
| `src/i18n/locales/*.json`                               | `provider.fetchModels*`                                                              |
| `自用特性/批量拉取模型探测/*`                           | 本文档                                                                               |

## 关键类型

```ts
type ModelsProbeStatus =
  | "idle"
  | "probing"
  | "success"
  | "empty"
  | "failed"
  | "skipped";

interface ModelsProbeEntry {
  status: ModelsProbeStatus;
  at: number | null;
  modelCount?: number;
  reason?: string;
}

interface ModelsProbeResult {
  status: ModelsProbeStatus; // 子菜单按钮汇总
  providerId: string | null; // 批量时多为 null
  at: number | null;
  modelCount?: number; // 成功模型总数
  successCount?: number;
  emptyCount?: number;
  failedCount?: number;
  skippedCount?: number;
  totalCount?: number;
}

type ModelsProbeById = Record<string, ModelsProbeEntry>;
```

额外状态：`probeHistoryById: ModelsProbeById` 只包含 `success/empty/failed/skipped` 终态，localStorage 键为 `cc-switch-models-probe-history:v1:<appId>`。

## Hook 导出

```ts
useFetchCurrentProviderModels(appId, providers, currentProviderId)
  → {
      isFetching,
      fetchCurrentProviderModels, // 点击入口（现为批量）
      probeResult,
      probeById,
      probeHistoryById,
    }
```

常量：`CONCURRENCY = 4`，`RESULT_TTL_MS = 60_000`。

## 数据流

```text
Provider submenu button
  → fetchCurrentProviderModels()
      → 全表 initial: probing | skipped
      → Promise pool (4) probeOne()
          → setProbeById patch
          → setProbeResult progress counts
      → summary status + toast
  → App: modelsProbeById
  → ProviderList: status per id
  → ProviderCard border
  → CodexProviderQuickAdjust modelsProbeStatus

Batch complete
  → commitProbeHistory()
  → localStorage per app
  → ProviderCard top-right persistent status icon
```

## 汇总色规则（子菜单探测按钮）

| 条件                    | summary                     |
| ----------------------- | --------------------------- |
| 无可探测                | `skipped`                   |
| 仅 success              | `success`                   |
| 仅 empty                | `empty`                     |
| 仅 failed               | `failed`                    |
| 混合且有 success        | `success`（偏绿，细节看卡） |
| 混合无 success 有 empty | `empty`                     |
| 否则                    | `failed`                    |

## UI 接线检查

```powershell
rg -n "probeHistoryById|modelsProbeHistoryStatus|openSearch|scrollToProvider" src tests --glob "*.{ts,tsx}"
```

期望：

- `App.tsx` 解构 `probeById: modelsProbeById` 并传 `ProviderList`
- `ProviderList` 用 `modelsProbeById[provider.id]?.status`
- `ProviderCard` `effectiveProbeStatus` 处理 skipped
- `CodexProviderQuickAdjust` 接收 `modelsProbeStatus`

## 回归清单

- [ ] 批量成功/失败/空列表边框正确
- [ ] 子菜单短文案数字与 toast 一致
- [ ] 并发下计数无竞态（`results` Map + recount）
- [ ] 切换 app 清瞬时态并恢复对应持久结果
- [ ] 60s 只复位边框，持久图标不清除
- [ ] 新一轮完成后原子覆盖历史结果
- [ ] 搜索 Enter 复用通用定位并高亮
- [ ] 单卡手动获取仍可用且着色
