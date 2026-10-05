import { FormEvent, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Search, X } from "lucide-react";
import { relativePath } from "../lib/project";

export interface ProjectSearchMatch {
    path: string;
    line: number;
    column: number;
    preview: string;
}

interface ProjectSearchProps {
    projectPath: string;
    onSelect: (match: ProjectSearchMatch) => void;
    onClose: () => void;
}

export default function ProjectSearch({ projectPath, onSelect, onClose }: ProjectSearchProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ProjectSearchMatch[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (query.trim().length < 2) return;
        setSearching(true);
        setError(null);
        try {
            setResults(await invoke<ProjectSearchMatch[]>("search_project", { projectPath, query: query.trim() }));
            setSearched(true);
        } catch (failure) {
            setError(String(failure));
        } finally {
            setSearching(false);
        }
    };

    return <div role="dialog" aria-modal="true" aria-labelledby="project-search-title" className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[10vh]" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
                <h2 id="project-search-title" className="font-semibold text-slate-100">Search project</h2>
                <button type="button" title="Close search" aria-label="Close search" onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={17} /></button>
            </div>
            <form role="search" onSubmit={submit} className="flex gap-2 border-b border-slate-800 p-3">
                <input autoFocus type="search" aria-label="Search project" value={query} onChange={event => setQuery(event.target.value)} placeholder="Text in .tex, .bib, .sty, and .cls files" className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500" />
                <button type="submit" disabled={query.trim().length < 2 || searching} className="flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Search
                </button>
            </form>
            <div className="min-h-24 overflow-auto p-2">
                {error && <p role="alert" className="px-2 py-3 text-sm text-red-300">{error}</p>}
                {!error && searched && results.length === 0 && <p className="px-2 py-3 text-sm text-slate-400">No matches found.</p>}
                {results.map(match => <button key={`${match.path}:${match.line}:${match.column}`} type="button" onClick={() => onSelect(match)} aria-label={`${relativePath(projectPath, match.path)}:${match.line} ${match.preview}`} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-800">
                    <span className="block text-xs font-semibold text-blue-300">{relativePath(projectPath, match.path)}:{match.line}</span>
                    <span className="block truncate text-sm text-slate-300">{match.preview}</span>
                </button>)}
            </div>
        </div>
    </div>;
}
