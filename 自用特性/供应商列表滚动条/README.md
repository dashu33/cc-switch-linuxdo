# 供应商列表可见滚动条

> 维护目录：\`自用特性/供应商列表滚动条/\`

> 文档状态：最后同步 2026-07-15

## 目标

供应商列表很长时，提供 **可见的纵向滚动条**，方便手动拖动；与「快速定位」互补。

## 问题背景

全局样式曾统一隐藏滚动条（美观优先）。provider 页高度链为：

```text
App main (overflow-hidden on providers view)
  → 列表容器 flex-1 overflow-y-auto.show-scrollbar
```

若仅靠 `@layer` 内规则，会被后续全局 hide 规则盖掉，用户「看不到滚动条」。

## 方案

在 `src/index.css` 增加 **非 layer** 的 `.show-scrollbar`，并用 `!important` 覆盖 hide：

- WebKit：显示 thin scrollbar 轨道/滑块
- Firefox：`scrollbar-width: thin`

provider 列表滚动容器 class 带 `show-scrollbar`。

## 热重载

纯 CSS：Vite HMR。

## 回归清单

- [ ] Codex / Claude 等供应商列表右侧可见细滚动条
- [ ] 可拖动滚动条浏览
- [ ] 其它页面若未加 class 仍可保持隐藏策略

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)
- 快速定位：[../快速定位当前供应商/](../快速定位当前供应商/)
