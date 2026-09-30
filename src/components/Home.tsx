import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen, X, Loader2, FilePlus, FileArchive } from 'lucide-react';
import { ProjectInfo } from '../lib/project';

interface HomeProps {
    onProjectSelect: (path: string) => void | Promise<void>;
    recentProjects?: string[];
    onForgetProject?: (path: string) => void;
}

const Home = ({ onProjectSelect, recentProjects = [], onForgetProject }: HomeProps) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newProject, setNewProject] = useState<{ parent: string; name: string; template: string; archive?: string } | null>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (newProject && dialog.current && !dialog.current.open) dialog.current.showModal();
    }, [Boolean(newProject)]);

    const beginProject = async (importZip: boolean) => {
        setBusy(true);
        setError(null);
        try {
            const archive = importZip ? await open({ title: 'Import Overleaf ZIP', filters: [{ name: 'ZIP project', extensions: ['zip'] }], multiple: false }) : null;
            if (importZip && typeof archive !== 'string') return;
            const parent = await open({ title: 'Choose a parent folder for the project', directory: true, multiple: false });
            if (typeof parent === 'string') setNewProject({ parent, name: typeof archive === 'string' ? (archive.split(/[/\\]/).pop() || 'Project').replace(/\.zip$/i, '') : 'Untitled Project', template: 'article', archive: typeof archive === 'string' ? archive : undefined });
        } catch (failure) { setError(String(failure)); }
        finally { setBusy(false); }
    };

    const createProject = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!newProject || !newProject.name.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const project = newProject.archive
                ? await invoke<ProjectInfo>('import_project', { archivePath: newProject.archive, parentPath: newProject.parent, name: newProject.name })
                : await invoke<ProjectInfo>('create_project', { parentPath: newProject.parent, name: newProject.name, template: newProject.template });
            await onProjectSelect(project.path);
            setNewProject(null);
        } catch (failure) { setError(String(failure)); }
        finally { setBusy(false); }
    };
    const handleOpenProject = async () => {
        try {
            setBusy(true);
            setError(null);
            const selected = await open({
                directory: true,
                multiple: false,
                title: 'Open LaTeX Project'
            });

            if (selected && typeof selected === 'string') {
                await onProjectSelect(selected);
            }
        } catch (err) {
            setError(String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="min-h-0 w-full flex-1 overflow-auto bg-slate-950 px-6 py-10">
            <div className="mx-auto max-w-3xl">
                <header className="mb-8 flex items-center gap-4 border-b border-slate-800 pb-6">
                    <img src={new URL('../../src-tauri/icons/128x128.png', import.meta.url).href} alt="" width={48} height={48} />
                    <h1 className="text-3xl font-semibold text-white">Tiya</h1>
                </header>
                <div className="mb-8 flex flex-wrap items-center gap-3">
                <button onClick={() => void beginProject(false)} disabled={busy} className="flex items-center gap-2 rounded bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"><FilePlus size={18} />New Project</button>
                <button onClick={() => void handleOpenProject()} disabled={busy} className="flex items-center gap-2 rounded border border-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <FolderOpen size={18} />}
                    Open Project Folder
                </button>
                <button onClick={() => void beginProject(true)} disabled={busy} className="flex items-center gap-2 rounded border border-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"><FileArchive size={18} />Import ZIP</button>
                </div>
                {error && !newProject && <p role="alert" className="mb-4 break-words text-sm text-red-300">{error}</p>}
                <h2 className="mb-3 text-sm font-semibold text-slate-300">Recent projects</h2>
                {recentProjects.length ? <ul className="divide-y divide-slate-800 border-y border-slate-800">
                    {recentProjects.map(path => <li key={path} className="flex min-w-0 items-center gap-3 py-3">
                        <FolderOpen size={18} className="shrink-0 text-emerald-400" />
                        <button onClick={() => void onProjectSelect(path)} className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-sm text-slate-100">{path.split(/[/\\]/).pop()}</span>
                            <span className="block truncate text-xs text-slate-500">{path}</span>
                        </button>
                        <button title="Remove from recent projects" aria-label={`Remove ${path} from recent projects`} onClick={() => onForgetProject?.(path)} className="shrink-0 p-2 text-slate-400"><X size={14} /></button>
                    </li>)}
                </ul> : <p className="text-sm text-slate-500">No recent projects</p>}
            </div>
            {newProject && <dialog ref={dialog} aria-labelledby="project-dialog-title" onCancel={event => { if (busy) event.preventDefault(); else setNewProject(null); }} className="m-auto max-w-lg rounded-lg border border-slate-600 bg-slate-900 p-6 text-slate-100 backdrop:bg-black/60" style={{ width: 'min(32rem, calc(100vw - 2rem))' }}>
                <form onSubmit={event => void createProject(event)} className="flex flex-col gap-4">
                    <h2 id="project-dialog-title" className="text-lg font-semibold">{newProject.archive ? 'Import project' : 'New project'}</h2>
                    <label className="flex flex-col gap-1 text-sm">Project name<input autoFocus required value={newProject.name} onChange={event => setNewProject({ ...newProject, name: event.target.value })} className="rounded border border-slate-600 bg-slate-950 px-3 py-2" /></label>
                    {!newProject.archive && <label className="flex flex-col gap-1 text-sm">Template<select value={newProject.template} onChange={event => setNewProject({ ...newProject, template: event.target.value })} className="rounded border border-slate-600 bg-slate-950 px-3 py-2">
                        <option value="article">Article</option><option value="report">Report</option><option value="cv">CV</option><option value="presentation">Presentation</option>
                    </select></label>}
                    <div className="break-words text-xs text-slate-400">{newProject.parent}</div>
                    {error && <p role="alert" className="break-words text-sm text-red-300">{error}</p>}
                    <div className="flex justify-end gap-3">
                        <button type="button" disabled={busy} onClick={() => setNewProject(null)} className="px-3 py-2 text-sm">Cancel</button>
                        <button type="submit" disabled={busy} className="flex items-center gap-2 rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />}{newProject.archive ? 'Import' : 'Create'}</button>
                    </div>
                </form>
            </dialog>}
        </main>
    );
};

export default Home;
