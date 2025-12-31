import { open } from '@tauri-apps/plugin-dialog';

interface HomeProps {
    onProjectSelect: (path: string) => void;
}

const Home = ({ onProjectSelect }: HomeProps) => {
    const handleOpenProject = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: 'Open LaTeX Project'
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
            className="h-full w-full bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden font-inter"
            style={{
                backgroundImage: 'radial-gradient(circle, #1e293b 1px, transparent 1px)',
                backgroundSize: '48px 48px'
            }}
        >
            <div className="z-10 flex flex-col items-center text-center px-6 animate-in fade-in duration-1000">
                <h1 className="text-8xl font-black text-white mb-12 tracking-tighter">
                    Tiya
                </h1>

                <button
                    onClick={handleOpenProject}
                    className="px-10 py-4 border border-slate-800 hover:border-white text-slate-400 hover:text-white rounded-full text-sm font-bold tracking-[0.2em] uppercase transition-all duration-500 hover:bg-white/5 active:scale-95"
                >
                    Open Project Folder
                </button>
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 blur-[160px] rounded-full pointer-events-none" />
        </div>
    );
};

export default Home;
