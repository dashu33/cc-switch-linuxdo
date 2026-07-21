# CODEMAP · 供应商卡片勾选模式

> 维护目录：`自用特性/供应商卡片勾选模式/`

## 生产实现

| 路径 | 作用 |
|---|---|
| `src/components/providers/ProviderCard.tsx` | 长按空白、勾选框 UI、选中高亮 |
| `src/components/providers/ProviderList.tsx` | selectionMode 状态、顶栏操作、确认删除、传 props |
| `src/App.tsx` | `onBulkDelete` → `deleteProviders`（既有） |
| `src/hooks/useProviderActions.ts` | `deleteProviders` 批量删除 |
| `src/i18n/locales/{zh,zh-TW,en,ja}.json` | `provider.selection*` 文案 |

## 关键符号

- `SELECTION_LONG_PRESS_MS`（480）
- `isInteractiveCardTarget`
- `selectionMode` / `selectedProviderIds` / `enterSelectionMode` / `exitSelectionMode`
- `onEnterSelectionMode` / `onSelectionChange` / `isSelected`
- `handleConfirmSelectionDelete`
- `onBulkDelete` / `deleteProviders`

## 数据流

1. 用户长按卡片空白 → `onEnterSelectionMode(id)` → `selectionMode=true`，选中集合含该 id  
2. 点空白/Checkbox → `toggleProviderSelected`  
3. 删除所选 → ConfirmDialog → `onBulkDelete(providers)` → `deleteProviders(ids)`  
4. 成功后 `exitSelectionMode`

## 易冲突点

- 卡片上新增可点击控件时，需能被 `isInteractiveCardTarget` 命中，或加 `data-no-long-press`
- 与 dnd-kit 拖拽：勾选模式禁用 sensors / drag handle
- 与收藏星标位置重叠：勾选模式隐藏星标、显示 Checkbox

## 验证命令

```powershell
Select-String -Path src/components/providers/ProviderCard.tsx,src/components/providers/ProviderList.tsx -Pattern "selectionMode|onEnterSelectionMode|SELECTION_LONG_PRESS"
Select-String -Path src/i18n/locales/*.json -Pattern "selectionModeTitle|deleteSelected"
pnpm exec tsc --noEmit -p tsconfig.json
```
