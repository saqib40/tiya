import { useEffect, useRef, useState } from "react";
import { Panel, Group, Separator, GroupImperativeHandle } from "react-resizable-panels";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, CheckCircle2, AlertCircle, FileText, Play, Square, X, House, Settings, PanelLeft, Code2, Columns2, BookOpen } from "lucide-react";
import Sidebar from "./components/Sidebar";
import PDFPreview from "./components/PDFPreview";
import AssetPreview from "./components/AssetPreview";
import CodeEditor from "./components/CodeEditor";
import { useDocuments } from "./hooks/useDocuments";
import { useCompiler } from "./hooks/useCompiler";
import { useSynctex } from "./hooks/useSynctex";
import { forwardSync, inverseSync, SyncBox } from "./lib/synctex";
import { ProjectInfo, relativePath } from "./lib/project";
import { Diagnostic, EditorLocation, parseDiagnostics } from "./lib/diagnostics";
import { readWorkspace, rememberProject, rememberSession, saveWorkspace } from "./lib/workspace";

import Home from "./components/Home";
import TitleBar from "./components/TitleBar";

type PipelineStatus = 'Ready' | 'Unsaved' | 'Saving...' | 'Compiling...' | 'Error' | 'Cancelled' | 'Outdated';

function App() {
    const [workspace, setWorkspace] = useState(readWorkspace);
    const appearance = workspace.appearance;
    const group = useRef<GroupImperativeHandle>(null);
    const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 899px)').matches ?? false);
    const [preferencesOpen, setPreferencesOpen] = useState(false);
    const preferencesDialog = useRef<HTMLDialogElement>(null);
    const view = narrow && appearance.view === 'split' ? 'editor' : appearance.view;
    const showFiles = view === 'files' || (view === 'split' && appearance.sidebar);
    const showEditor = view === 'editor' || view === 'split';
    const showPreview = view === 'preview' || view === 'split';
    const projectSelection = useRef(0);
    const fileSelection = useRef(0);
    const [assetPath, setAssetPath] = useState<string | null>(null);
    const [assetRevision, setAssetRevision] = useState(0);
    const [projectPath, setProjectPath] = useState<string | null>(null);
    const [rootFile, setRootFile] = useState<string | null>(null);
    const [texFiles, setTexFiles] = useState<string[]>([]);
    const [projectError, setProjectError] = useState<string | null>(null);
    const automaticCompile = workspace.automaticCompile;
    const [editorLocation, setEditorLocation] = useState<EditorLocation | null>(null);
    const compiler = useCompiler(rootFile, automaticCompile);
    const sync = useSynctex(compiler.pdfPath, compiler.pdfRevision, rootFile);
    const [pdfLocation, setPdfLocation] = useState<(SyncBox & { revision: number }) | null>(null);
    const documents = useDocuments(compiler.sourceSaved);
    const filePath = documents.activePath;
    const activeFileContent = documents.activeDocument?.content ?? null;
    const diagnostics = parseDiagnostics(compiler.log);
    const status: PipelineStatus = documents.error ? 'Error' : documents.saving ? 'Saving...'
        : documents.dirtyCount > 0 && compiler.status === 'Ready' ? 'Unsaved' : compiler.status;
    const packageDownloadError = compiler.error?.startsWith('Tectonic could not download the required LaTeX packages.');

    useEffect(() => { setPdfLocation(null); }, [compiler.pdfPath, compiler.pdfRevision]);

    useEffect(() => {
        const media = window.matchMedia?.('(max-width: 899px)');
        if (!media) return;
        const changed = () => setNarrow(media.matches);
        media.addEventListener('change', changed);
        return () => media.removeEventListener('change', changed);
    }, []);

    useEffect(() => { document.documentElement.dataset.theme = appearance.theme; }, [appearance.theme]);
    useEffect(() => { if (preferencesOpen) preferencesDialog.current?.showModal(); }, [preferencesOpen]);

    useEffect(() => {
        const layout = appearance.layout;
        const editorSize = 100 * layout.editor / (layout.editor + layout.preview);
        group.current?.setLayout(view === 'split'
            ? appearance.sidebar ? layout : { files: 0, editor: editorSize, preview: 100 - editorSize }
            : { files: view === 'files' ? 100 : 0, editor: view === 'editor' ? 100 : 0, preview: view === 'preview' ? 100 : 0 });
    }, [view, appearance.sidebar, projectPath]);

    const rememberLayout = (layout: Record<string, number>) => {
        if (view !== 'split' || !appearance.sidebar || !layout.files || !layout.editor || !layout.preview) return;
        setWorkspace(previous => {
            if (['files', 'editor', 'preview'].every(panel => Math.abs(previous.appearance.layout[panel as keyof typeof previous.appearance.layout] - layout[panel]) < 0.01)) return previous;
            return { ...previous, appearance: { ...previous.appearance, layout: { files: layout.files, editor: layout.editor, preview: layout.preview } } };
        });
    };

    useEffect(() => {
        try { saveWorkspace(workspace); }
        catch (failure) { setProjectError(`Session preferences could not be stored: ${String(failure)}`); }
    }, [workspace]);

    useEffect(() => {
        if (projectPath) setWorkspace(previous => rememberSession(previous, projectPath, Object.keys(documents.buffers), documents.activePath));
    }, [projectPath, documents.buffers, documents.activePath]);

    useEffect(() => {
        if (workspace.lastProject) void handleProjectSelect(workspace.lastProject);
        return () => { projectSelection.current += 1; };
    }, []);

    const handleFileSelect = async (path: string, content: string) => {
        const selection = ++fileSelection.current;
        await documents.flushAll().catch(() => undefined);
        if (selection !== fileSelection.current) return;
        setAssetPath(null);
        documents.openDocument(path, content);
        setEditorLocation(null);
    };

    const handleAssetSelect = (path: string) => {
        fileSelection.current += 1;
        setAssetPath(path);
    };

    const handleProjectSelect = async (path: string) => {
        const selection = ++projectSelection.current;
        try {
            await documents.flushAll();
            const project = await invoke<ProjectInfo>("load_project", { path });
            const session = workspace.sessions[project.path];
            const candidates = [...new Set([project.root_file, ...(session?.files || [])].filter((file): file is string => Boolean(file)))];
            const opened: Array<{ path: string; content: string }> = [];
            for (const file of candidates) {
                if (!project.root_file) continue;
                try {
                    const resolved = file === project.root_file ? file : await invoke<string>("resolve_project_file", { projectPath: project.path, rootFile: project.root_file, requestedPath: file });
                    const content = await invoke<string>("read_file_content", { path: resolved });
                    opened.push({ path: resolved, content });
                } catch { continue; }
            }
            if (selection !== projectSelection.current) return;
            fileSelection.current += 1;
            setAssetPath(null);
            documents.reset();
            setProjectError(null);
            setProjectPath(project.path);
            setRootFile(project.root_file);
            setTexFiles(project.tex_files);
            for (const file of opened) documents.openDocument(file.path, file.content);
            const active = opened.find(file => file.path === session?.activeFile) || opened[0];
            if (active) documents.openDocument(active.path, active.content);
            setWorkspace(previous => rememberProject(previous, project.path));
        } catch (failure) {
            if (selection === projectSelection.current) setProjectError(String(failure));
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
        const selection = ++fileSelection.current;
        try {
            await documents.flushAll();
            const path = await invoke<string>("resolve_project_file", {
                projectPath, rootFile, requestedPath: diagnostic.file,
            });
            const content = await invoke<string>("read_file_content", { path });
            if (selection !== fileSelection.current) return;
            setAssetPath(null);
            documents.openDocument(path, content);
            setEditorLocation(previous => ({ line: diagnostic.line, column: diagnostic.column, revision: (previous?.revision ?? 0) + 1 }));
            setProjectError(null);
        } catch (failure) {
            if (selection === fileSelection.current) setProjectError(String(failure));
        }
    };

    const showInPdf = (line: number) => {
        const target = forwardSync(sync.boxes, filePath, line);
        if (!target) { setProjectError(sync.error || 'No matching position in the last successful PDF'); return; }
        setPdfLocation(previous => ({ ...target, revision: (previous?.revision || 0) + 1 }));
        setProjectError(null);
    };

    const showSource = (page: number, left: number, top: number) => {
        const target = inverseSync(sync.boxes, page, left, top);
        if (!target) { setProjectError(sync.error || 'No source position was found for this PDF location'); return; }
        void handleDiagnostic({ file: target.file, line: target.line, column: 1, message: '', severity: 'warning' });
    };

    const handleMutation = async (source: string, destination: string | null) => {
        if (!projectPath) return;
        if (assetPath && (assetPath === source || assetPath.startsWith(`${source}/`) || assetPath.startsWith(`${source}\\`))) {
            setAssetPath(destination ? `${destination}${assetPath.slice(source.length)}` : null);
        }
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
        if (assetPath && paths.some(path => assetPath === path || assetPath.startsWith(`${path}/`) || assetPath.startsWith(`${path}\\`))) setAssetRevision(value => value + 1);
        const affected = Object.keys(documents.buffers).filter(file => paths.some(path => file === path || file.startsWith(`${path}/`) || file.startsWith(`${path}\\`)));
        const refreshed = await Promise.all(affected.map(documents.refreshDocument));
        const untracked = paths.some(path => !affected.includes(path));
        const project = await invoke<ProjectInfo>("load_project", { path: projectPath });
        setTexFiles(project.tex_files);
        setRootFile(project.root_file);
        if (untracked || refreshed.some(Boolean)) compiler.sourceSaved();
    };

    const closeProject = async () => {
        try {
            await documents.flushAll();
            projectSelection.current += 1;
            compiler.cancelCompile();
            fileSelection.current += 1;
            setAssetPath(null);
            setRootFile(null);
            setProjectPath(null);
            documents.reset();
            setWorkspace(previous => ({ ...previous, lastProject: null }));
        } catch { return; }
    };

    return (
        <div className="h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden flex flex-col font-sans">
            <TitleBar />
            {(projectError || documents.error) && <div role="alert" className="shrink-0 break-words border-b border-red-800 bg-red-950 px-4 py-2 text-sm text-red-200">
                {projectError || documents.error}
            </div>}

            {!projectPath ? (
                <Home onProjectSelect={handleProjectSelect} recentProjects={workspace.recentProjects} onForgetProject={path => setWorkspace(previous => ({ ...previous, recentProjects: previous.recentProjects.filter(project => project !== path) }))} />
            ) : (
                <>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 text-xs">
                        <button title="Close project" aria-label="Close project" onClick={() => void closeProject()} className="shrink-0 p-1 text-slate-300"><House size={16} /></button>
                        <label htmlFor="root-document" className="sr-only shrink-0 text-slate-400 sm:not-sr-only">Root document</label>
                        <select
                            id="root-document"
                            value={rootFile ?? ""}
                            onChange={event => void handleRootSelect(event.target.value)}
                            className="min-w-32 max-w-sm flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
                        >
                            <option value="" disabled>Choose a root document</option>
                            {texFiles.map(path => <option key={path} value={path}>{relativePath(projectPath, path)}</option>)}
                        </select>
                        <label className="flex shrink-0 items-center gap-2">
                            <input type="checkbox" checked={automaticCompile} onChange={event => setWorkspace(previous => ({ ...previous, automaticCompile: event.target.checked }))} />
                            Auto build
                        </label>
                        <button type="button" onClick={() => void handleBuild()} disabled={!rootFile} title="Build PDF" aria-label="Build PDF" className="p-1.5 text-emerald-400 disabled:opacity-40">
                            <Play size={16} />
                        </button>
                        <button type="button" onClick={compiler.cancelCompile} disabled={compiler.status !== 'Compiling...'} title="Cancel build" aria-label="Cancel build" className="p-1.5 text-red-300 disabled:opacity-40">
                            <Square size={16} />
                        </button>
                        <div role="group" aria-label="Workspace view" className="ml-auto flex shrink-0 items-center gap-1 rounded border border-slate-700 p-0.5">
                            <button title="Files" aria-label="Files" aria-pressed={showFiles} onClick={() => setWorkspace(previous => ({ ...previous, appearance: { ...previous.appearance, ...(view === 'split' ? { sidebar: !previous.appearance.sidebar } : { view: view === 'files' ? 'editor' : 'files' }) } }))} className={`p-1.5 ${showFiles ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}><PanelLeft size={16} /></button>
                            <button title="Source view" aria-label="Source view" aria-pressed={view === 'editor'} onClick={() => setWorkspace(previous => ({ ...previous, appearance: { ...previous.appearance, view: 'editor' } }))} className={`p-1.5 ${view === 'editor' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}><Code2 size={16} /></button>
                            <button title="Split view" aria-label="Split view" aria-pressed={view === 'split'} disabled={narrow} onClick={() => setWorkspace(previous => ({ ...previous, appearance: { ...previous.appearance, view: 'split' } }))} className={`p-1.5 disabled:opacity-30 ${view === 'split' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}><Columns2 size={16} /></button>
                            <button title="PDF view" aria-label="PDF view" aria-pressed={view === 'preview'} onClick={() => setWorkspace(previous => ({ ...previous, appearance: { ...previous.appearance, view: 'preview' } }))} className={`p-1.5 ${view === 'preview' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'}`}><BookOpen size={16} /></button>
                        </div>
                        <button title="Preferences" aria-label="Preferences" onClick={() => setPreferencesOpen(true)} className="shrink-0 p-1.5 text-slate-300"><Settings size={16} /></button>
                    </div>
                    {compiler.preparingPackages && compiler.status === 'Compiling...' && <div role="status" className="flex shrink-0 items-center gap-3 border-b border-blue-800 bg-blue-950 px-4 py-2 text-xs text-blue-100">
                        <Loader2 size={14} className="shrink-0 animate-spin" />
                        <div className="min-w-0">
                            <p className="font-semibold">Preparing LaTeX packages</p>
                            <p className="truncate text-blue-200">{compiler.activity} · The first build may take a few minutes.</p>
                        </div>
                    </div>}
                    {(compiler.log || compiler.error) && <div className="max-h-44 shrink-0 overflow-auto border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs">
                        {compiler.error && <div role="alert" className="mb-2 flex items-center justify-between gap-3 text-red-300">
                            <p>{compiler.error.split('\n')[0]}</p>
                            {packageDownloadError && <button type="button" onClick={compiler.requestCompile} className="shrink-0 rounded border border-red-700 px-2 py-1 font-semibold text-red-100 hover:bg-red-950">Retry build</button>}
                        </div>}
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
                        <Group groupRef={group} defaultLayout={appearance.layout} onLayoutChange={rememberLayout} orientation="horizontal" className="absolute inset-0">
                            {/* Left Sidebar */}
                            <Panel id="files" collapsible defaultSize="20%" minSize="15%">
                                <div hidden={!showFiles} className={showFiles ? 'h-full' : 'hidden'}>
                                <Sidebar
                                    initialPath={projectPath}
                                    rootFile={rootFile}
                                    onProjectSelect={handleProjectSelect}
                                    onFileSelect={handleFileSelect}
                                    onAssetSelect={handleAssetSelect}
                                    beforeMutation={documents.flushAll}
                                    onMutation={handleMutation}
                                    onFilesChanged={handleFilesChanged}
                                />
                                </div>
                            </Panel>

                            <Separator className={`${showFiles && view === 'split' ? 'w-1' : 'hidden'} bg-slate-800/10 hover:bg-blue-600/20 transition-colors cursor-col-resize active:bg-blue-600/40`} />

                            {/* Middle Editor Area */}
                            <Panel id="editor" collapsible defaultSize="40%" minSize="20%">
                                <div hidden={!showEditor} className={showEditor ? "h-full w-full flex flex-col border-r border-slate-800 bg-slate-950" : 'hidden'}>
                                    <div role="tablist" aria-label="Open files" className="flex shrink-0 overflow-x-auto border-b border-white/5 bg-slate-900/50">
                                        {Object.values(documents.buffers).map(buffer => <div key={buffer.path} className={`flex shrink-0 items-center border-r border-slate-800 ${buffer.path === filePath ? 'bg-slate-800' : ''}`}>
                                            <button role="tab" aria-selected={!assetPath && buffer.path === filePath} onClick={() => void handleFileSelect(buffer.path, buffer.content)} title={buffer.path} className="max-w-48 truncate px-3 py-2 text-xs text-slate-200">
                                                {relativePath(projectPath, buffer.path)}{buffer.content !== buffer.savedContent ? ' *' : ''}{buffer.externalContent !== undefined ? ' !' : ''}
                                            </button>
                                            <button title={`Close ${relativePath(projectPath, buffer.path)}`} aria-label={`Close ${relativePath(projectPath, buffer.path)}`} onClick={() => void documents.closeDocument(buffer.path).catch(() => undefined)} className="p-2 text-slate-400 hover:text-white"><X size={12} /></button>
                                        </div>)}
                                        {assetPath && <div className="flex shrink-0 items-center bg-slate-800">
                                            <button role="tab" aria-selected="true" title={assetPath} className="max-w-48 truncate px-3 py-2 text-xs">{relativePath(projectPath, assetPath)}</button>
                                            <button title="Close asset preview" aria-label="Close asset preview" onClick={() => setAssetPath(null)} className="p-2"><X size={12} /></button>
                                        </div>}
                                    </div>
                                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                                        {assetPath && <AssetPreview path={assetPath} revision={assetRevision} />}
                                        <div hidden={Boolean(assetPath)} className={assetPath ? 'hidden' : 'flex min-h-0 flex-1 flex-col overflow-hidden'}>
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
                                                onForwardSync={compiler.pdfPath ? showInPdf : undefined}
                                                fontSize={appearance.fontSize}
                                                wordWrap={appearance.wordWrap}
                                                theme={appearance.theme}
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
                                </div>
                            </Panel>

                            <Separator className={`${view === 'split' ? 'w-1' : 'hidden'} bg-slate-800/10 hover:bg-blue-600/20 transition-colors cursor-col-resize active:bg-blue-600/40`} />

                            {/* Right Preview Area */}
                            <Panel id="preview" collapsible defaultSize="40%" minSize="20%">
                                <div hidden={!showPreview} className={showPreview ? "h-full w-full bg-slate-950" : 'hidden'}>
                                    <PDFPreview
                                        pdfPath={compiler.pdfPath}
                                        pdfRevision={compiler.pdfRevision}
                                        compiling={status === 'Compiling...'}
                                        error={documents.error || projectError || compiler.error}
                                        location={pdfLocation}
                                        onSource={showSource}
                                    />
                                </div>
                            </Panel>
                        </Group>
                    </div>

                    {/* Live Status Footer */}
                    <footer className={`h-6 shrink-0 flex items-center px-4 transition-colors duration-300 ${status === 'Error' ? 'bg-red-900' :
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
                            <div className="ml-auto max-w-[60%] truncate text-[10px] text-white/50 font-mono">
                                {status === 'Ready' ? "Changes synced to disk" : status === 'Compiling...' ? compiler.activity : null}
                            </div>
                        )}
                    </footer>
                </>
            )}
            {preferencesOpen && <dialog ref={preferencesDialog} aria-labelledby="preferences-title" onCancel={() => setPreferencesOpen(false)} className="m-auto rounded-lg border border-slate-600 bg-slate-900 p-6 text-slate-100 backdrop:bg-black/60" style={{ width: 'min(24rem, calc(100vw - 2rem))' }}>
                <h2 id="preferences-title" className="mb-5 text-lg font-semibold">Preferences</h2>
                <div className="flex flex-col gap-4 text-sm">
                    <label className="flex items-center justify-between gap-4">Theme<select value={appearance.theme} onChange={event => setWorkspace(previous => ({ ...previous, appearance: { ...previous.appearance, theme: event.target.value as 'dark' | 'light' } }))} className="rounded border border-slate-600 bg-slate-950 px-2 py-1"><option value="dark">Dark</option><option value="light">Light</option></select></label>
                    <label className="flex items-center justify-between gap-4">Editor font size<input type="number" min={10} max={24} value={appearance.fontSize} onChange={event => setWorkspace(previous => ({ ...previous, appearance: { ...previous.appearance, fontSize: Math.max(10, Math.min(24, Number(event.target.value) || 14)) } }))} className="w-20 rounded border border-slate-600 bg-slate-950 px-2 py-1" /></label>
                    <label className="flex items-center justify-between gap-4">Word wrap<input type="checkbox" checked={appearance.wordWrap} onChange={event => setWorkspace(previous => ({ ...previous, appearance: { ...previous.appearance, wordWrap: event.target.checked } }))} /></label>
                    <button onClick={() => setPreferencesOpen(false)} className="mt-2 self-end rounded border border-slate-600 px-3 py-2">Done</button>
                </div>
            </dialog>}
        </div>
    );
}

export default App;
