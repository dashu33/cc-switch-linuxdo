# 快速定位当前供应商

> 文档状态：最后同步 2026-07-15 · 嵌套滚动容器多拍校正

## 目标

在供应商列表顶部工具栏提供 **准星按钮**，一键滚动并高亮 **当前正在使用** 的供应商卡片。

## 位置

```text
[一键拉模型] [准星·定位当前] [AppSwitcher] [功能区] [添加] [快速导入] …
```

## 定位目标优先级

1. 代理接管 / 故障转移：优先 `activeProviderId`
2. 否则 `currentProviderId`
3. Hermes / OpenCode OMO 等有列表内特例时，仍以卡片 `data-provider-current` / id 匹配

## 行为

1. 点击准星 → `providerListRef.scrollToCurrentProvider()`
2. 若列表未挂载（loading / 切应用）：App 侧 50 / 120 / 250 / 400 / 700ms 多拍重试
3. 若当前供应商被搜索过滤：清空搜索后再多拍重试
4. 找到后：
   - 遍历 **全部 overflow 祖先**（`main` + 内层 `flex-1 overflow-y-auto`）逐层 `scrollTo`
   - 尽量把卡片滚到可视区居中
   - 约 **1.8s** `scrollHighlight` 描边脉冲
5. 仍找不到 → toast `provider.scrollToCurrentNotFound`

## 滚动实现要点

| 点 | 说明 |
|----|------|
| 查询范围 | `listRootRef` 内 `data-provider-id` |
| 标记 | Sortable 外壳与 `ProviderCard` 本体均有 `data-provider-id` |
| 祖先滚动 | 外层 instant、内层 smooth；smooth 后 **120ms** 二次校正 |
| 高亮 | `scrollHighlight` prop → ring/pulse class |

## 相邻：供应商列表滚动条

provider 页主滚动容器使用 `show-scrollbar`（见 `src/index.css`），覆盖全局隐藏滚动条规则，便于手动拖动长列表。  
该样式与本特性配合：定位滚动 + 用户可拖滚动条并存。

## i18n

| Key | 用途 |
|-----|------|
| `provider.scrollToCurrent` | 按钮 title |
| `provider.scrollToCurrentNotFound` | 找不到时的提示 |

## 热重载

纯前端：Vite HMR。

## 回归清单

- [ ] 列表较长时点击准星滚到当前卡并高亮
- [ ] 代理接管时定位到 `activeProviderId`
- [ ] 搜索过滤掉当前卡时能清搜索后定位
- [ ] loading / 切 app 后短暂延迟仍能定位
- [ ] 找不到时有 toast，不静默

## 相关文档

- 代码地图：[CODEMAP.md](./CODEMAP.md)
- 批量探测按钮相邻：[../provider-fetch-models-probe/](../provider-fetch-models-probe/)
