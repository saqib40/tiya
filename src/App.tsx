import { useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, CheckCircle2, AlertCircle, FileText, Play, Square } from "lucide-react";
import Sidebar from "./components/Sidebar";
import PDFPreview from "./components/PDFPreview";
import CodeEditor from "./components/CodeEditor";
import { useDocuments } from "./hooks/useDocuments";
import { useCompiler } from "./hooks/useCompiler";
import { ProjectInfo, relativePath } from "./lib/project";

import Home from "./components/Home";
import TitleBar from "./components/TitleBar";

type PipelineStatus = 'Ready' | 'Unsaved' | 'Saving...' | 'Compiling...' | 'Error' | 'Cancelled' | 'Outdated';

function App() {
    const [projectPath, setProjectPath] = useState<string | null>(null);
    const [rootFile, setRootFile] = useState<string | null>(null);
    const [texFiles, setTexFiles] = useState<string[]>([]);
    const [projectError, setProjectError] = useState<string | null>(null);
    const [automaticCompile, setAutomaticCompile] = useState(true);
    const compiler = useCompiler(rootFile, automaticCompile);
    const documents = useDocuments(compiler.sourceSaved);
    const filePath = documents.activePath;
    const activeFileContent = documents.activeDocument?.content ?? null;
    const status: PipelineStatus = documents.error ? 'Error' : documents.saving ? 'Saving...'
        : documents.dirtyCount > 0 && compiler.status === 'Ready' ? 'Unsaved' : compiler.status;

    const handleFileSelect = async (path: string, content: string) => {
        try {
            await documents.flushAll();
            documents.openDocument(path, content);
        } catch {
            return;
        }
    };

    const handleProjectSelect = async (path: string) => {
        try {
            await documents.flushAll();
            const project = await invoke<ProjectInfo>("load_project", { path });
            const content = project.root_file
                ? await invoke<string>("read_file_content", { path: project.root_file }) : null;
            documents.reset();
            setProjectError(null);
            setProjectPath(project.path);
            setRootFile(project.root_file);
            setTexFiles(project.tex_files);
            if (project.root_file && content !== null) documents.openDocument(project.root_file, content);
        } catch (failure) {
            setProjectError(String(failure));
        }
    };

    const handleRootSelect = async (path: string) => {
        if (!projectPath || !path) return;
        try {
            await documents.flushAll();
            const project = await invoke<ProjectInfo>("set_project_root", { projectPath, filePath: path });
            setRootFile(project.root_file);
            setTexFiles(project.tex_files);
            setProjectError(null);
        } catch (failure) {
            setProjectError(String(failure));
        }
    };

    const handleSave = async () => {
        try {
            await documents.flushAll();
        } catch {
            return;
        }
    };

    const handleBuild = async () => {
        try {
            await documents.flushAll();
            compiler.requestCompile();
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
                    <div className="flex items-center gap-3 border-b border-white/5 bg-slate-900 px-4 py-2 text-xs">
                        <label htmlFor="root-document" className="shrink-0 text-slate-400">Root document</label>
                        <select
                            id="root-document"
                            value={rootFile ?? ""}
                            onChange={event => void handleRootSelect(event.target.value)}
                            className="min-w-0 max-w-sm flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
                        >
                            <option value="" disabled>Choose a root document</option>
                            {texFiles.map(path => <option key={path} value={path}>{relativePath(projectPath, path)}</option>)}
                        </select>
                        <label className="flex shrink-0 items-center gap-2">
                            <input type="checkbox" checked={automaticCompile} onChange={event => setAutomaticCompile(event.target.checked)} />
                            Auto build
                        </label>
                        <button type="button" onClick={() => void handleBuild()} disabled={!rootFile} title="Build PDF" aria-label="Build PDF" className="p-1.5 text-emerald-400 disabled:opacity-40">
                            <Play size={16} />
                        </button>
                        <button type="button" onClick={compiler.cancelCompile} disabled={compiler.status !== 'Compiling...'} title="Cancel build" aria-label="Cancel build" className="p-1.5 text-red-300 disabled:opacity-40">
                            <Square size={16} />
                        </button>
                    </div>
                    {compiler.log && <details className="max-h-40 shrink-0 overflow-auto border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs">
                        <summary className="cursor-pointer">Build output</summary>
                        <pre className="whitespace-pre-wrap break-words py-2 font-mono text-slate-300">{compiler.log}</pre>
                    </details>}
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
                                            {filePath ? relativePath(projectPath, filePath) : "No file selected"}
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
                                        pdfPath={compiler.pdfPath}
                                        pdfRevision={compiler.pdfRevision}
                                        compiling={status === 'Compiling...'}
                                        error={documents.error || projectError || compiler.error}
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
