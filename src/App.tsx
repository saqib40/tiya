import { useState, useCallback } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import Sidebar from "./components/Sidebar";
import PDFPreview from "./components/PDFPreview";
import CodeEditor from "./components/CodeEditor";
import { useDocuments } from "./hooks/useDocuments";

import Home from "./components/Home";
import TitleBar from "./components/TitleBar";

type PipelineStatus = 'Ready' | 'Unsaved' | 'Saving...' | 'Compiling...' | 'Error';
function cleanError(raw: string): string {
    const lines = raw.split('\n');
    const useful = lines.filter(line =>
        line.trim() !== '' &&
        !line.toLowerCase().includes('fontconfig') &&
        !line.toLowerCase().includes('compilation failed') &&
        !line.toLowerCase().includes('halted on')
    );
    const main = useful.find(line => line.includes('.tex:'));
    return main?.trim() || useful[0]?.trim() || 'Unknown LaTeX error';
}

function App() {
    const [projectPath, setProjectPath] = useState<string | null>(null);
    const [pdfPath, setPdfPath] = useState<string | null>(null);
    const [pdfRevision, setPdfRevision] = useState<number>(0);
    const [compileStatus, setCompileStatus] = useState<PipelineStatus>('Ready');
    const [compileError, setCompileError] = useState<string | null>(null);

    const handleCompile = useCallback(async (path: string) => {
        if (!path.toLowerCase().endsWith(".tex")) return;
        setCompileStatus('Compiling...');
        try {
            const result: string = await invoke("compile_preview", { filePath: path });
            setPdfPath(result);
            setPdfRevision(prev => prev + 1);
            setCompileError(null);
            setCompileStatus('Ready');
        } catch (error: unknown) {
            console.error("Pipeline failed:", error);
            let raw: string;
            if (typeof error === "string") {
                raw = error;
            } else if (error instanceof Error) {
                raw = error.message;
            } else {
                try {
                    raw = JSON.stringify(error) || String(error);
                } catch {
                    raw = String(error);
                }
            }
            setCompileError(cleanError(raw));
            setCompileStatus('Error');
        }
    }, []);

    const documents = useDocuments(handleCompile);
    const filePath = documents.activePath;
    const activeFileContent = documents.activeDocument?.content ?? null;
    const status: PipelineStatus = documents.error ? 'Error' : documents.saving ? 'Saving...'
        : documents.dirtyCount > 0 && compileStatus === 'Ready' ? 'Unsaved' : compileStatus;

    const handleFileSelect = async (path: string, content: string) => {
        try {
            await documents.flushAll();
            documents.openDocument(path, content);
            setPdfPath(null);
            setPdfRevision(0);
            setCompileError(null);
            await handleCompile(path);
        } catch {
            return;
        }
    };

    const handleProjectSelect = async (path: string) => {
        try {
            await documents.flushAll();
            documents.reset();
            setPdfPath(null);
            setPdfRevision(0);
            setCompileError(null);
            setCompileStatus('Ready');
            setProjectPath(path);
        } catch {
            return;
        }
    };

    const handleSave = async () => {
        try {
            if (!await documents.saveDocument(filePath)) await handleCompile(filePath);
        } catch {
            return;
        }
    };

    return (
        <div className="h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden flex flex-col font-sans">
            <TitleBar />

            {!projectPath ? (
                <Home onProjectSelect={handleProjectSelect} />
            ) : (
                <>
                    <div className="flex-1 relative overflow-hidden">
                        <Group orientation="horizontal" className="absolute inset-0">
                            {/* Left Sidebar */}
                            <Panel defaultSize={20} minSize={15}>
                                <Sidebar
                                    initialPath={projectPath}
                                    onProjectSelect={handleProjectSelect}
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
                                                onChange={(value) => documents.updateDocument(filePath, value || "")}
                                                onSave={handleSave}
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
                                        error={documents.error || compileError}
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
