import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import { Folder, Plus, FileText, FilePlus, FolderPlus, Trash2, ChevronRight, ChevronDown, Loader2, Pencil, X, Check, Upload } from "lucide-react";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cn } from "../lib/utils";

interface FileNode {
    name: string;
    path: string;
    is_dir: boolean;
    children?: FileNode[];
}

interface SidebarProps {
    initialPath?: string | null;
    rootFile?: string | null;
    onProjectSelect: (path: string) => void;
    onFileSelect: (path: string, content: string) => void;
    onAssetSelect?: (path: string) => void;
    beforeMutation?: () => Promise<void>;
    onMutation?: (source: string, destination: string | null) => Promise<void>;
    onFilesChanged?: (paths: string[]) => Promise<void>;
}

export function itemName(input: string, latexDefault = false) {
    const name = input.trim();
    if (!name || name === "." || name === ".." || /[\\/<>:"|?*\x00-\x1f]/.test(name) || name.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
        throw new Error("Enter a valid file or folder name");
    }
    return latexDefault && !name.includes(".") ? `${name}.tex` : name;
}

interface NewItemState {
    type: 'file' | 'folder';
    parentPath: string;
}

export function visibleProjectNode(node: FileNode, rootFile?: string | null) {
    if (node.name.startsWith('.tiya') || ['.git', 'node_modules', 'target'].includes(node.name)) return false;
    if (node.is_dir || !rootFile) return true;
    const stem = rootFile.replace(/\.tex$/i, '').replace(/\\/g, '/');
    const path = node.path.replace(/\\/g, '/');
    return !['pdf', 'log', 'aux', 'out', 'toc', 'synctex.gz', 'fls', 'fdb_latexmk'].some(extension => path === `${stem}.${extension}`);
}

const FileTreeItem = memo(({
    node,
    rootFile,
    depth = 0,
    selectedPath,
    onSelect,
    onOpen,
    onRefresh,
    onMove,
    expandedPaths,
    onToggleExpand,
    newItem,
    onNewItemSubmit,
    onNewItemCancel,
    dragTargetId,
    setDragTargetId,
    refreshKey
}: {
    node: FileNode;
    rootFile?: string | null;
    depth?: number;
    selectedPath: string | null;
    onSelect: (path: string, isDir: boolean) => void;
    onOpen: (path: string) => void;
    onRefresh: () => void;
    onMove: (source: string, targetFolder: string) => void;
    expandedPaths: Set<string>;
    onToggleExpand: (path: string) => void;
    newItem: NewItemState | null;
    onNewItemSubmit: (name: string) => void;
    onNewItemCancel: () => void;
    dragTargetId: string | null;
    setDragTargetId: (path: string | null) => void;
    refreshKey: number;
}) => {
    const [children, setChildren] = useState<FileNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [tempName, setTempName] = useState("");

    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selectedPath === node.path;
    const isCreatingHere = newItem?.parentPath === node.path;
    const isBeingDraggedOver = dragTargetId === node.path;

    const loadChildren = useCallback(async () => {
        setLoading(true);
        try {
            const result: FileNode[] = await invoke("open_directory", { path: node.path });
            const filtered = result.filter(file => visibleProjectNode(file, rootFile));
            setChildren(filtered.sort((a, b) => {
                if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                return a.is_dir ? -1 : 1;
            }));
        } catch (error) {
            console.error("Failed to load children:", error);
        } finally {
            setLoading(false);
        }
    }, [node.path, rootFile]);

    useEffect(() => {
        if (isExpanded) {
            loadChildren();
        }
    }, [isExpanded, loadChildren, refreshKey]);

    // Focus input when creating
    useEffect(() => {
        if (isCreatingHere && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isCreatingHere]);

    const handleToggle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.is_dir) {
            onToggleExpand(node.path);
        }
    }, [node.is_dir, node.path, onToggleExpand]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(node.path, node.is_dir);
    }, [node.path, node.is_dir, onSelect]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.is_dir) {
            onToggleExpand(node.path);
        } else {
            onOpen(node.path);
        }
    }, [node.is_dir, node.path, onToggleExpand, onOpen]);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        setIsDragging(true);
        e.dataTransfer.setData("sourcePath", node.path);
        e.dataTransfer.effectAllowed = "move";
    }, [node.path]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (!node.is_dir) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragTargetId(node.path);
    }, [node.is_dir, node.path, setDragTargetId]);

    const handleDragLeave = useCallback(() => {
        setDragTargetId(null);
    }, [setDragTargetId]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        if (!node.is_dir) return;
        e.preventDefault();
        setDragTargetId(null);
        const sourcePath = e.dataTransfer.getData("sourcePath");
        if (sourcePath && sourcePath !== node.path) {
            onMove(sourcePath, node.path);
        }
    }, [node.is_dir, node.path, onMove, setDragTargetId]);

    const handleInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onNewItemSubmit(tempName);
            setTempName("");
        } else if (e.key === 'Escape') {
            onNewItemCancel();
            setTempName("");
        }
    };

    return (
        <div className="select-none">
            <div
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                draggable={true}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-sm cursor-pointer group transition-all text-xs",
                    isSelected
                        ? "bg-slate-800 text-blue-400"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
                    isDragging && "opacity-30 cursor-grabbing bg-slate-800/20 shadow-inner",
                    isBeingDraggedOver && node.is_dir && "bg-blue-600/40 border-2 border-blue-500 scale-[1.02] shadow-[0_0_20px_rgba(37,99,235,0.3)] z-10"
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
                <div className="w-4 h-4 flex items-center justify-center">
                    {node.is_dir ? (
                        <div onClick={handleToggle}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                    ) : null}
                </div>

                {node.is_dir ? (
                    <Folder size={14} className={isSelected ? "text-blue-400" : "text-blue-500/70"} />
                ) : (
                    <FileText size={14} className={isSelected ? "text-blue-400" : "text-orange-500/70"} />
                )}

                <span className="truncate flex-1 font-medium">{node.name}</span>

                {loading && <Loader2 size={10} className="animate-spin opacity-50" />}
            </div>

            {isExpanded && (
                <div className="flex flex-col">
                    {/* Inline Creation Row */}
                    {isCreatingHere && (
                        <div
                            className="flex items-center gap-1.5 px-2 py-1"
                            style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
                        >
                            <div className="w-4 h-4 flex items-center justify-center" />
                            {newItem.type === 'file' ? (
                                <FileText size={14} className="text-blue-400/50" />
                            ) : (
                                <Folder size={14} className="text-blue-400/50" />
                            )}
                            <input
                                ref={inputRef}
                                type="text"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                onKeyDown={handleInputKeyDown}
                                onBlur={onNewItemCancel}
                                placeholder={newItem.type === 'file' ? "name.tex" : "folder name"}
                                className="bg-transparent text-slate-200 outline-none border border-blue-500/50 rounded px-1.5 w-full text-[11px] h-6 flex-1"
                                autoFocus
                            />
                        </div>
                    )}

                    {children.length === 0 && !loading && !isCreatingHere ? (
                        <div
                            className="text-[10px] text-slate-600 italic py-1"
                            style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                        >
                            Empty
                        </div>
                    ) : (
                        children.map(child => (
                            <FileTreeItem
                                key={child.path}
                                node={child}
                                rootFile={rootFile}
                                depth={depth + 1}
                                selectedPath={selectedPath}
                                onSelect={onSelect}
                                onOpen={onOpen}
                                onRefresh={onRefresh}
                                onMove={onMove}
                                expandedPaths={expandedPaths}
                                onToggleExpand={onToggleExpand}
                                newItem={newItem}
                                onNewItemSubmit={onNewItemSubmit}
                                onNewItemCancel={onNewItemCancel}
                                dragTargetId={dragTargetId}
                                setDragTargetId={setDragTargetId}
                                refreshKey={refreshKey}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
});

FileTreeItem.displayName = "FileTreeItem";

const Sidebar = ({ initialPath, rootFile, onProjectSelect, onFileSelect, onAssetSelect, beforeMutation, onMutation, onFilesChanged }: SidebarProps) => {
    const [rootFiles, setRootFiles] = useState<FileNode[]>([]);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [selectedIsDir, setSelectedIsDir] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isRootDragOver, setIsRootDragOver] = useState(false);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [newItem, setNewItem] = useState<NewItemState | null>(null);
    const [dragTargetId, setDragTargetId] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [rename, setRename] = useState<{ path: string; name: string } | null>(null);
    const [importing, setImporting] = useState(false);
    const onFilesChangedRef = useRef(onFilesChanged);
    const openRevision = useRef(0);
    useEffect(() => { onFilesChangedRef.current = onFilesChanged; }, [onFilesChanged]);

    useEffect(() => {
        openRevision.current += 1;
        setSelectedPath(null);
        setSelectedIsDir(false);
        setExpandedPaths(new Set());
        setNewItem(null);
        setRename(null);
        setError(null);
        setRootFiles([]);
    }, [initialPath]);

    const loadRoot = useCallback(async (path: string) => {
        setLoading(true);
        try {
            const result: FileNode[] = await invoke("open_directory", { path });
            const filtered = result.filter(file => visibleProjectNode(file, rootFile));
            setRootFiles(filtered.sort((a, b) => {
                if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                return a.is_dir ? -1 : 1;
            }));
        } catch (error) {
            console.error("Failed to open root directory:", error);
            setError(String(error));
        } finally {
            setLoading(false);
        }
    }, [rootFile]);

    useEffect(() => {
        if (initialPath) {
            loadRoot(initialPath);
        }
    }, [initialPath, loadRoot, refreshKey]);

    // Real-Time Sync via Backend Watcher
    useEffect(() => {
        if (!initialPath) return;

        const watchId = crypto.randomUUID();
        let disposed = false;
        let started = false;
        let unlisten: (() => void) | undefined;
        let refreshTimer: ReturnType<typeof setTimeout> | undefined;
        const changes = new Set<string>();
        const setupWatcher = async () => {
            try {
                unlisten = await listen<{ watch_id: string; paths: string[]; error?: string }>("fs-change", ({ payload }) => {
                    if (disposed || payload.watch_id !== watchId) return;
                    if (payload.error) { setError(payload.error); return; }
                    payload.paths.forEach(path => changes.add(path));
                    clearTimeout(refreshTimer);
                    refreshTimer = setTimeout(() => {
                        const paths = [...changes];
                        changes.clear();
                        setRefreshKey(value => value + 1);
                        void onFilesChangedRef.current?.(paths).catch(failure => setError(String(failure)));
                    }, 200);
                });
                if (disposed) { unlisten(); return; }
                await invoke("watch_directory", { path: initialPath, rootFile: rootFile ?? null, watchId });
                started = true;
                if (disposed) await invoke("unwatch_directory", { watchId });
            } catch (error) {
                if (!disposed) setError(`File watching is unavailable: ${String(error)}`);
            }
        };

        setupWatcher();

        return () => {
            disposed = true;
            clearTimeout(refreshTimer);
            unlisten?.();
            if (started) void invoke("unwatch_directory", { watchId }).catch(() => undefined);
        };
    }, [initialPath, rootFile]);

    const handleOpenProject = useCallback(async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
            });

            if (selected && typeof selected === "string") {
                onProjectSelect(selected);
            }
        } catch (error) {
            console.error("Failed to open directory picker:", error);
            setError(String(error));
        }
    }, [onProjectSelect]);

    const handleFileOpen = useCallback(async (path: string) => {
        const revision = ++openRevision.current;
        try {
            setError(null);
            if (/\.(pdf|png|jpe?g|gif|webp|bmp|svg)$/i.test(path) && onAssetSelect) {
                onAssetSelect(path);
                return;
            }
            const content: string = await invoke("read_file_content", { path });
            if (revision === openRevision.current) onFileSelect(path, content);
        } catch (error) {
            console.error("Failed to read file:", error);
            setError(String(error));
        }
    }, [onFileSelect, onAssetSelect]);

    const handleImport = async () => {
        if (!initialPath) return;
        const parent = selectedIsDir && selectedPath ? selectedPath : initialPath;
        setImporting(true);
        setError(null);
        try {
            const selected = await open({ title: 'Import files', multiple: true, directory: false });
            for (const source of typeof selected === 'string' ? [selected] : selected || []) {
                const name = itemName(source.split(/[/\\]/).pop() || '');
                const destination = `${parent}/${name}`;
                try { await invoke('import_file', { source, destination }); }
                catch (failure) { throw new Error(`${name}: ${String(failure)}`); }
                await onMutation?.(destination, destination);
            }
        } catch (failure) { setError(String(failure)); }
        finally { setImporting(false); setRefreshKey(value => value + 1); }
    };

    const handleNewItemInit = useCallback((type: 'file' | 'folder') => {
        if (!initialPath) return;

        const parentPath = (selectedIsDir ? selectedPath : initialPath) || initialPath;

        setNewItem({ type, parentPath });

        // Auto-expand the parent folder
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (parentPath) next.add(parentPath);
            return next;
        });
    }, [initialPath, selectedIsDir, selectedPath]);

    const handleNewItemSubmit = useCallback(async (name: string) => {
        if (!newItem || !name || !initialPath) {
            setNewItem(null);
            return;
        }

        try {
            const fileName = itemName(name, newItem.type === 'file');
            const finalPath = `${newItem.parentPath}/${fileName}`;
            setError(null);
            if (newItem.type === 'file') {
                await invoke("create_file", { path: finalPath });
            } else {
                await invoke("create_directory", { path: finalPath });
            }
            await onMutation?.(finalPath, finalPath);

            // Trigger deep refresh
            setRefreshKey(prev => prev + 1);
        } catch (error) {
            console.error("Creation failed:", error);
            setError(String(error));
        } finally {
            setNewItem(null);
        }
    }, [newItem, initialPath, onMutation]);

    const handleDelete = useCallback(async () => {
        if (!selectedPath || !initialPath) return;

        const fileName = selectedPath.split(/[/\\]/).pop();
        try {
            if (await confirm(`Move "${fileName}" to Trash?`, { title: "Move to Trash", kind: "warning" })) {
                await beforeMutation?.();
                setError(null);
                await invoke("delete_node", { path: selectedPath });
                await onMutation?.(selectedPath, null);
                setSelectedPath(null);
                // Trigger deep refresh
                setRefreshKey(prev => prev + 1);
            }
        } catch (error) {
            setError(String(error));
        }
    }, [selectedPath, initialPath, beforeMutation, onMutation]);

    const handleMove = useCallback(async (source: string, targetFolder: string) => {
        if (!initialPath) return;

        const fileName = source.split(/[/\\]/).pop();
        if (!fileName) return;

        const destination = `${targetFolder}/${fileName}`;

        if (source === destination) return;

        try {
            await beforeMutation?.();
            setError(null);
            await invoke("move_node", { source, destination });
            await onMutation?.(source, destination);
            // Trigger deep refresh
            setRefreshKey(prev => prev + 1);
        } catch (error) {
            console.error("Move failed:", error);
            setError(String(error));
        }
    }, [initialPath, beforeMutation, onMutation]);

    const handleRename = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!rename) return;
        try {
            const name = itemName(rename.name);
            const parent = rename.path.slice(0, Math.max(rename.path.lastIndexOf('/'), rename.path.lastIndexOf('\\')));
            const destination = `${parent}/${name}`;
            if (destination !== rename.path) {
                await beforeMutation?.();
                await invoke("move_node", { source: rename.path, destination });
                await onMutation?.(rename.path, destination);
                setSelectedPath(destination);
                setRefreshKey(value => value + 1);
            }
            setRename(null);
            setError(null);
        } catch (failure) {
            setError(String(failure));
        }
    };

    const handleToggleExpand = useCallback((path: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const handleRootDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragTargetId("root");
    }, []);

    const handleRootDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsRootDragOver(true);
    }, []);

    const handleRootDragLeave = useCallback(() => {
        setIsRootDragOver(false);
        setDragTargetId(null);
    }, []);

    const handleRootDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsRootDragOver(false);
        setDragTargetId(null);
        if (!initialPath) return;

        const sourcePath = e.dataTransfer.getData("sourcePath");
        if (sourcePath) {
            handleMove(sourcePath, initialPath);
        }
    }, [initialPath, handleMove]);

    const handleSelect = useCallback((path: string, isDir: boolean) => {
        setSelectedPath(path);
        setSelectedIsDir(isDir);
    }, []);

    const handleRefresh = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    return (
        <div className="h-full bg-slate-950 border-r border-slate-900 flex flex-col pt-2 overflow-hidden">
            {/* Toolbar Header */}
            <div className="px-4 py-2 flex items-center justify-between border-b border-slate-900 mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Explorer</span>
                <div className="flex items-center gap-1">
                    <button onClick={() => void handleImport()} disabled={importing} title="Import files" aria-label="Import files" className="p-1.5 text-slate-400 hover:text-white disabled:opacity-40"><Upload size={14} /></button>
                    <button
                        onClick={() => handleNewItemInit('file')}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors rounded-sm"
                        title="New File"
                    >
                        <FilePlus size={14} />
                    </button>
                    <button
                        onClick={() => handleNewItemInit('folder')}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors rounded-sm"
                        title="New Folder"
                    >
                        <FolderPlus size={14} />
                    </button>
                    <button
                        onClick={() => selectedPath && setRename({ path: selectedPath, name: selectedPath.split(/[/\\]/).pop() || "" })}
                        disabled={!selectedPath}
                        title="Rename"
                        aria-label="Rename"
                        className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20"
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={!selectedPath}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors rounded-sm disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Move to Trash"
                        aria-label="Move to Trash"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Root Action / Project Picker */}
            {error && <div role="alert" className="mx-3 mb-3 break-words text-xs text-red-300">{error}</div>}
            {rename && <form onSubmit={event => void handleRename(event)} className="mx-3 mb-3 flex min-w-0 items-center gap-1">
                <input aria-label="New name" autoFocus value={rename.name} onChange={event => setRename({ ...rename, name: event.target.value })} onKeyDown={event => { if (event.key === 'Escape') setRename(null); }} className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs" />
                <button type="submit" title="Apply rename" aria-label="Apply rename" className="p-1"><Check size={14} /></button>
                <button type="button" title="Cancel rename" aria-label="Cancel rename" onClick={() => setRename(null)} className="p-1"><X size={14} /></button>
            </form>}
            <div className="px-3 mb-4">
                <button
                    onClick={handleOpenProject}
                    onDragOver={handleRootDragOver}
                    onDragEnter={handleRootDragEnter}
                    onDragLeave={handleRootDragLeave}
                    onDrop={handleRootDrop}
                    className={cn(
                        "w-full flex items-center justify-between group px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-blue-500/30 transition-all duration-300",
                        (isRootDragOver || dragTargetId === "root") && "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                    )}
                >
                    <div className="flex items-center gap-2">
                        <Folder size={14} className="text-blue-500" />
                        <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-200 truncate max-w-[120px]">
                            {initialPath ? initialPath.split(/[/\\]/).pop() : "Open Project"}
                        </span>
                    </div>
                    <Plus size={12} className="text-slate-600 group-hover:text-blue-400" />
                </button>
            </div>

            {/* File Tree */}
            <div
                className="flex-1 overflow-y-auto px-1 custom-scrollbar"
                onDragOver={(e) => {
                    e.preventDefault();
                }}
                onDrop={(e) => {
                    if (e.target === e.currentTarget) {
                        handleRootDrop(e);
                    }
                }}
            >
                {/* Root Level Inline Creation */}
                {newItem && newItem.parentPath === initialPath && (
                    <div className="flex items-center gap-1.5 px-2 py-1">
                        <div className="w-4 h-4 flex items-center justify-center" />
                        {newItem.type === 'file' ? (
                            <FileText size={14} className="text-blue-400/50" />
                        ) : (
                            <Folder size={14} className="text-blue-400/50" />
                        )}
                        <input
                            type="text"
                            placeholder={newItem.type === 'file' ? "name.tex" : "folder name"}
                            className="bg-transparent text-slate-200 outline-none border border-blue-500/50 rounded px-1.5 w-full text-[11px] h-6 flex-1"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleNewItemSubmit(e.currentTarget.value);
                                if (e.key === 'Escape') setNewItem(null);
                            }}
                            onBlur={() => setNewItem(null)}
                        />
                    </div>
                )}

                {rootFiles.length === 0 && !loading && (!newItem || newItem.parentPath !== initialPath) ? (
                    <div className="h-32 flex flex-col items-center justify-center gap-2 opacity-20">
                        <Folder size={24} />
                        <span className="text-[10px] uppercase font-black tracking-tighter">Empty Project</span>
                    </div>
                ) : (
                    rootFiles.map(file => (
                        <FileTreeItem
                            key={file.path}
                            node={file}
                            rootFile={rootFile}
                            selectedPath={selectedPath}
                            onSelect={handleSelect}
                            onOpen={handleFileOpen}
                            onRefresh={handleRefresh}
                            onMove={handleMove}
                            expandedPaths={expandedPaths}
                            onToggleExpand={handleToggleExpand}
                            newItem={newItem}
                            onNewItemSubmit={handleNewItemSubmit}
                            onNewItemCancel={() => setNewItem(null)}
                            dragTargetId={dragTargetId}
                            setDragTargetId={setDragTargetId}
                            refreshKey={refreshKey}
                        />
                    ))
                )}
            </div>

            {/* Footer Info */}
            <div className="px-4 py-3 border-t border-slate-900 flex items-center justify-between bg-slate-950/50">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">System Active</span>
                </div>
                <span className="text-[9px] font-mono text-slate-700">V0.2.0</span>
            </div>
        </div>
    );
};

export default Sidebar;