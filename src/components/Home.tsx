import { open } from '@tauri-apps/plugin-dialog';
import { PenTool, FolderOpen, FileText, MoveRight } from 'lucide-react';

interface HomeProps {
    onProjectSelect: (path: string) => void;
}

const Home = ({ onProjectSelect }: HomeProps) => {
    const handleOpenProject = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: 'Open LaTeX Project Folder'
            });

            if (selected && typeof selected === 'string') {
                onProjectSelect(selected);
            }
        } catch (err) {
            console.error('Failed to open directory:', err);
        }
    };

    return (
        <div
            className="h-full w-full bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden"
            style={{
                backgroundImage: 'radial-gradient(circle, #1e293b 1px, transparent 1px)',
                backgroundSize: '32px 32px'
            }}
        >
            {/* Decorative Glows */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />

            <div className="z-10 flex flex-col items-center text-center px-6 animate-in fade-in zoom-in-95 duration-700 ease-out">
                {/* Logo Icon */}
                <div className="relative mb-8 group">
                    <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-all duration-700" />
                    <div className="w-24 h-24 rounded-[2.5rem] bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center border border-white/10 shadow-2xl relative">
                        <PenTool size={48} className="text-blue-500" strokeWidth={1.5} />
                        <div className="absolute -right-2 -bottom-2 w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg border-4 border-slate-950">
                            <FileText size={18} className="text-white" />
                        </div>
                    </div>
                </div>

                {/* Text Content */}
                <h1 className="text-5xl font-black text-white mb-3 tracking-tighter">
                    Tiya<span className="text-blue-500">Editor</span>
                </h1>
                <p className="text-slate-400 text-lg font-medium max-w-md leading-relaxed mb-10">
                    A distraction-free, professional LaTeX environment designed for speed and clarity.
                </p>

                {/* Primary Action */}
                <button
                    onClick={handleOpenProject}
                    className="group relative px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all duration-300 shadow-[0_20px_40px_-15px_rgba(37,99,235,0.4)] hover:shadow-[0_25px_50px_-12px_rgba(37,99,235,0.6)] hover:-translate-y-1 active:scale-95 flex items-center gap-3"
                >
                    <FolderOpen size={20} />
                    Open Project Folder
                    <MoveRight size={18} className="transition-transform group-hover:translate-x-1" />
                </button>

                {/* Secondary Info */}
                <div className="mt-16 flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">
                    <div className="flex flex-col items-center gap-2">
                        <span className="text-slate-500">Live</span>
                        <span>Preview</span>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="flex flex-col items-center gap-2">
                        <span className="text-slate-500">Auto</span>
                        <span>Compile</span>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="flex flex-col items-center gap-2">
                        <span className="text-slate-500">Secure</span>
                        <span>Local</span>
                    </div>
                </div>
            </div>

            {/* Footer Branding */}
            <div className="absolute bottom-10 text-[10px] font-black uppercase tracking-[0.5em] text-slate-800 pointer-events-none">
                Developed for Academic Excellence
            </div>
        </div>
    );
};

export default Home;
