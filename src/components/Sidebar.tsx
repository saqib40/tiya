import { useState, useEffect, useCallback, useRef } from "react";
import { Folder, Plus, FileText, FilePlus, FolderPlus, Trash2, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
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

const FileTreeItem = ({
    node,
    depth = 0,
    selectedPath,
    onSelect,
    onOpen,
    onRefresh
}: {
    node: FileNode;
    depth?: number;
    selectedPath: string | null;
    onSelect: (path: string, isDir: boolean) => void;
    onOpen: (path: string) => void;
    onRefresh: () => void;
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [children, setChildren] = useState<FileNode[]>([]);
    const [loading, setLoading] = useState(false);

    const isSelected = selectedPath === node.path;

    const toggleExpand = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!node.is_dir) return;

        const nextExpanded = !isExpanded;
        setIsExpanded(nextExpanded);

        if (nextExpanded && children.length === 0) {
            await loadChildren();
        }
    };

    const loadChildren = async () => {
        setLoading(true);
        try {
            const result: FileNode[] = await invoke("open_directory", { path: node.path });
            // Sort: Directories first, then files
            setChildren(result.sort((a, b) => {
                if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                return a.is_dir ? -1 : 1;
            }));
        } catch (error) {
            console.error("Failed to load children:", error);
        } finally {
            setLoading(false);
        }
    };

    // Re-load if refreshed from parent
    useEffect(() => {
        if (isExpanded) {
            loadChildren();
        }
    }, [isExpanded]);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(node.path, node.is_dir);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.is_dir) {
            toggleExpand(e);
        } else {
            onOpen(node.path);
        }
    };

    return (
        <div className="select-none">
            <div
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-sm cursor-pointer group transition-colors text-xs",
                    isSelected
                        ? "bg-slate-800 text-blue-400"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
                <div className="w-4 h-4 flex items-center justify-center">
                    {node.is_dir ? (
                        <div onClick={toggleExpand}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                    ) : null}
                </div>

                {node.is_dir ? (
                    <Folder size={14} className={isSelected ? "text-blue-400" : "text-blue-500/70"} />
                ) : (
                    <FileText size={14} className={isSelected ? "text-blue-400" : "text-orange-500/70"} />
                )}

                <span className="truncate flex-1">{node.name}</span>

                {loading && <Loader2 size={10} className="animate-spin opacity-50" />}
            </div>

            {isExpanded && (
                <div className="flex flex-col">
                    {children.length === 0 && !loading ? (
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
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

const Sidebar = ({ initialPath, onProjectSelect, onFileSelect }: SidebarProps) => {
    const [rootFiles, setRootFiles] = useState<FileNode[]>([]);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [selectedIsDir, setSelectedIsDir] = useState(false);
    const [loading, setLoading] = useState(false);

    // Inline Creation State
    const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null);
    const [newName, setNewName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const loadRoot = useCallback(async (path: string) => {
        setLoading(true);
        try {
            const result: FileNode[] = await invoke("open_directory", { path });
            setRootFiles(result.sort((a, b) => {
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
    }, [initialPath, loadRoot]);

    useEffect(() => {
        if (isCreating && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isCreating]);

    const handleOpenProject = async () => {
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
    };

    const handleFileOpen = async (path: string) => {
        try {
            const content: string = await invoke("read_file_content", { path });
            onFileSelect(path, content);
        } catch (error) {
            console.error("Failed to read file:", error);
        }
    };

    const handleCreateSubmit = async () => {
        if (!newName || !initialPath) {
            setIsCreating(null);
            setNewName("");
            return;
        }

        const targetBase = selectedIsDir ? selectedPath! : initialPath;
        const finalPath = `${targetBase}/${newName}`;

        try {
            if (isCreating === 'file') {
                const fileName = newName.endsWith('.tex') ? newName : `${newName}.tex`;
                await invoke("create_file", { path: `${targetBase}/${fileName}` });
            } else {
                await invoke("create_directory", { path: finalPath });
            }

            // Refresh
            loadRoot(initialPath);
        } catch (error) {
            console.error("Creation failed:", error);
        } finally {
            setIsCreating(null);
            setNewName("");
        }
    };

    const handleDelete = async () => {
        if (!selectedPath) return;

        const fileName = selectedPath.split(/[/\\]/).pop();
        if (window.confirm(`Are you sure you want to delete "${fileName}"?`)) {
            try {
                await invoke("delete_node", { path: selectedPath });
                setSelectedPath(null);
                if (initialPath) loadRoot(initialPath);
            } catch (error) {
                console.error("Deletion failed:", error);
            }
        }
    };

    return (
        <div className="h-full bg-slate-950 border-r border-slate-900 flex flex-col pt-2 overflow-hidden">
            {/* Toolbar Header */}
            <div className="px-4 py-2 flex items-center justify-between border-b border-slate-900 mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Explorer</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsCreating('file')}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors rounded-sm"
                        title="New File (.tex)"
                    >
                        <FilePlus size={14} />
                    </button>
                    <button
                        onClick={() => setIsCreating('folder')}
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
                    className="w-full flex items-center justify-between group px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-blue-500/30 transition-all duration-300"
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
            <div className="flex-1 overflow-y-auto px-1 custom-scrollbar">
                {isCreating && (
                    <div className="px-3 py-1 mb-1">
                        <div className="flex items-center gap-2 bg-slate-900 border border-blue-500/50 rounded-sm px-2 py-1">
                            {isCreating === 'file' ? <FileText size={12} className="text-blue-400" /> : <Folder size={12} className="text-blue-400" />}
                            <input
                                ref={inputRef}
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateSubmit();
                                    if (e.key === 'Escape') setIsCreating(null);
                                }}
                                onBlur={handleCreateSubmit}
                                placeholder={isCreating === 'file' ? "file.tex" : "folder name"}
                                className="bg-transparent border-none outline-none text-[11px] text-slate-200 w-full"
                            />
                        </div>
                    </div>
                )}

                {rootFiles.length === 0 && !loading ? (
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
                            onSelect={(path, isDir) => {
                                setSelectedPath(path);
                                setSelectedIsDir(isDir);
                            }}
                            onOpen={handleFileOpen}
                            onRefresh={() => initialPath && loadRoot(initialPath)}
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
