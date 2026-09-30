export interface ProjectSession {
    files: string[];
    activeFile: string;
}

export interface WorkspaceState {
    recentProjects: string[];
    lastProject: string | null;
    sessions: Record<string, ProjectSession>;
    automaticCompile: boolean;
}

const key = "tiya.workspace.v1";

export function readWorkspace(): WorkspaceState {
    const fallback: WorkspaceState = { recentProjects: [], lastProject: null, sessions: {}, automaticCompile: true };
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
        return { recentProjects, sessions, lastProject: typeof value.lastProject === "string" ? value.lastProject : null, automaticCompile: value.automaticCompile !== false };
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