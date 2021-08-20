#include <node.h>

// code for win32 only
#ifdef _WIN32
#include <windows.h>
#include <cstdint>
#include <vector>

namespace get_screen {

	using v8::Function;
	using v8::FunctionCallbackInfo;
	using v8::Isolate;
	using v8::Local;
	using v8::Int32;
	using v8::Object;
	using v8::String;
	using v8::Value;
	using v8::Array;
	using v8::Context;

	typedef enum PROCESS_DPI_AWARENESS {
		PROCESS_DPI_UNAWARE = 0,
		PROCESS_SYSTEM_DPI_AWARE = 1,
		PROCESS_PER_MONITOR_DPI_AWARE = 2
	} PROCESS_DPI_AWARENESS;

	typedef HRESULT(CALLBACK* SetProcessDpiAwareness_)(PROCESS_DPI_AWARENESS);

	typedef enum MONITOR_DPI_TYPE {
		MDT_EFFECTIVE_DPI = 0,
		MDT_ANGULAR_DPI = 1,
		MDT_RAW_DPI = 2,
		MDT_DEFAULT = MDT_EFFECTIVE_DPI
	} MONITOR_DPI_TYPE;

	typedef HRESULT(CALLBACK* GetDpiForMonitor_)(HMONITOR, MONITOR_DPI_TYPE, UINT*, UINT*);

	uint32_t GetMonitorDpi(HMONITOR monitor)
	{
		static HINSTANCE shcore = LoadLibrary("Shcore.dll");
		if (shcore != nullptr)
		{
			if (auto getDpiForMonitor = GetDpiForMonitor_(GetProcAddress(shcore, "GetDpiForMonitor")))
			{
				UINT xScale, yScale;
				getDpiForMonitor(monitor, MDT_DEFAULT, &xScale, &yScale);
				return xScale;
			}
		}
		return 0;
	}

	void SetAware()
	{
		static HINSTANCE shcore = LoadLibrary("Shcore.dll");
		if (shcore != nullptr)
		{
			if (auto setAwareness = SetProcessDpiAwareness_(GetProcAddress(shcore, "SetProcessDpiAwareness")))
			{
				setAwareness(PROCESS_PER_MONITOR_DPI_AWARE);
			}
		}
	}

	struct screen_info {
		screen_info(int32_t x, int32_t y, int32_t width, int32_t height, uint32_t dpi) : x(x), y(y), width(width), height(height), dpi(dpi) {}
		int32_t x;
		int32_t y;
		int32_t width;
		int32_t height;
		uint32_t dpi;
	};

	BOOL __cdecl EnumMonitorCallback(HMONITOR hMonitor, HDC hdcMonitor, LPRECT lprcMonitor, LPARAM dwData) {
		std::vector<screen_info>& infos = *((std::vector<screen_info>*)dwData);

		MONITORINFOEX mon_info{};
		mon_info.cbSize = sizeof(MONITORINFOEX);
		GetMonitorInfo(hMonitor, &mon_info);

		uint32_t dpi = GetMonitorDpi(hMonitor);

		infos.emplace_back(
			mon_info.rcMonitor.left,
			mon_info.rcMonitor.top,
			mon_info.rcMonitor.right - mon_info.rcMonitor.left,
			mon_info.rcMonitor.bottom - mon_info.rcMonitor.top,
			dpi);

		return TRUE;
	}

	void getScreenInfo(const FunctionCallbackInfo<Value>& args) {
		std::vector<screen_info> screens{};
		HDC hdc = GetDC(NULL);
		EnumDisplayMonitors(hdc, NULL, EnumMonitorCallback, (LPARAM)&screens);

		Isolate* isolate = args.GetIsolate();
		auto ctx = isolate->GetCurrentContext();

		Local<Array> array = Array::New(isolate, (int)screens.size());

		for (int32_t i = 0; i < screens.size(); ++i) {
			Local<Object> bounds = Object::New(isolate);
			Local<Object> obj = Object::New(isolate);
			bounds->Set(ctx, String::NewFromUtf8(isolate, "x").ToLocalChecked(), Int32::New(isolate, screens[i].x));
			bounds->Set(ctx, String::NewFromUtf8(isolate, "y").ToLocalChecked(), Int32::New(isolate, screens[i].y));
			bounds->Set(ctx, String::NewFromUtf8(isolate, "width").ToLocalChecked(), Int32::New(isolate, screens[i].width));
			bounds->Set(ctx, String::NewFromUtf8(isolate, "height").ToLocalChecked(), Int32::New(isolate, screens[i].height));
			obj->Set(ctx, String::NewFromUtf8(isolate, "bounds").ToLocalChecked(), bounds);
			obj->Set(ctx, String::NewFromUtf8(isolate, "dpi").ToLocalChecked(), Int32::NewFromUnsigned(isolate, screens[i].dpi));
			obj->Set(ctx, String::NewFromUtf8(isolate, "index").ToLocalChecked(), Int32::New(isolate, i));
			array->Set(ctx, i, obj);
		}

		ReleaseDC(0, hdc);
		args.GetReturnValue().Set(array);
	}

	void getMouseState(const FunctionCallbackInfo<Value>& args) {
		Isolate* isolate = args.GetIsolate();
		Local<Object> obj = Object::New(isolate);
		auto ctx = isolate->GetCurrentContext();

		// get mouse state & position
		POINT p;
		GetCursorPos(&p);
		int32_t x = p.x;
		int32_t y = p.y;
		bool leftkeydown = GetAsyncKeyState(VK_LBUTTON) & 0x8000;
		bool rightkeydown = GetAsyncKeyState(VK_RBUTTON) & 0x8000;
		bool pressed = leftkeydown || rightkeydown;

		// get dpi of monitor mouse is located on
        HMONITOR hMon = MonitorFromPoint(p, MONITOR_DEFAULTTONEAREST);
        uint32_t dpi = GetMonitorDpi(hMon);

		obj->Set(ctx, String::NewFromUtf8(isolate, "x").ToLocalChecked(), Int32::New(isolate, x));
		obj->Set(ctx, String::NewFromUtf8(isolate, "y").ToLocalChecked(), Int32::New(isolate, y));
		obj->Set(ctx, String::NewFromUtf8(isolate, "pressed").ToLocalChecked(), v8::Boolean::New(isolate, pressed));
        obj->Set(ctx, String::NewFromUtf8(isolate, "dpi").ToLocalChecked(), Int32::New(isolate, dpi));

		args.GetReturnValue().Set(obj);
	}

	void init(Local<Object> exports) {
		SetAware();
		NODE_SET_METHOD(exports, "getScreenInfo", getScreenInfo);
		NODE_SET_METHOD(exports, "getMouseState", getMouseState);
	}

	NODE_MODULE(getscreens, init);
}

#endif