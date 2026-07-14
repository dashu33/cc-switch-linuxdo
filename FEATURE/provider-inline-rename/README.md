# 供应商名称行内编辑

> 文档状态：最后同步 2026-07-15 · 名称前铅笔按钮行内改名

## 目标

在每个供应商卡片的 **名称左侧** 增加铅笔标记按钮，无需打开完整编辑弹窗即可修改 `provider.name`。

## 入口与交互

```text
[拖拽柄] [图标] [✎] 供应商名称  [徽章…]
                 ↑
            编辑名称
```

| 操作 | 行为 |
|------|------|
| 点击铅笔 | 进入行内编辑，输入框自动聚焦 |
| Enter / 对勾 | 保存 |
| Esc / 叉 | 取消，恢复原名 |
| 空名称 | toast 错误，不保存 |
| 名称未变 | 静默退出编辑 |

## 显示条件（`canRename`）

同时满足：

- 列表传入了 `onUpdate`
- **不是** Hermes 只读供应商（`isHermesReadOnlyProvider`）
- **不是** OMO / OMO Slim 卡片

官方第三方自定义名一般可改；特殊只读项不显示铅笔。

## 持久化

```text
ProviderCard.saveRename
  → deepClone(provider); next.name = trimmed
  → onUpdate(next)
    → ProviderList / App.updateProvider
      → useUpdateProviderMutation
        → providersApi.update
```

成功 toast：`provider.renameSuccess`  
失败 toast：`provider.renameFailed`

## i18n（`provider.*`）

| Key | 中文默认 |
|-----|----------|
| `rename` | 编辑名称 |
| `renameAria` | 编辑供应商名称 |
| `renameEmpty` | 供应商名称不能为空 |
| `renameSuccess` | 名称已更新 |
| `renameFailed` | 名称更新失败 |

## 交互细节

- 编辑区 `stopPropagation` / `onPointerDown stopPropagation`，避免触发卡片切换、拖拽
- 输入框 `h-7`，保存中禁用并显示 spinner
- `provider.name` 外部更新且非编辑中时同步到本地 `renameValue`

## 热重载

纯前端：Vite HMR / `pnpm dev`。

## 回归清单

- [ ] 普通供应商名称前有铅笔
- [ ] 改名后列表刷新仍为新名
- [ ] 空名称被拒绝
- [ ] Esc 取消不写库
- [ ] Hermes 只读 / OMO 不显示铅笔
- [ ] 编辑时拖拽/切换卡片不被误触

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)
