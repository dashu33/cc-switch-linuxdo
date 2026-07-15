# CODEMAP — 供应商排序与子菜单

## 文件清单

| 文件                                         | 角色                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `src/utils/providerSort.ts`                  | 排序模式类型、校验与四种纯排序函数                                        |
| `src/utils/providerSort.test.ts`             | 排序模式、回退与持久化值校验单测                                          |
| `src/App.tsx`                                | 组装 S3、批量探测、搜索、定位快捷操作并通过插槽传入列表                   |
| `src/components/providers/ProviderList.tsx`  | 子菜单、`toolbarActions` 操作区、模式持久化、显示顺序、稳定序号、拖拽开关 |
| `src/components/providers/ProviderCard.tsx`  | 卡片序号与非自定义模式的禁用手柄                                          |
| `tests/components/ProviderList.test.tsx`     | 组件顺序、序号、搜索、模式持久化与拖拽禁用                                |
| `src/i18n/locales/{zh,zh-TW,en,ja}.json`     | `provider.sort*`、数量、序号与拖拽提示文案                                |
| `src-tauri/src/database/dao/providers.rs`    | 插入时回填旧空顺序并原子追加；更新时保留排序元数据；Rust 测试             |
| `src/types.ts` / `src-tauri/src/provider.rs` | 既有 `createdAt`/`sortIndex` 数据模型，本特性不改字段                     |

## 关键符号

| 符号                          | 职责                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| `ProviderSortMode`            | `manual/newest/oldest/name` 联合类型                          |
| `sortProvidersByMode`         | 非 UI 的确定性排序入口                                        |
| `readProviderSortMode`        | 读取并校验按应用保存的模式                                    |
| `displayProviders`            | 当前模式下的完整显示列表                                      |
| `providerSequenceById`        | 完整列表的 `id -> index + 1` 映射                             |
| `toolbarActions`              | App 向 sticky Provider 子菜单注入列表上下文快捷操作的可选插槽 |
| `save_provider`               | SQLite 插入/更新统一持久化入口                                |
| `provider_append_order_tests` | 新增落底、旧空值回填、更新保留元数据测试                      |

## 数据流

```text
Provider API / 导入 / Deep Link
  → Database::save_provider
    → INSERT: legacy NULL sort_index 回填 → MAX + 1 → 新项
    → UPDATE: 保留既有 created_at / sort_index

ProviderList
  → useDragSort（自定义基础顺序）
  → sortProvidersByMode（最新 / 最早 / 名称）
  → providerSequenceById
  → 搜索过滤
  → ProviderCard(sequenceNumber, isDragDisabled)

App
  → providerToolbarActions（S3 / 探测 / 搜索 / 定位）
  → ProviderList.toolbarActions
  → sticky 子菜单右侧操作区（单行横向滚动）
```

## 检查命令

```powershell
rg -n "ProviderSortMode|displayProviders|sequenceNumber|provider_append_order_tests" src src-tauri tests
pnpm typecheck
pnpm test:unit -- src/utils/providerSort.test.ts tests/components/ProviderList.test.tsx
cd src-tauri
cargo test provider_append_order_tests --lib
```
