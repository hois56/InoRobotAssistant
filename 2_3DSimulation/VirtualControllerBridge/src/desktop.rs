use crate::{BRIDGE_PORT, PRODUCT, VERSION};
use std::{ffi::OsString, io, os::windows::ffi::OsStrExt, path::Path, ptr};
use windows_sys::Win32::{
    Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE, HWND, LPARAM, POINT, WPARAM},
    System::{
        LibraryLoader::GetModuleHandleW,
        Registry::{
            RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY_CURRENT_USER, KEY_SET_VALUE,
            REG_OPTION_NON_VOLATILE, REG_SZ,
        },
        Threading::CreateMutexW,
    },
    UI::{
        Shell::{Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NOTIFYICONDATAW},
        WindowsAndMessaging::{
            AppendMenuW, CreateDialogParamW, CreatePopupMenu, DestroyMenu, DestroyWindow,
            DispatchMessageW, GetCursorPos, GetMessageW, GetWindowTextW, IsDialogMessageW,
            IsWindow, LoadIconW, MessageBoxW, PostMessageW, PostQuitMessage, SendMessageW,
            SetDlgItemTextW, SetForegroundWindow, SetProcessDPIAware, SetWindowTextW, ShowWindow,
            TrackPopupMenu, TranslateMessage, IDOK, MB_ICONERROR, MF_SEPARATOR, MF_STRING, MSG,
            SIZE_MINIMIZED, SW_HIDE, SW_RESTORE, SW_SHOW, TPM_NONOTIFY, TPM_RETURNCMD,
            TPM_RIGHTBUTTON, WM_APP, WM_CLOSE, WM_COMMAND, WM_DESTROY, WM_INITDIALOG,
            WM_LBUTTONDBLCLK, WM_RBUTTONUP, WM_SETICON, WM_SIZE,
        },
    },
};

const DIALOG: u16 = 101;
const ICON: u16 = 1;
const TRAY_EVENT: u32 = WM_APP + 1;
const SHUTDOWN_EVENT: u32 = WM_APP + 2;
const OPEN_COMMAND: u32 = 1;
const EXIT_COMMAND: u32 = 2;

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain([0]).collect()
}

fn title() -> String {
    format!("{PRODUCT} V{VERSION}")
}

pub struct Instance(HANDLE);

