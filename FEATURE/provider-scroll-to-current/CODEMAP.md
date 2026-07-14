# CODEMAP — provider-scroll-to-current

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/App.tsx` | 准星按钮、`providerListRef`、`handleScrollToCurrentProvider` 多拍重试 |
| `src/components/providers/ProviderList.tsx` | `ProviderListHandle.scrollToCurrentProvider`、搜索清空、祖先滚动 |
| `src/components/providers/ProviderCard.tsx` | `data-provider-id`、`scrollHighlight` 视觉 |
| `src/index.css` | `.show-scrollbar` 列表可见滚动条（配合长列表） |
| `src/i18n/locales/*` | `provider.scrollToCurrent*` |
| `FEATURE/provider-scroll-to-current/*` | 本文档 |

## 关键 API

```ts
// ProviderList.tsx
export type ProviderListHandle = {
  scrollToCurrentProvider: () => boolean;
};
```

`true` = 找到并开始滚动；`false` = 未找到（App 继续重试或 toast）。

## 调用链

```text
Toolbar Crosshair button (App.tsx)
  → handleScrollToCurrentProvider()
      → providerListRef.current?.scrollToCurrentProvider()
          → resolve target id (active / current)
          → query [data-provider-id="..."] within listRootRef
          → scroll all overflow ancestors
          → setScrollHighlightId(id) ~1.8s
```

## 检查命令

```powershell
rg -n "scrollToCurrentProvider|scrollHighlight|handleScrollToCurrent" src --glob "*.{ts,tsx}"
```

## 易错点

1. 只滚内层、不滚 `main` → 视觉上「没用」
2. 搜索过滤后 DOM 无节点 → 必须先清 search
3. Sortable 外壳无 `data-provider-id` → 高亮/滚动目标不稳定
