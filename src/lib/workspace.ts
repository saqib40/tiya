export interface ProjectSession {
    files: string[];
    activeFile: string;
}

export interface WorkspaceState {
    recentProjects: string[];
    lastProject: string | null;
    sessions: Record<string, ProjectSession>;
    automaticCompile: boolean;
    compilerBackend: 'tectonic' | 'pdflatex';
    appearance: WorkspaceAppearance;
}

export interface WorkspaceAppearance {
    theme: 'dark' | 'light';
    fontSize: number;
    wordWrap: boolean;
    view: 'split' | 'editor' | 'preview' | 'files';
    sidebar: boolean;
    layout: { files: number; editor: number; preview: number };
}

const key = "tiya.workspace.v1";

export function readWorkspace(): WorkspaceState {
    const fallback: WorkspaceState = { recentProjects: [], lastProject: null, sessions: {}, automaticCompile: true, compilerBackend: 'tectonic', appearance: { theme: 'dark', fontSize: 14, wordWrap: true, view: 'split', sidebar: true, layout: { files: 20, editor: 40, preview: 40 } } };
    try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        if (!value || typeof value !== "object") return fallback;
        const recentProjects = Array.isArray(value.recentProjects) ? value.recentProjects.filter((path: unknown) => typeof path === "string").slice(0, 10) : [];
        const sessions: Record<string, ProjectSession> = {};
        for (const path of recentProjects) {
            const session = value.sessions?.[path];
            if (session && Array.isArray(session.files) && typeof session.activeFile === "string") {
                sessions[path] = { files: session.files.filter((file: unknown) => typeof file === "string"), activeFile: session.activeFile };
            }
        }
        const appearance = value.appearance || {};
        const layout = appearance.layout;
        const validLayout = layout && ['files', 'editor', 'preview'].every(panel => Number.isFinite(layout[panel]) && layout[panel] > 0) && Math.abs(layout.files + layout.editor + layout.preview - 100) < 0.1;
        return { recentProjects, sessions, lastProject: typeof value.lastProject === "string" ? value.lastProject : null, automaticCompile: value.automaticCompile !== false, compilerBackend: value.compilerBackend === 'pdflatex' ? 'pdflatex' : 'tectonic', appearance: {
            theme: appearance.theme === 'light' ? 'light' : 'dark',
            fontSize: Number.isFinite(appearance.fontSize) ? Math.max(10, Math.min(24, Math.round(appearance.fontSize))) : 14,
            wordWrap: appearance.wordWrap !== false,
            view: ['split', 'editor', 'preview', 'files'].includes(appearance.view) ? appearance.view : 'split',
            sidebar: appearance.sidebar !== false,
            layout: validLayout ? { files: layout.files, editor: layout.editor, preview: layout.preview } : fallback.appearance.layout,
        } };
    } catch { return fallback; }
}

export function saveWorkspace(workspace: WorkspaceState) {
    localStorage.setItem(key, JSON.stringify(workspace));
}

export function rememberProject(workspace: WorkspaceState, path: string): WorkspaceState {
    const recentProjects = [path, ...workspace.recentProjects.filter(project => project !== path)].slice(0, 10);
    return { ...workspace, recentProjects, lastProject: path, sessions: Object.fromEntries(Object.entries(workspace.sessions).filter(([project]) => recentProjects.includes(project))) };
}

export function rememberSession(workspace: WorkspaceState, project: string, files: string[], activeFile: string): WorkspaceState {
    const previous = workspace.sessions[project];
    if (previous?.activeFile === activeFile && previous.files.length === files.length && previous.files.every((file, index) => file === files[index])) return workspace;
    return { ...workspace, sessions: { ...workspace.sessions, [project]: { files, activeFile } } };
}