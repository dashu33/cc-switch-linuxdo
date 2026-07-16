# CODEMAP — 供应商排序与子菜单

## 文件清单

| 文件 | 角色 |
|---|---|
| `src/utils/providerSort.ts` | 排序维度/方向、旧模式迁移、纯排序函数 |
| `src/utils/providerSort.test.ts` | 维度+方向、可用性、最近使用、迁移单测 |
| `src/components/providers/ProviderList.tsx` | 排序 UI、localStorage、displayProviders |
| `src/hooks/useDragSort.ts` | 自定义顺序拖拽与 sortIndex 写回 |
| `src/App.tsx` | 新建/复制/NewAPI 后 `scheduleAutoProbeProviders` |
| `src/hooks/useFetchCurrentProviderModels.ts` | 可用性数据源（探测历史/实时） |
| `src/lib/query/usage.ts` / `src/types/usage.ts` | 最近使用数据源 `ProviderStats.lastUsedAt` |
| `src/i18n/locales/{zh,zh-TW,en,ja}.json` | `provider.sortKey*` / `sortDirection*` |
| `src-tauri/src/database/dao/providers.rs` | 插入回填旧空顺序并原子追加 |

## 关键符号

| 符号 | 职责 |
|---|---|
| `sortProvidersByKey` | 主排序入口（manual/created/recent/availability/name） |
| `sortProvidersByMode` | 旧 API 兼容包装 |
| `migrateLegacyProviderSortMode` | newest/oldest 等旧值迁移 |
| `selectSortKey` / `toggleSortDirection` | UI 切换维度与方向 |
| `recentSortById` | 从用量统计构造最近使用映射 |

## 数据流

```text
localStorage key+direction
  → ProviderList.sortKey / sortDirection
  → sortProvidersByKey
       ├ manual: sortIndex
       ├ created: provider.createdAt
       ├ recent: ProviderStats.lastUsedAt
       ├ availability: modelsProbeById / modelsProbeHistoryById
       └ name: provider.name
  → displayProviders → 序号 / 卡片列表
```

## 验证

```powershell
pnpm exec vitest run src/utils/providerSort.test.ts
rg -n "sortKey|sortDirection|sortProvidersByKey|recent" src/components/providers/ProviderList.tsx src/utils/providerSort.ts
```

## UI 细节

- 子菜单最前不显示「排序」文案，排序气泡直接开头。
- 无独立升/降序按钮；方向通过再次点击当前维度切换，并在按钮上显示 ↑/↓。
- 右侧 S3 / 一键拉取 / 搜索 / 定位 / 筛选 控件高度与排序气泡对齐为 `h-9`。
