import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import { Folder, Plus, FileText, FilePlus, FolderPlus, Trash2, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
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
    onProjectSelect: (path: string) => void;
    onFileSelect: (path: string, content: string) => void;
}

interface NewItemState {
    type: 'file' | 'folder';
    parentPath: string;
}

const FileTreeItem = memo(({
    node,
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
            const hideExts = ['aux', 'out', 'toc', 'synctex.gz', 'fls', 'fdb_latexmk', 'pdf'];
            const filtered = result.filter(f => {
                if (f.is_dir) return true;
                const name = f.name.toLowerCase();
                return !hideExts.some(ext => name.endsWith('.' + ext));
            });
            setChildren(filtered.sort((a, b) => {
                if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                return a.is_dir ? -1 : 1;
            }));
        } catch (error) {
            console.error("Failed to load children:", error);
        } finally {
            setLoading(false);
        }
    }, [node.path]);

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

const Sidebar = ({ initialPath, onProjectSelect, onFileSelect }: SidebarProps) => {
    const [rootFiles, setRootFiles] = useState<FileNode[]>([]);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [selectedIsDir, setSelectedIsDir] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isRootDragOver, setIsRootDragOver] = useState(false);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [newItem, setNewItem] = useState<NewItemState | null>(null);
    const [dragTargetId, setDragTargetId] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const loadRoot = useCallback(async (path: string) => {
        setLoading(true);
        try {
            const result: FileNode[] = await invoke("open_directory", { path });
            const hideExts = ['aux', 'out', 'toc', 'synctex.gz', 'fls', 'fdb_latexmk', 'pdf'];
            const filtered = result.filter(f => {
                if (f.is_dir) return true;
                const name = f.name.toLowerCase();
                return !hideExts.some(ext => name.endsWith('.' + ext));
            });
            setRootFiles(filtered.sort((a, b) => {
                if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                return a.is_dir ? -1 : 1;
            }));
        } catch (error) {
            console.error("Failed to open root directory:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (initialPath) {
            loadRoot(initialPath);
        }
    }, [initialPath, loadRoot, refreshKey]);

    // Real-Time Sync via Backend Watcher
    useEffect(() => {
        if (!initialPath) return;

        let unlisten: (() => void) | null = null;

        const setupWatcher = async () => {
            try {
                // 1. Start the recursive watcher in the backend
                await invoke("watch_directory", { path: initialPath });

                // 2. Listen for the 'fs-change' event emitted by the watcher thread
                unlisten = await listen("fs-change", () => {
                    console.log("FS Change detected, refreshing...");
                    // Increment refreshKey to trigger deep refresh
                    setRefreshKey(prev => prev + 1);
                });
            } catch (error) {
                console.error("Failed to setup file watcher:", error);
            }
        };

        setupWatcher();

        return () => {
            if (unlisten) unlisten();
        };
    }, [initialPath]);

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
        }
    }, [onProjectSelect]);

    const handleFileOpen = useCallback(async (path: string) => {
        try {
            const content: string = await invoke("read_file_content", { path });
            onFileSelect(path, content);
        } catch (error) {
            console.error("Failed to read file:", error);
        }
    }, [onFileSelect]);

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

        const finalPath = `${newItem.parentPath}/${name}`;

        try {
            if (newItem.type === 'file') {
                const fileName = name.endsWith('.tex') ? name : `${name}.tex`;
                await invoke("create_file", { path: `${newItem.parentPath}/${fileName}` });
            } else {
                await invoke("create_directory", { path: finalPath });
            }

            // Trigger deep refresh
            setRefreshKey(prev => prev + 1);
        } catch (error) {
            console.error("Creation failed:", error);
        } finally {
            setNewItem(null);
        }
    }, [newItem, initialPath]);

    const handleDelete = useCallback(async () => {
        if (!selectedPath || !initialPath) return;

        const fileName = selectedPath.split(/[/\\]/).pop();
        if (window.confirm(`Are you sure you want to delete "${fileName}"?`)) {
            try {
                await invoke("delete_node", { path: selectedPath });
                setSelectedPath(null);
                // Trigger deep refresh
                setRefreshKey(prev => prev + 1);
            } catch (error) {
                console.error("Deletion failed:", error);
            }
        }
    }, [selectedPath, initialPath]);

    const handleMove = useCallback(async (source: string, targetFolder: string) => {
        if (!initialPath) return;

        const fileName = source.split(/[/\\]/).pop();
        if (!fileName) return;

        const destination = `${targetFolder}/${fileName}`;

        if (source === destination) return;

        try {
            await invoke("move_node", { source, destination });
            // Trigger deep refresh
            setRefreshKey(prev => prev + 1);
        } catch (error) {
            console.error("Move failed:", error);
        }
    }, [initialPath]);

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
                    <button
                        onClick={() => handleNewItemInit('file')}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors rounded-sm"
                        title="New File (.tex)"
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
                        onClick={handleDelete}
                        disabled={!selectedPath}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors rounded-sm disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Root Action / Project Picker */}
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