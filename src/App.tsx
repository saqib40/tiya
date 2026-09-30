import { useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, CheckCircle2, AlertCircle, FileText, Play, Square, X } from "lucide-react";
import Sidebar from "./components/Sidebar";
import PDFPreview from "./components/PDFPreview";
import CodeEditor from "./components/CodeEditor";
import { useDocuments } from "./hooks/useDocuments";
import { useCompiler } from "./hooks/useCompiler";
import { ProjectInfo, relativePath } from "./lib/project";
import { Diagnostic, EditorLocation, parseDiagnostics } from "./lib/diagnostics";

import Home from "./components/Home";
import TitleBar from "./components/TitleBar";

type PipelineStatus = 'Ready' | 'Unsaved' | 'Saving...' | 'Compiling...' | 'Error' | 'Cancelled' | 'Outdated';

function App() {
    const [projectPath, setProjectPath] = useState<string | null>(null);
    const [rootFile, setRootFile] = useState<string | null>(null);
    const [texFiles, setTexFiles] = useState<string[]>([]);
    const [projectError, setProjectError] = useState<string | null>(null);
    const [automaticCompile, setAutomaticCompile] = useState(true);
    const [editorLocation, setEditorLocation] = useState<EditorLocation | null>(null);
    const compiler = useCompiler(rootFile, automaticCompile);
    const documents = useDocuments(compiler.sourceSaved);
    const filePath = documents.activePath;
    const activeFileContent = documents.activeDocument?.content ?? null;
    const diagnostics = parseDiagnostics(compiler.log);
    const status: PipelineStatus = documents.error ? 'Error' : documents.saving ? 'Saving...'
        : documents.dirtyCount > 0 && compiler.status === 'Ready' ? 'Unsaved' : compiler.status;

    const handleFileSelect = async (path: string, content: string) => {
        await documents.flushAll().catch(() => undefined);
        documents.openDocument(path, content);
        setEditorLocation(null);
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

    const handleDiagnostic = async (diagnostic: Diagnostic) => {
        if (!projectPath || !rootFile) return;
        try {
            await documents.flushAll();
            const path = await invoke<string>("resolve_project_file", {
                projectPath, rootFile, requestedPath: diagnostic.file,
            });
            const content = await invoke<string>("read_file_content", { path });
            documents.openDocument(path, content);
            setEditorLocation(previous => ({ line: diagnostic.line, column: diagnostic.column, revision: (previous?.revision ?? 0) + 1 }));
            setProjectError(null);
        } catch (failure) {
            setProjectError(String(failure));
        }
    };

    const handleMutation = async (source: string, destination: string | null) => {
        if (!projectPath) return;
        if (destination) documents.relocateDocuments(source, destination);
        else documents.removeDocuments(source);
        const affectsRoot = rootFile && (rootFile === source || rootFile.startsWith(`${source}/`) || rootFile.startsWith(`${source}\\`));
        if (affectsRoot && destination) {
            const nextRoot = `${destination}${rootFile.slice(source.length)}`;
            const project = await invoke<ProjectInfo>("set_project_root", { projectPath, filePath: nextRoot });
            setRootFile(project.root_file);
            setTexFiles(project.tex_files);
        } else {
            const project = await invoke<ProjectInfo>("load_project", { path: projectPath });
            setRootFile(project.root_file);
            setTexFiles(project.tex_files);
        }
        compiler.sourceSaved();
    };

    const handleFilesChanged = async (paths: string[]) => {
        if (!projectPath) return;
        const affected = Object.keys(documents.buffers).filter(file => paths.some(path => file === path || file.startsWith(`${path}/`) || file.startsWith(`${path}\\`)));
        const refreshed = await Promise.all(affected.map(documents.refreshDocument));
        const untracked = paths.some(path => !affected.includes(path));
        const project = await invoke<ProjectInfo>("load_project", { path: projectPath });
        setTexFiles(project.tex_files);
        setRootFile(project.root_file);
        if (untracked || refreshed.some(Boolean)) compiler.sourceSaved();
    };

    return (
        <div className="h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden flex flex-col font-sans">
            <TitleBar />
            {(projectError || documents.error) && <div role="alert" className="shrink-0 break-words border-b border-red-800 bg-red-950 px-4 py-2 text-sm text-red-200">
                {projectError || documents.error}
            </div>}

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
                    {(compiler.log || compiler.error) && <div className="max-h-44 shrink-0 overflow-auto border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs">
                        {compiler.error && <p role="alert" className="mb-2 text-red-300">{compiler.error.split('\n')[0]}</p>}
                        {diagnostics.length > 0 && <ul aria-label="Build problems" className="mb-2 space-y-1">
                            {diagnostics.map((diagnostic, index) => <li key={index}>
                                <button onClick={() => void handleDiagnostic(diagnostic)} className={`w-full break-words text-left hover:underline ${diagnostic.severity === 'error' ? 'text-red-300' : 'text-amber-200'}`}>
                                    {diagnostic.file}:{diagnostic.line} {diagnostic.message}
                                </button>
                            </li>)}
                        </ul>}
                        <details>
                            <summary className="cursor-pointer">Build output</summary>
                            <pre className="whitespace-pre-wrap break-words py-2 font-mono text-slate-300">{compiler.log}</pre>
                        </details>
                    </div>}
                    <div className="flex-1 relative overflow-hidden">
                        <Group orientation="horizontal" className="absolute inset-0">
                            {/* Left Sidebar */}
                            <Panel defaultSize={20} minSize={15}>
                                <Sidebar
                                    initialPath={projectPath}
                                    rootFile={rootFile}
                                    onProjectSelect={handleProjectSelect}
                                    onFileSelect={handleFileSelect}
                                    beforeMutation={documents.flushAll}
                                    onMutation={handleMutation}
                                    onFilesChanged={handleFilesChanged}
                                />
                            </Panel>

                            <Separator className="w-1 bg-slate-800/10 hover:bg-blue-600/20 transition-colors cursor-col-resize active:bg-blue-600/40" />

                            {/* Middle Editor Area */}
                            <Panel defaultSize={40} minSize={20}>
                                <div className="h-full w-full flex flex-col border-r border-white/5 bg-slate-950">
                                    <div role="tablist" aria-label="Open files" className="flex shrink-0 overflow-x-auto border-b border-white/5 bg-slate-900/50">
                                        {Object.values(documents.buffers).map(buffer => <div key={buffer.path} className={`flex shrink-0 items-center border-r border-slate-800 ${buffer.path === filePath ? 'bg-slate-800' : ''}`}>
                                            <button role="tab" aria-selected={buffer.path === filePath} onClick={() => void handleFileSelect(buffer.path, buffer.content)} title={buffer.path} className="max-w-48 truncate px-3 py-2 text-xs text-slate-200">
                                                {relativePath(projectPath, buffer.path)}{buffer.content !== buffer.savedContent ? ' *' : ''}{buffer.externalContent !== undefined ? ' !' : ''}
                                            </button>
                                            <button title={`Close ${relativePath(projectPath, buffer.path)}`} aria-label={`Close ${relativePath(projectPath, buffer.path)}`} onClick={() => void documents.closeDocument(buffer.path).catch(() => undefined)} className="p-2 text-slate-400 hover:text-white"><X size={12} /></button>
                                        </div>)}
                                    </div>
                                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                                        {documents.activeDocument?.recovered && <div role="status" className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-800 bg-emerald-950 px-3 py-2 text-xs text-emerald-100">
                                            <span>Unsaved edits recovered</span>
                                            <button title="Dismiss recovery notice" aria-label="Dismiss recovery notice" onClick={() => documents.dismissRecovery(filePath)}><X size={14} /></button>
                                        </div>}
                                        {documents.activeDocument?.externalContent !== undefined && <div className="max-h-48 overflow-auto border-b border-amber-800 bg-amber-950 px-3 py-2 text-xs text-amber-100">
                                            <div className="mb-2">File changed on disk</div>
                                            <div className="flex flex-wrap gap-3">
                                                <button onClick={() => documents.resolveConflict(filePath, 'disk')} className="underline">Use disk version</button>
                                                <button onClick={() => documents.resolveConflict(filePath, 'local')} className="underline">Keep my edits</button>
                                            </div>
                                            <details className="mt-2"><summary>Disk version</summary><pre className="whitespace-pre-wrap break-words">{documents.activeDocument.externalContent}</pre></details>
                                        </div>}
                                        {activeFileContent !== null ? (
                                            <CodeEditor
                                                key={projectPath}
                                                path={filePath}
                                                openPaths={Object.keys(documents.buffers)}
                                                code={activeFileContent}
                                                onChange={(value) => documents.updateDocument(filePath, value || "")}
                                                onSave={handleSave}
                                                location={editorLocation}
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
