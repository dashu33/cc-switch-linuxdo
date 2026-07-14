# CODEMAP — provider-fetch-models-probe

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/hooks/useFetchCurrentProviderModels.ts` | **批量探测**核心：`probeById`、并发 4、汇总 `probeResult`、60s 复位 |
| `src/utils/providerModelsProbe.ts` | `resolveProviderModelsProbeTarget` 解析/跳过 |
| `src/lib/api/model-fetch.ts` | `fetchModelsForConfig` / `showFetchModelsError` |
| `src/utils/copyProviderToApp.ts` | `extractPortableCredentials`（凭证抽取） |
| `src/App.tsx` | 工具栏按钮 UI、解构 `probeById`、传列表 |
| `src/components/providers/ProviderList.tsx` | `modelsProbeById[id].status` → 每卡 |
| `src/components/providers/ProviderCard.tsx` | 粗边框 / 渐变；`effectiveProbeStatus`（skipped→idle） |
| `src/components/providers/CodexProviderQuickAdjust.tsx` | 同步批量结果 → 「获取」按钮色 |
| `src/i18n/locales/*.json` | `provider.fetchModels*` |
| `FEATURE/provider-fetch-models-probe/*` | 本文档 |

## 关键类型

```ts
type ModelsProbeStatus =
  | "idle" | "probing" | "success" | "empty" | "failed" | "skipped";

interface ModelsProbeEntry {
  status: ModelsProbeStatus;
  at: number | null;
  modelCount?: number;
  reason?: string;
}

interface ModelsProbeResult {
  status: ModelsProbeStatus;       // 顶部汇总
  providerId: string | null;     // 批量时多为 null
  at: number | null;
  modelCount?: number;             // 成功模型总数
  successCount?: number;
  emptyCount?: number;
  failedCount?: number;
  skippedCount?: number;
  totalCount?: number;
}

type ModelsProbeById = Record<string, ModelsProbeEntry>;
```

## Hook 导出

```ts
useFetchCurrentProviderModels(appId, providers, currentProviderId)
  → {
      isFetching,
      fetchCurrentProviderModels, // 点击入口（现为批量）
      probeResult,
      probeById,
    }
```

常量：`CONCURRENCY = 4`，`RESULT_TTL_MS = 60_000`。

## 数据流

```text
Toolbar button
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
```

## 汇总色规则（顶部按钮）

| 条件 | summary |
|------|---------|
| 无可探测 | `skipped` |
| 仅 success | `success` |
| 仅 empty | `empty` |
| 仅 failed | `failed` |
| 混合且有 success | `success`（偏绿，细节看卡） |
| 混合无 success 有 empty | `empty` |
| 否则 | `failed` |

## UI 接线检查

```powershell
rg -n "modelsProbeById|probeById|fetchCurrentProviderModels|ModelsProbeById" src --glob "*.{ts,tsx}"
```

期望：

- `App.tsx` 解构 `probeById: modelsProbeById` 并传 `ProviderList`
- `ProviderList` 用 `modelsProbeById[provider.id]?.status`
- `ProviderCard` `effectiveProbeStatus` 处理 skipped
- `CodexProviderQuickAdjust` 接收 `modelsProbeStatus`

## 回归清单

- [ ] 批量成功/失败/空列表边框正确
- [ ] 顶部短文案数字与 toast 一致
- [ ] 并发下计数无竞态（`results` Map + recount）
- [ ] 切换 app 清空
- [ ] 60s 复位
- [ ] 单卡手动获取仍可用且着色
