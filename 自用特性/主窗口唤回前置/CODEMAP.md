# CODEMAP：主窗口唤回前置

## 生产实现

| 路径 | 说明 |
|------|------|
| `src-tauri/src/window_focus.rs` | 统一 `show_main_window` / `restore_main_window`；Windows `force_foreground_window` |
| `src-tauri/src/lib.rs` | deeplink focus、single-instance、DB 恢复显示、macOS Reopen/Opened 改走统一入口；托盘 `DoubleClick`（Windows）打开主窗口 |
| `src-tauri/src/tray.rs` | 托盘菜单 `show_main` 改走统一入口 |
| `src-tauri/src/lightweight.rs` | 退出轻量模式后 `restore_main_window` |
| `src-tauri/Cargo.toml` | `windows-sys` 增加 `Win32_Foundation` / `Win32_System_Threading` / `Win32_UI_WindowsAndMessaging` |

## 关键符号

- `window_focus::show_main_window`
- `window_focus::restore_main_window`
- `force_foreground_window`（Windows only）
- `tray::handle_tray_menu_event` → `"show_main"`
- `linux_fix::nudge_main_window`（Linux 仍保留）

## 数据流

```text
托盘 show_main / 托盘左键 DoubleClick(Windows) / single_instance / deeplink focus / Reopen
  → window_focus::show_main_window
      → set_skip_taskbar(false) [Windows]
      → unminimize + show + set_focus
      → force_foreground_window [Windows]
      → linux nudge / macOS tray policy
```

## 易冲突点

- 上游若重写托盘 `show_main` 或 single-instance 回调，需重新接入 `window_focus`。
- Tauri 升级时 `window.hwnd()` / `windows::HWND` 内部字段布局变化需同步 `hwnd_tauri.0 as HWND`。
- 勿把 `force_foreground` 做成永久 `set_always_on_top(true)`。

## 验证命令

```powershell
cd src-tauri
cargo check
# 完整验证需本机运行：托盘唤起 + 被其它窗口遮挡场景
```
