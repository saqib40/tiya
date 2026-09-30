export interface ProjectInfo {
    path: string;
    root_file: string | null;
    tex_files: string[];
}

export function relativePath(project: string, path: string): string {
    const normalizedProject = project.replace(/\\/g, "/").replace(/\/$/, "");
    const normalizedPath = path.replace(/\\/g, "/");
    return normalizedPath.startsWith(`${normalizedProject}/`)
        ? normalizedPath.slice(normalizedProject.length + 1)
        : normalizedPath;
}