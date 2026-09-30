import { open } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { FolderOpen, X, Loader2 } from 'lucide-react';

interface HomeProps {
    onProjectSelect: (path: string) => void | Promise<void>;
    recentProjects?: string[];
    onForgetProject?: (path: string) => void;
}

const Home = ({ onProjectSelect, recentProjects = [], onForgetProject }: HomeProps) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
                <button onClick={() => void handleOpenProject()} disabled={busy} className="mb-8 flex items-center gap-2 rounded border border-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <FolderOpen size={18} />}
                    Open Project Folder
                </button>
                {error && <p role="alert" className="mb-4 break-words text-sm text-red-300">{error}</p>}
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
        </main>
    );
};

export default Home;
