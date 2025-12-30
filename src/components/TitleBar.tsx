import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

const TitleBar = () => {
    const appWindow = getCurrentWindow();

    const handleMinimize = () => {
        console.log("Minimize clicked");
        appWindow.minimize();
    };

    const handleMaximize = async () => {
        console.log("Maximize clicked");
        try {
            const isMaximized = await appWindow.isMaximized();
            if (isMaximized) {
                appWindow.unmaximize();
            } else {
                appWindow.maximize();
            }
        } catch (err) {
            console.error("Maximize check failed:", err);
        }
    };

    const handleClose = () => {
        console.log("Close clicked");
        appWindow.close();
    };

    return (
        <div className="h-8 w-full bg-slate-950 border-b border-slate-900 flex items-center justify-between select-none relative">
            {/* Draggable Background Area - Covers everything but stays behind content */}
            <div
                data-tauri-drag-region
                className="absolute inset-0 z-0"
            />

            {/* Content Area - Above the drag region */}
            <div className="z-10 flex items-center justify-between w-full h-full pointer-events-none px-4">
                {/* Left Side (Spacer for balance) */}
                <div className="w-24 pointer-events-none" />

                {/* Centered Title */}
                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 pointer-events-none">
                    tiya
                </div>

                {/* Window Controls - Re-enable pointer events */}
                <div className="flex h-full pointer-events-auto">
                    <button
                        onClick={handleMinimize}
                        className="w-10 h-full flex items-center justify-center hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                        title="Minimize"
                    >
                        <Minus size={14} />
                    </button>
                    <button
                        onClick={handleMaximize}
                        className="w-10 h-full flex items-center justify-center hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                        title="Maximize"
                    >
                        <Square size={12} />
                    </button>
                    <button
                        onClick={handleClose}
                        className="w-12 h-full flex items-center justify-center hover:bg-red-500 transition-colors group"
                        title="Close"
                    >
                        <X size={14} className="text-slate-400 group-hover:text-white" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TitleBar;
