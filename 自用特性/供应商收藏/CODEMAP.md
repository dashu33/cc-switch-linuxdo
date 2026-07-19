# 代码地图：供应商收藏

## 生产文件

| 路径 | 职责 |
| --- | --- |
| `src/components/providers/ProviderCard.tsx` | 卡片左上角收藏按钮与可访问性状态 |
| `src/components/providers/ProviderList.tsx` | 收藏状态、切换动作、「仅收藏」快捷筛选及过滤链路 |
| `src/utils/providerFavorites.ts` | 按 `appId` 读取和持久化收藏 ID |
| `src/i18n/locales/{zh,zh-TW,en,ja}.json` | 收藏按钮和筛选文案 |

## 测试

| 路径 | 覆盖 |
| --- | --- |
| `src/utils/providerFavorites.test.ts` | 按应用隔离、去重及无效数据回退 |

## 关键符号

- `readProviderFavorites` / `writeProviderFavorites`
- `ProviderList.favoriteProviderIds` / `onlyFavorites`
- `toggleProviderFavorite`
- `ProviderCard.isFavorite` / `onToggleFavorite`

## 数据流

```text
卡片星标点击
  -> toggleProviderFavorite(provider.id)
  -> React Set 状态 + localStorage(appId)
  -> 卡片星标填充状态

仅收藏
  -> filteredProviders
  -> favoriteProviderIds.has(provider.id)
  -> 与其余筛选条件继续叠加
```

## 易冲突点

- `ProviderList.tsx` sticky 工具栏和 `filteredProviders` 过滤条件。
- `ProviderCard.tsx` 左上角绝对定位按钮与左侧序号 rail。
- 若未来收藏进入云同步或 Provider schema，应迁移现有 localStorage 数据，不能双写两套真相源。

## 验证命令

```powershell
cd D:\CCSWITCH
pnpm exec vitest run src/utils/providerFavorites.test.ts
pnpm exec tsc --noEmit
```
