# CODEMAP — 供应商列表滚动条

> 维护目录：\`自用特性/供应商列表滚动条/\`

## 文件清单

| 文件 | 角色 |
|------|------|
| `src/index.css` | `.show-scrollbar` 覆盖全局隐藏 |
| `src/App.tsx` | providers 视图高度链 + 列表容器 class |
| `自用特性/供应商列表滚动条/*` | 本文档 |

## 检查命令

```powershell
rg -n "show-scrollbar" src/index.css src/App.tsx
```

## 注意

- 必须用 unlayered 或更高优先级，避免被全局 `::-webkit-scrollbar { display:none }` 吃掉
- 不要把 `show-scrollbar` 全局默认打开，仅长列表容器使用
