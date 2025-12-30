import { useState, useEffect, useCallback, useRef } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import Sidebar from "./components/Sidebar";
import PDFPreview from "./components/PDFPreview";
import CodeEditor from "./components/CodeEditor";

import Home from "./components/Home";
import TitleBar from "./components/TitleBar";

type PipelineStatus = 'Ready' | 'Saving...' | 'Compiling...' | 'Error';

function App() {
    const [projectPath, setProjectPath] = useState<string | null>(null);
    const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
    const [filePath, setFilePath] = useState<string>("");
    const [pdfPath, setPdfPath] = useState<string | null>(null);
    const [pdfRevision, setPdfRevision] = useState<number>(0);
    const [status, setStatus] = useState<PipelineStatus>('Ready');

    const lastSavedContent = useRef<string | null>(null);

    const handleFileSelect = (path: string, content: string) => {
        setFilePath(path);
        setActiveFileContent(content);
        lastSavedContent.current = content;
        setStatus('Ready');
        // Reset preview when switching files
        setPdfPath(null);
        setPdfRevision(0);
        // Initial compilation (optional, but good for UX)
        if (path.toLowerCase().endsWith(".tex")) {
            handlePipeline(path, content);
        }
    };

    const handlePipeline = useCallback(async (path: string, content: string) => {
        if (!path || content === null) return;

        setStatus('Saving...');
        try {
            // 1. Save to disk
            await invoke("save_file", { path, content });
            lastSavedContent.current = content;

            // 2. Compile Preview (only if it's a LaTeX file)
            if (path.toLowerCase().endsWith(".tex")) {
                setStatus('Compiling...');
                const result: string = await invoke("compile_preview", { filePath: path });
                setPdfPath(result);
                setPdfRevision(prev => prev + 1);
            }

            setStatus('Ready');
        } catch (error) {
            console.error("Pipeline failed:", error);
            setStatus('Error');
        }
    }, []);

    // Automated Workflow Effect (Debounced)
    useEffect(() => {
        if (activeFileContent === null || !filePath) return;

        // Skip if content hasn't changed from last save
        if (activeFileContent === lastSavedContent.current) {
            return;
        }

        const timer = setTimeout(() => {
            handlePipeline(filePath, activeFileContent);
        }, 1000); // 1000ms debounce

        return () => clearTimeout(timer);
    }, [activeFileContent, filePath, handlePipeline]);

    return (
        <div className="h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden flex flex-col font-sans">
            <TitleBar />

            {!projectPath ? (
                <Home onProjectSelect={setProjectPath} />
            ) : (
                <>
                    <div className="flex-1 relative overflow-hidden">
                        <Group orientation="horizontal" className="absolute inset-0">
                            {/* Left Sidebar */}
                            <Panel defaultSize={20} minSize={15}>
                                <Sidebar
                                    initialPath={projectPath}
                                    onProjectSelect={setProjectPath}
                                    onFileSelect={handleFileSelect}
                                />
                            </Panel>

                            <Separator className="w-1 bg-slate-800/10 hover:bg-blue-600/20 transition-colors cursor-col-resize active:bg-blue-600/40" />

                            {/* Middle Editor Area */}
                            <Panel defaultSize={40} minSize={20}>
                                <div className="h-full w-full flex flex-col border-r border-white/5 bg-slate-950">
                                    <div className="px-4 py-3 bg-slate-900/50 border-b border-white/5 flex items-center justify-between">
                                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest truncate">
                                            {filePath ? filePath.split('/').pop() : "No file selected"}
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        {activeFileContent !== null ? (
                                            <CodeEditor
                                                code={activeFileContent}
                                                onChange={(value) => setActiveFileContent(value || "")}
                                                onSave={() => handlePipeline(filePath, activeFileContent)}
                                            />
                                        ) : (
                                            <div className="h-full w-full flex flex-col items-center justify-center gap-8 select-none">
                                                <div className="relative">
                                                    <FileText className="w-24 h-24 stroke-[1] text-slate-600 opacity-50" />
                                                    <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full" />
                                                </div>
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">Select a Source File</div>
                                                    <div className="text-slate-500 text-[10px] font-medium italic">Select a .tex file to begin</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Panel>

                            <Separator className="w-1 bg-slate-800/10 hover:bg-blue-600/20 transition-colors cursor-col-resize active:bg-blue-600/40" />

                            {/* Right Preview Area */}
                            <Panel defaultSize={40} minSize={20}>
                                <div className="h-full w-full bg-slate-950">
                                    <PDFPreview
                                        pdfPath={pdfPath}
                                        pdfRevision={pdfRevision}
                                        compiling={status === 'Compiling...'}
                                    />
                                </div>
                            </Panel>
                        </Group>
                    </div>

                    {/* Live Status Footer */}
                    <footer className={`h-6 flex items-center px-4 transition-colors duration-300 ${status === 'Error' ? 'bg-red-900' :
                        status === 'Ready' ? 'bg-slate-800' : 'bg-blue-900'
                        }`}>
                        <div className="flex items-center gap-2">
                            {status === 'Saving...' && <Loader2 size={12} className="animate-spin text-blue-200" />}
                            {status === 'Compiling...' && <Loader2 size={12} className="animate-spin text-blue-200" />}
                            {status === 'Ready' && <CheckCircle2 size={12} className="text-emerald-400" />}
                            {status === 'Error' && <AlertCircle size={12} className="text-red-200" />}
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">
                                {status}
                            </span>
                        </div>
                        {filePath && (
                            <div className="ml-auto text-[10px] text-white/40 font-mono">
                                {status === 'Ready' && "Changes synced to disk"}
                            </div>
                        )}
                    </footer>
                </>
            )}
        </div>
    );
}

export default App;
