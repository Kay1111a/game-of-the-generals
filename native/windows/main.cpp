#define NOMINMAX
#include <windows.h>
#include <shlobj.h>
#include <wrl.h>
#include <WebView2.h>
#include <string>
#include <cwchar>
using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {
ComPtr<ICoreWebView2Controller> controller;
ComPtr<ICoreWebView2> web;
bool selfTest = false, checking = false;
int exitCode = 0;
constexpr UINT_PTR reportTimer = 1;

void writeReport(const std::wstring& text) {
    const int count = WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
    std::string line(count, '\0');
    WideCharToMultiByte(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), line.data(), count, nullptr, nullptr);
    line.push_back('\n');
    DWORD written = 0;
    WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), line.data(), static_cast<DWORD>(line.size()), &written, nullptr);
}

void fail(HWND window, const wchar_t* message) {
    if (IsWindow(window)) {
        if (selfTest) { exitCode = 1; writeReport(message); }
        else MessageBoxW(window, message, L"SnakesAndLadders", MB_OK | MB_ICONERROR);
        DestroyWindow(window);
    }
}

std::wstring resourceText(int id) {
    HMODULE app = GetModuleHandleW(nullptr);
    HRSRC source = FindResourceW(app, MAKEINTRESOURCEW(id), RT_RCDATA);
    if (!source) return {};
    HGLOBAL data = LoadResource(app, source);
    const char* bytes = data ? static_cast<const char*>(LockResource(data)) : nullptr;
    const int size = static_cast<int>(SizeofResource(app, source));
    if (!bytes || size <= 0) return {};
    int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes, size, nullptr, 0);
    if (!count) return {};
    std::wstring text(count, L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes, size, text.data(), count);
    return text;
}

// Only the explicit self-test switch exercises this fixed, bundled scenario.
void playTestWhenReady(HWND window) {
    EventRegistrationToken token{};
    auto loaded = Callback<ICoreWebView2NavigationCompletedEventHandler>(
        [window](ICoreWebView2* page, ICoreWebView2NavigationCompletedEventArgs* event) -> HRESULT {
            BOOL ok = FALSE;
            event->get_IsSuccess(&ok);
            const auto test = resourceText(103);
            if (!ok || test.empty()) { fail(window, L"Unable to load the packaged board or its test."); return S_OK; }
            auto script = test + L"\nif (document.querySelector('#picker[open] #choices button') && !window.nativePlaytest) void playNativeMatches();";
            if (FAILED(page->ExecuteScript(script.c_str(), nullptr))) {
                fail(window, L"Unable to start the native playthrough."); return S_OK;
            }
            SetTimer(window, reportTimer, 250, nullptr);
            return S_OK;
        });
    if (FAILED(web->add_NavigationCompleted(loaded.Get(), &token))) {
        fail(window, L"Unable to observe the native board.");
    }
}

void readPlaytest(HWND window) {
    if (checking || !web) return;
    checking = true;
    auto callback = Callback<ICoreWebView2ExecuteScriptCompletedHandler>(
        [window](HRESULT status, LPCWSTR json) -> HRESULT {
            checking = false;
            if (FAILED(status)) { fail(window, L"Unable to read native playtest progress."); return S_OK; }
            if (!json || std::wcscmp(json, L"null") == 0) return S_OK;
            KillTimer(window, reportTimer);
            writeReport(json);
            exitCode = std::wcsstr(json, L"\"error\"") ? 1 : 0;
            PostMessageW(window, WM_CLOSE, 0, 0);
            return S_OK;
        });
    if (FAILED(web->ExecuteScript(L"window.nativePlaytest && (window.nativePlaytest.done || window.nativePlaytest.error) ? window.nativePlaytest : null", callback.Get()))) {
        fail(window, L"Unable to inspect the native playthrough.");
    }
}

void resize(HWND window) {
    if (!controller) return;
    RECT rect{};
    GetClientRect(window, &rect);
    controller->put_Bounds(rect);
}