impl Instance {
    pub fn open(port: u16) -> io::Result<Option<Self>> {
        let mut name = "Local\\InoRobotVirtualControllerBridge".to_owned();
        if port != BRIDGE_PORT {
            name.push_str(&format!("_{port}"));
        }
        let name = wide(&name);
        let handle = unsafe { CreateMutexW(ptr::null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        let instance = Self(handle);
        Ok((unsafe { GetLastError() } != ERROR_ALREADY_EXISTS).then_some(instance))
    }
}

impl Drop for Instance {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

pub fn register_launch(exe: &Path) -> io::Result<()> {
    const PROTOCOL: &str = r"Software\Classes\inorobot-vc-bridge";
    const COMMAND: &str = r"Software\Classes\inorobot-vc-bridge\shell\open\command";
    let description = wide(&format!("URL:{PRODUCT}"));
    let mut command = OsString::from("\"");
    command.push(exe.as_os_str());
    command.push("\" \"%1\"");
    let command = command.encode_wide().chain([0]).collect::<Vec<_>>();
    for (key, values) in [
        (PROTOCOL, &[("", description.as_slice()), ("URL Protocol", &[0])][..]),
        (COMMAND, &[("", command.as_slice())][..]),
    ] {
        let mut handle = ptr::null_mut();
        let key = wide(key);
        let code = unsafe {
            RegCreateKeyExW(HKEY_CURRENT_USER, key.as_ptr(), 0, ptr::null(), REG_OPTION_NON_VOLATILE,
                KEY_SET_VALUE, ptr::null(), &mut handle, ptr::null_mut())
        };
        if code != 0 {
            return Err(io::Error::from_raw_os_error(code as i32));
        }
        let result = values.iter().try_for_each(|(name, value)| {
            let name = wide(name);
            let code = unsafe {
                RegSetValueExW(handle, name.as_ptr(), 0, REG_SZ, value.as_ptr().cast(),
                    std::mem::size_of_val(*value) as u32)
            };
            if code == 0 { Ok(()) } else { Err(io::Error::from_raw_os_error(code as i32)) }
        });
        unsafe { RegCloseKey(handle) };
        result?;
    }
    Ok(())
}

pub fn show_error(message: &str) {
    let message = wide(&format!("전용 브리지를 시작할 수 없습니다.\n\n{message}"));
    unsafe { MessageBoxW(ptr::null_mut(), message.as_ptr(), wide(&title()).as_ptr(), MB_ICONERROR) };
}

pub struct Window(HWND);

impl Window {
    pub fn new() -> io::Result<Self> {
        unsafe {
            SetProcessDPIAware();
            let hwnd = CreateDialogParamW(GetModuleHandleW(ptr::null()), resource(DIALOG),
                ptr::null_mut(), Some(dialog), 0);
            if hwnd.is_null() { Err(io::Error::last_os_error()) } else { Ok(Self(hwnd)) }
        }
    }

    pub fn close_signal(&self) -> impl FnOnce() + Send + 'static {
        let hwnd = self.0 as usize;
        move || unsafe { PostMessageW(hwnd as HWND, SHUTDOWN_EVENT, 0, 0); }
    }

    pub fn run(&self) -> io::Result<()> {
        unsafe {
            ShowWindow(self.0, SW_SHOW);
            let mut message = MSG::default();
            loop {
                match GetMessageW(&mut message, ptr::null_mut(), 0, 0) {
                    -1 => return Err(io::Error::last_os_error()),
                    0 => return Ok(()),
                    _ if IsDialogMessageW(self.0, &message) == 0 => {
                        TranslateMessage(&message);
                        DispatchMessageW(&message);
                    }
                    _ => {}
                }
            }
        }
    }
}

impl Drop for Window {
    fn drop(&mut self) {
        unsafe {
            if IsWindow(self.0) != 0 {
                DestroyWindow(self.0);
            }
        }
    }
}

fn resource(id: u16) -> *const u16 {
    id as usize as *const u16
}

unsafe fn tray_icon(hwnd: HWND, message: u32) -> bool {
    let mut icon = NOTIFYICONDATAW {
        cbSize: size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: hwnd,
        uID: 1,
        uFlags: NIF_MESSAGE | NIF_ICON | NIF_TIP,
        uCallbackMessage: TRAY_EVENT,
        hIcon: LoadIconW(GetModuleHandleW(ptr::null()), resource(ICON)),
        ..Default::default()
    };
    GetWindowTextW(hwnd, icon.szTip.as_mut_ptr(), icon.szTip.len() as i32);
    Shell_NotifyIconW(message, &icon) != 0
}

unsafe fn restore(hwnd: HWND) {
    tray_icon(hwnd, NIM_DELETE);
    ShowWindow(hwnd, SW_RESTORE);
    SetForegroundWindow(hwnd);
}

unsafe fn tray_menu(hwnd: HWND) {
    let menu = CreatePopupMenu();
    if menu.is_null() {
        return;
    }
    AppendMenuW(menu, MF_STRING, OPEN_COMMAND as usize, wide("열기").as_ptr());
    AppendMenuW(menu, MF_SEPARATOR, 0, ptr::null());
    AppendMenuW(menu, MF_STRING, EXIT_COMMAND as usize, wide("종료").as_ptr());
    let mut point = POINT::default();
    GetCursorPos(&mut point);
    SetForegroundWindow(hwnd);
    let command = TrackPopupMenu(menu, TPM_NONOTIFY | TPM_RETURNCMD | TPM_RIGHTBUTTON,
        point.x, point.y, 0, hwnd, ptr::null()) as u32;
    DestroyMenu(menu);
    match command {
        OPEN_COMMAND => restore(hwnd),
        EXIT_COMMAND => { DestroyWindow(hwnd); }
        _ => {}
    }
}

unsafe extern "system" fn dialog(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> isize {
    match msg {
        WM_INITDIALOG => {
            SetWindowTextW(hwnd, wide(&title()).as_ptr());
            let icon = LoadIconW(GetModuleHandleW(ptr::null()), resource(ICON));
            SendMessageW(hwnd, WM_SETICON, 0, icon as LPARAM);
            SendMessageW(hwnd, WM_SETICON, 1, icon as LPARAM);
            SetDlgItemTextW(hwnd, 1001, wide("가상 컨트롤러 전용 브리지").as_ptr());
            SetDlgItemTextW(hwnd, 1002, wide(&format!("V{VERSION} · 실행 중")).as_ptr());
            SetDlgItemTextW(hwnd, 1003, wide(
                "3D 시뮬레이션에서 여러 컨트롤러를 동시에 연결할 수 있습니다.\r\n연결 주소: ws://127.0.0.1:5055/ws"
            ).as_ptr());
            SetDlgItemTextW(hwnd, IDOK, wide("종료").as_ptr());
            return 1;
        }
        WM_SIZE if wparam as u32 == SIZE_MINIMIZED => {
            if tray_icon(hwnd, NIM_ADD) {
                ShowWindow(hwnd, SW_HIDE);
            }
        }
        TRAY_EVENT => match lparam as u32 {
            WM_LBUTTONDBLCLK => restore(hwnd),
            WM_RBUTTONUP => tray_menu(hwnd),
            _ => {}
        },
        WM_COMMAND if wparam & 0xffff == IDOK as usize => { DestroyWindow(hwnd); }
        WM_CLOSE | SHUTDOWN_EVENT => { DestroyWindow(hwnd); }
        WM_DESTROY => {
            tray_icon(hwnd, NIM_DELETE);
            PostQuitMessage(0);
        }
        _ => return 0,
    }
    1
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::{IsWindowVisible, SetWindowPos, SWP_NOZORDER, SWP_NOSIZE, SW_MINIMIZE};

    #[test]
    fn bridge_window_keeps_its_title_and_closes_from_the_tray() {
        let window = Window::new().unwrap();
        let hwnd = window.0;
        let mut text = [0u16; 128];
        unsafe {
            let len = GetWindowTextW(hwnd, text.as_mut_ptr(), text.len() as i32) as usize;
            assert_eq!(String::from_utf16_lossy(&text[..len]), "InoRobot Virtual Controller Bridge V2.1");
            SetWindowPos(hwnd, ptr::null_mut(), -32000, -32000, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
            ShowWindow(hwnd, SW_SHOW);
            assert_ne!(IsWindowVisible(hwnd), 0);

            ShowWindow(hwnd, SW_MINIMIZE);
            assert_eq!(IsWindowVisible(hwnd), 0);
            SendMessageW(hwnd, TRAY_EVENT, 1, WM_LBUTTONDBLCLK as LPARAM);
            assert_ne!(IsWindowVisible(hwnd), 0);

            ShowWindow(hwnd, SW_MINIMIZE);
            SendMessageW(hwnd, SHUTDOWN_EVENT, 0, 0);
            assert_eq!(IsWindow(hwnd), 0);
        }
    }
}
