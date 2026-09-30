export interface Diagnostic {
    file: string;
    line: number;
    column: number;
    message: string;
    severity: "error" | "warning";
}

export interface EditorLocation {
    line: number;
    column: number;
    revision: number;
}

export function parseDiagnostics(output: string): Diagnostic[] {
    const diagnostics = new Map<string, Diagnostic>();
    for (const text of output.split(/\r?\n/)) {
        const match = text.trim().match(/^(?:(error|warning):\s*)?(.+?\.(?:tex|sty|cls|bib)):(\d+)(?::(\d+))?:\s*(.+)$/i);
        if (!match) continue;
        const [, level, file, line, column, message] = match;
        const diagnostic: Diagnostic = {
            file: file.replace(/^["']|["']$/g, ""),
            line: Math.max(1, Number(line)),
            column: Math.max(1, Number(column || 1)),
            message,
            severity: level?.toLowerCase() === "warning" ? "warning" : "error",
        };
        diagnostics.set(`${diagnostic.file}:${line}:${column}:${message}`, diagnostic);
    }
    return [...diagnostics.values()];
}