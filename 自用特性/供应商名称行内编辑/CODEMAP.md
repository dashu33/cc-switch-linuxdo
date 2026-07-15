# CODEMAP — 供应商名称行内编辑

> 维护目录：\`自用特性/供应商名称行内编辑/\`

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/components/providers/ProviderCard.tsx` | 铅笔按钮 + 行内 Input + 保存/取消逻辑 |
| `src/App.tsx` / `ProviderList.tsx` | 透传既有 `onUpdate`（无新 props） |
| `src/hooks/useProviderActions.ts` | `updateProvider` 保存链路 |
| `src/i18n/locales/zh.json` / `en.json` 等 | `provider.rename*` |
| `自用特性/供应商名称行内编辑/*` | 本文档 |

## 关键状态（ProviderCard）

| 符号 | 含义 |
|------|------|
| `isRenaming` | 是否行内编辑中 |
| `renameValue` | 输入框值 |
| `isSavingName` | 保存中 |
| `canRename` | `onUpdate && !isHermesReadOnly && !isAnyOmo` |

## 关键函数

| 函数 | 职责 |
|------|------|
| `startRename` | 进入编辑 |
| `cancelRename` | 退出并还原 |
| `saveRename` | trim → `onUpdate` → toast |

## 数据写入形状

```ts
const next = deepClone(provider) as Provider;
next.name = nextName;
await onUpdate(next);
```

仅改 `name` 字段，不动 `settingsConfig` / `meta`。

## UI 检查

```powershell
rg -n "canRename|startRename|renameValue|provider\.rename" src/components/providers/ProviderCard.tsx
```

## 与其它特性关系

- 不依赖探测 / 用量 / 快速调整
- 与完整 `EditProviderDialog` 并存：完整编辑仍可改名
