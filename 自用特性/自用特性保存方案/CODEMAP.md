# CODEMAP — 自用特性保存方案

> 维护目录：`自用特性/自用特性保存方案/`

## 文件清单

| 文件 | 角色 |
|---|---|
| `AGENTS.md` | 根目录强制约束：四层真相源、文档/提交/patch 规则、完成前检查 |
| `自用特性/README.md` | 中文特性总索引、上游对齐与回退入口 |
| `自用特性/自用特性保存方案/README.md` | 本方案的产品契约与工作流 |
| `自用特性/自用特性保存方案/CODEMAP.md` | 本方案涉及文件与检查命令 |
| `自用特性/<中文特性名>/README.md` | 单项行为契约、边界与回归清单 |
| `自用特性/<中文特性名>/CODEMAP.md` | 单项生产文件、符号、易冲突点与验证命令 |
| `自用特性/发布说明-v3.17.1-自用版.md` | 既有自用版本发布说明 |
| `patches/` | 可选灾备目录；默认可不存在 |
| `.github/workflows/release-personal-windows.yml` | Windows 自用发布说明引用新目录 |
| `.github/workflows/release-personal-macos.yml` | macOS 自用发布说明引用新目录 |
| `.gitignore` | 允许 `AGENTS.md` 被 Git 跟踪 |

## 关键决策落点

| 决策 | 落点 |
|---|---|
| 行为真相 | 各特性 `README.md` |
| 定位真相 | 各特性 `CODEMAP.md` |
| 代码真相 | 生产路径（由 CODEMAP 引用） |
| 变更真相 | Git 提交；可选 `patches/*.patch` |
| 禁止双份实现 | `AGENTS.md` + 本方案 README |

## 历史迁移映射

```text
FEATURE/<英文 slug>/README.md
  → 自用特性/<稳定中文名>/README.md

FEATURE/<英文 slug>/CODEMAP.md
  → 自用特性/<稳定中文名>/CODEMAP.md

自用特性/自用特性文档规范/
  → 自用特性/自用特性保存方案/
```

Git 可依据内容相似度识别重命名；无需保留旧目录兼容副本。

## 建议提交与导出命令

```powershell
# 查看自用侧相对某上游基线的提交
git log --oneline <upstream-baseline>..HEAD

# 按主题检索自用提交
git log --oneline --grep="自用/" <upstream-baseline>..HEAD

# 可选：导出灾备 patch（非日常主路径）
git format-patch <upstream-baseline>..HEAD --output-directory patches
```

## 检查命令

```powershell
Test-Path AGENTS.md
Test-Path "自用特性/自用特性保存方案/README.md"
Test-Path "自用特性/自用特性保存方案/CODEMAP.md"
Test-Path FEATURE  # 预期 False
Test-Path "自用特性/自用特性文档规范"  # 预期 False

rg -n "FEATURE[/\\]|自用特性文档规范" 自用特性 AGENTS.md .github

Get-ChildItem 自用特性 -Directory | ForEach-Object {
  [pscustomobject]@{
    Name = $_.Name
    README = Test-Path (Join-Path $_.FullName "README.md")
    CODEMAP = Test-Path (Join-Path $_.FullName "CODEMAP.md")
  }
}

# 抽查：特性目录不应出现生产源码副本
Get-ChildItem 自用特性 -Recurse -File |
  Where-Object { $_.Extension -match '\.(ts|tsx|rs|js|jsx)$' } |
  Select-Object FullName
```

## 与其它特性关系

- 本方案约束所有自用特性目录的维护方式。
- 不改变任何业务特性的运行时行为。
- 业务特性的实现仍以各自 CODEMAP 指向的生产文件为准。
