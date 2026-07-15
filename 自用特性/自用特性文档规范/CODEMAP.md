# CODEMAP — 自用特性文档规范

## 文件清单

| 文件 | 角色 |
|---|---|
| `AGENTS.md` | 根目录强制约束与完成前检查清单 |
| `.gitignore` | 允许 `AGENTS.md` 被 Git 跟踪 |
| `自用特性/README.md` | 中文特性总索引与上游对齐流程 |
| `自用特性/<中文特性名>/README.md` | 单项产品契约、边界与回归清单 |
| `自用特性/<中文特性名>/CODEMAP.md` | 单项生产文件、测试、符号与验证命令 |
| `自用特性/发布说明-v3.17.1-自用版.md` | 既有自用版本发布说明 |
| `.github/workflows/release-personal-windows.yml` | Windows 自用发布说明引用新目录 |
| `.github/workflows/release-personal-macos.yml` | macOS 自用发布说明引用新目录 |

## 迁移映射原则

```text
FEATURE/<英文 slug>/README.md
  → 自用特性/<稳定中文名>/README.md

FEATURE/<英文 slug>/CODEMAP.md
  → 自用特性/<稳定中文名>/CODEMAP.md
```

Git 会在暂存或提交时依据内容相似度识别重命名；无需保留旧目录兼容副本。

## 检查命令

```powershell
Test-Path AGENTS.md
Test-Path FEATURE  # 预期 False
rg -n "FEATURE[/\\]|FEATURE\\b" 自用特性 .github
Get-ChildItem 自用特性 -Directory | ForEach-Object {
  Test-Path "$($_.FullName)/README.md"
  Test-Path "$($_.FullName)/CODEMAP.md"
}
```
