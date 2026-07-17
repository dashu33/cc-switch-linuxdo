use tauri::Manager;

/// 显示并前置主窗口（统一入口）。
///
/// Windows 上仅 `set_focus()` 经常无效：窗口已显示但被其它窗口盖住时，
/// 系统前台限制会吞掉焦点请求，表现就是「不在最顶就唤不回来，只能点任务栏」。
pub fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        restore_main_window(app, &window);
        return;
    }

    if crate::lightweight::is_lightweight_mode() {
        if let Err(e) = crate::lightweight::exit_lightweight_mode(app) {
            log::error!("退出轻量模式重建窗口失败: {e}");
        }
    }
}

/// 对已存在的主窗口执行显示 + 前置。
pub fn restore_main_window(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        let _ = window.set_skip_taskbar(false);
    }

    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();

    #[cfg(target_os = "windows")]
    {
        force_foreground_window(window);
    }

    #[cfg(target_os = "linux")]
    {
        crate::linux_fix::nudge_main_window(window.clone());
    }

    #[cfg(target_os = "macos")]
    {
        crate::tray::apply_tray_policy(app, true);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
}

#[cfg(target_os = "windows")]
fn force_foreground_window(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::Foundation::{FALSE, HWND, TRUE};
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsIconic,
        SetForegroundWindow, SetWindowPos, ShowWindow, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE,
        SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE, SW_SHOW,
    };

    let Ok(hwnd_tauri) = window.hwnd() else {
        log::warn!("Windows: 获取主窗口 HWND 失败，跳过强制前置");
        return;
    };

    // tauri 返回 windows::HWND，其内部指针可转成 windows-sys 的 HWND
    let hwnd = hwnd_tauri.0 as HWND;
    if hwnd.is_null() {
        return;
    }

    unsafe {
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
        ShowWindow(hwnd, SW_SHOW);

        // 先尝试常规前置
        if SetForegroundWindow(hwnd) != 0 {
            let _ = BringWindowToTop(hwnd);
            return;
        }

        // 线程输入附着：绕过「后台进程不能抢前台」限制
        let foreground = GetForegroundWindow();
        let target_thread = GetWindowThreadProcessId(hwnd, std::ptr::null_mut());
        let foreground_thread = if foreground.is_null() {
            0
        } else {
            GetWindowThreadProcessId(foreground, std::ptr::null_mut())
        };
        let current_thread = GetCurrentThreadId();

        let mut attached_fg = false;
        let mut attached_target = false;

        if foreground_thread != 0 && foreground_thread != current_thread {
            attached_fg = AttachThreadInput(current_thread, foreground_thread, TRUE) != 0;
        }
        if target_thread != 0
            && target_thread != current_thread
            && target_thread != foreground_thread
        {
            attached_target = AttachThreadInput(current_thread, target_thread, TRUE) != 0;
        }

        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);

        if attached_target {
            let _ = AttachThreadInput(current_thread, target_thread, FALSE);
        }
        if attached_fg {
            let _ = AttachThreadInput(current_thread, foreground_thread, FALSE);
        }

        // 仍失败时用短暂 TOPMOST 顶一下再取消，避免永久置顶
        if GetForegroundWindow() != hwnd {
            let _ = SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            );
            let _ = SetWindowPos(
                hwnd,
                HWND_NOTOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            );
            let _ = BringWindowToTop(hwnd);
            let _ = SetForegroundWindow(hwnd);
        }

        // 兜底：即使焦点抢失败，也保证 z-order 提到前面
        let _ = BringWindowToTop(hwnd);
        let _ = SetWindowPos(
            hwnd,
            HWND_NOTOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
    }

    log::debug!("Windows: 已尝试强制前置主窗口");
}
