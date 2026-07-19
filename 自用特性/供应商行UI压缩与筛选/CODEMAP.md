# 代码地图：供应商行 UI 压缩与筛选

## 生产文件

| 路径 | 职责 |
| --- | --- |
| `src/components/providers/ProviderCard.tsx` | 左侧窄 rail；Codex 行把 ProviderProxyUsageSummary 经 belowUpstream 塞进上游格式下方 |
| `src/components/providers/ProviderList.tsx` | sticky 筛选、过滤链路、传 props、导入后 onAutoProbe |
| `src/hooks/useFetchCurrentProviderModels.ts` | 探测历史、`modelIds`、`probeProviders` |
| `src/lib/api/model-fetch.ts` | 将拉取错误归类为不含敏感信息的稳定失败原因 |
| `src/hooks/useProviderActions.ts` | `deleteProviders` 按状态批量删除与单次缓存/托盘刷新 |
| `src/hooks/useDragSort.ts` | `moveProviderByOffset` |
| `src/hooks/useProviderActions.ts` | `addProvider` 返回创建结果 |
| `src/App.tsx` | `scheduleAutoProbeProviders`、新建/导入接线 |
| `src/utils/modelBrandIcon.ts` | 模型 id → brand 图标；旗舰优先的语义版本/档位/发布日期排序 |
| `src/utils/applyProviderModel.ts` | 点击 brand LOGO 写入默认模型 |
| `src/hooks/useDragSort.ts` | `pinProviderToTop` / `moveProviderByOffset` |
| `src/components/UsageFooter.tsx` | 用量查询小卡（已使用/剩余/USD，气泡外右上角） |
| `src/components/providers/ProviderProxyUsageSummary.tsx` | 本地成功率/延迟摘要（左侧信息区） |
| `src/i18n/locales/{zh,zh-TW,en,ja}.json` | 筛选 / 移动文案 |

## 关键符号

- `pickModelBrandIcons` / `inferModelBrandIcon` / `pickTopModelId`
- `ModelsProbeEntry.modelIds`
- `parseModelsProbeHistory`（兼容旧 v1）
- `probeProviders(ids, { quiet })`
- `ProviderCard.canReorder` / `onMoveUp` / `onMoveDown`
- `ProviderList.probeStatusFilter` / `modelFilter` / `searchTerm` 筛选输入
- `ProviderList.failureReasonFilter` / `failureReasonOptions` / `statusCleanupProviders`
- `modelsProbeReason`（List → Card → CodexProviderQuickAdjust）
- `classifyFetchModelsError` / `forgetProviderProbeResults` / `deleteProviders`
- `aggregatedFilterBrands` / `visibleFilterBrands` / `matchesModelBrandKeyword`
- `createPortal` 模型服务商下拉（body, z-200）
- `scheduleAutoProbeProviders`

## 数据流

```text
导入/新建成功
  → scheduleAutoProbeProviders(id?)
  → probeProviders | fetchCurrentProviderModels
  → probeById + probeHistoryById(+modelIds)
  → ProviderCard 边框 / ☑️❌ / 模型 LOGO

筛选
  displayProviders → search + status + failure reason + modelIds → filteredProviders

按状态清理（不含 success）
  probeStatusFilter (+ failureReasonFilter)
    → statusCleanupProviders → ConfirmDialog
    → deleteProviders → invalidate once → forgetProviderProbeResults
```

## 测试

| 路径 | 覆盖 |
| --- | --- |
| `tests/components/ProviderCardLayout.test.ts` | 窄 rail；Codex 摘要与图标并排（belowUpstream） |
| `tests/components/ProviderList.test.tsx` | 列表/序号既有行为 |
| `src/lib/api/model-fetch.test.ts` | 后端错误字符串到稳定失败原因分类 |
| `src/hooks/useFetchCurrentProviderModels.test.ts` | 历史解析 + modelIds |
| `src/utils/modelBrandIcon.test.ts` | brand 映射；Claude/GPT/Gemini/Grok 最新旗舰选择回归 |

## 验证命令

```powershell
cd D:\CCSWITCH
pnpm typecheck
pnpm test:unit -- src/lib/api/model-fetch.test.ts src/hooks/useFetchCurrentProviderModels.test.ts src/utils/modelBrandIcon.test.ts tests/components/ProviderCardLayout.test.ts tests/components/ProviderList.test.tsx
pnpm dev:renderer
```

## 备份

- 分支 `backup/716` / tag `backup-716` / commit `95d2f00`


## 布局顺序（左侧信息列）

```text
名称行
URL
CodexProviderQuickAdjust
  左列：上游格式
        ProviderProxyUsageSummary（belowUpstream，贴上游格式下）
  右列：模型 [下拉] [获取]
        模型 brand 图标（与下拉左缘对齐，6/行）
非 Codex：模型 LOGO 网格 → ProviderProxyUsageSummary
```