void startGame(HWND window) {
    PWSTR local = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &local))) {
        fail(window, L"Windows could not open your application data folder.");
        return;
    }
    const std::wstring directory = std::wstring(local) + L"\\SnakesAndLadders";
    CoTaskMemFree(local);
    if (!CreateDirectoryW(directory.c_str(), nullptr) && GetLastError() != ERROR_ALREADY_EXISTS) {
        fail(window, L"Windows could not create SnakesAndLadders's local data folder.");
        return;
    }
    const std::wstring profile = directory + L"\\WebView2";
    const wchar_t* missing = L"SnakesAndLadders needs the Microsoft Edge WebView2 Runtime. Install it from Microsoft, then open the game again.";
    auto environmentReady = Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
        [window, missing](HRESULT status, ICoreWebView2Environment* env) -> HRESULT {
            if (!IsWindow(window)) return S_OK;
            if (FAILED(status) || !env) { fail(window, missing); return S_OK; }
            auto ready = Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                [window](HRESULT result, ICoreWebView2Controller* created) -> HRESULT {
                    if (!IsWindow(window)) return S_OK;
                    if (FAILED(result) || !created) { fail(window, L"The game window could not start."); return S_OK; }
                    controller = created;
                    if (FAILED(controller->get_CoreWebView2(&web)) || !web) {
                        fail(window, L"Windows could not open the game view."); return S_OK;
                    }
                    ComPtr<ICoreWebView2Settings> settings;
                    if (SUCCEEDED(web->get_Settings(&settings))) {
                        settings->put_AreDefaultContextMenusEnabled(FALSE);
                        settings->put_IsStatusBarEnabled(FALSE);
                    }
                    resize(window);
                    if (selfTest) playTestWhenReady(window);
                    if (!IsWindow(window)) return S_OK;
                    const auto html = resourceText(101);
                    if (html.empty() || FAILED(web->NavigateToString(html.c_str()))) {
                        fail(window, L"The embedded game could not be opened.");
                    } else {
                        controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
                    }
                    return S_OK;
                });
            if (FAILED(env->CreateCoreWebView2Controller(window, ready.Get()))) {
                fail(window, L"WebView2 could not create its game window.");
            }
            return S_OK;
        });
    if (FAILED(CreateCoreWebView2EnvironmentWithOptions(nullptr, profile.c_str(), nullptr, environmentReady.Get()))) {
        fail(window, missing);
    }
}

LRESULT CALLBACK windowProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case WM_SIZE: resize(hwnd); return 0;
    case WM_TIMER:
        if (wp == reportTimer && selfTest) readPlaytest(hwnd);
        return 0;
    case WM_SETFOCUS:
        if (controller) controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
        return 0;
    case WM_DPICHANGED: {
        auto bounds = reinterpret_cast<RECT*>(lp);
        SetWindowPos(hwnd, nullptr, bounds->left, bounds->top, bounds->right - bounds->left,
                     bounds->bottom - bounds->top, SWP_NOZORDER | SWP_NOACTIVATE);
        return 0;
    }
    case WM_DESTROY:
        if (controller) controller->Close();
        web.Reset(); controller.Reset(); PostQuitMessage(exitCode); return 0;
    default: return DefWindowProcW(hwnd, msg, wp, lp);
    }
}
}

int WINAPI wWinMain(HINSTANCE app, HINSTANCE, PWSTR commandLine, int show) {
    selfTest = commandLine && std::wcscmp(commandLine, L"--self-test") == 0;
    exitCode = selfTest ? 1 : 0;
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED))) return 1;
    WNDCLASSW cls{};
    cls.lpfnWndProc = windowProc; cls.hInstance = app;
    cls.lpszClassName = L"SnakesAndLaddersBoardGame"; cls.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    cls.hIcon = LoadIconW(app, MAKEINTRESOURCEW(102)); cls.hbrBackground = GetSysColorBrush(COLOR_WINDOW);
    RegisterClassW(&cls);
    HWND hwnd = CreateWindowExW(0, cls.lpszClassName, L"Snakes & Ladders",
        WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1120, 800, nullptr, nullptr, app, nullptr);
    if (!hwnd) { CoUninitialize(); return 1; }
    ShowWindow(hwnd, show);
    startGame(hwnd);
    MSG msg{};
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
        TranslateMessage(&msg); DispatchMessageW(&msg);
    }
    CoUninitialize();
    return static_cast<int>(msg.wParam);
}
