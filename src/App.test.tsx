import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { parseDiagnostics } from "./lib/diagnostics";
import { readWorkspace, rememberProject, saveWorkspace } from "./lib/workspace";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => vi.fn()) }));
vi.mock("@tauri-apps/api/window", () => ({
    getCurrentWindow: () => ({ onCloseRequested: vi.fn(async () => vi.fn()), close: vi.fn() }),
}));
vi.mock("react-resizable-panels", () => ({
    Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Separator: () => null,
}));
vi.mock("./components/TitleBar", () => ({ default: () => null }));
vi.mock("./components/Home", () => ({
    default: ({ onProjectSelect }: { onProjectSelect: (path: string) => void }) =>
        <button onClick={() => onProjectSelect("/project")}>Open project</button>,
}));
vi.mock("./components/Sidebar", () => ({
    default: ({ onFileSelect }: { onFileSelect: (path: string, content: string) => void }) => <>
        <button onClick={() => onFileSelect("/project/main.tex", "Root document")}>Open root</button>
        <button onClick={() => onFileSelect("/project/chapter.tex", "Chapter")}>Open chapter</button>
        <button onClick={() => onFileSelect("/project/references.bib", "Bibliography")}>Open bibliography</button>
    </>,
}));
vi.mock("./components/CodeEditor", () => ({
    default: ({ code, onChange, onSave }: { code: string; onChange: (value: string) => void; onSave: () => void }) => <>
        <textarea aria-label="Source" value={code} onChange={event => onChange(event.target.value)} />
        <button onClick={onSave}>Save source</button>
    </>,
}));
vi.mock("./components/PDFPreview", () => ({
    default: ({ pdfPath }: { pdfPath: string | null }) => <div>PDF: {pdfPath}</div>,
}));

describe("project compilation", () => {
    beforeEach(() => {
        invoke.mockImplementation(async (command: string, payload?: { requestedPath?: string }) => {
            if (command === "load_project" || command === "set_project_root") {
                return { path: "/project", root_file: "/project/main.tex", tex_files: ["/project/main.tex", "/project/chapter.tex"] };
            }
            if (command === "read_file_content") return "Root document";
            if (command === "resolve_project_file") return payload?.requestedPath;
            if (command === "compile_preview") return { pdf_path: "/project/main.pdf", log: "Success" };
            if (command === "cancel_compile") return;
            if (command === "save_file") return;
            throw new Error(`Unexpected command: ${command}`);
        });
    });

    it("opens the detected root and keeps its PDF when navigating to a chapter", async () => {
        render(<App />);
        fireEvent.click(screen.getByRole("button", { name: "Open project" }));
        await screen.findByText("PDF: /project/main.pdf");
        expect(screen.getByRole("combobox", { name: "Root document" })).toHaveValue("/project/main.tex");

        fireEvent.click(screen.getByRole("button", { name: "Open chapter" }));
        await screen.findByDisplayValue("Chapter");

        expect(screen.getByText("PDF: /project/main.pdf")).toBeInTheDocument();
        const builds = invoke.mock.calls.filter(([command]) => command === "compile_preview");
        expect(builds).toEqual([["compile_preview", { filePath: "/project/main.tex", requestId: expect.any(String) }]]);
    });

    it("rebuilds the root after saving bibliography changes", async () => {
        render(<App />);
        fireEvent.click(screen.getByRole("button", { name: "Open project" }));
        await screen.findByText("PDF: /project/main.pdf");
        fireEvent.click(screen.getByRole("button", { name: "Open bibliography" }));
        await screen.findByDisplayValue("Bibliography");
        fireEvent.change(screen.getByRole("textbox", { name: "Source" }), { target: { value: "Updated bibliography" } });
        fireEvent.click(screen.getByRole("button", { name: "Save source" }));

        await waitFor(() => {
            expect(invoke.mock.calls.filter(([command]) => command === "compile_preview")).toHaveLength(2);
        });
        expect(invoke).toHaveBeenCalledWith("save_file", { path: "/project/references.bib", content: "Updated bibliography", expectedContent: "Bibliography" });
        expect(invoke.mock.calls.filter(([command]) => command === "compile_preview").slice(-1)[0])
            .toEqual(["compile_preview", { filePath: "/project/main.tex", requestId: expect.any(String) }]);
    });

    it("opens a diagnostic source through project-scoped resolution", async () => {
        const normalInvoke = invoke.getMockImplementation()!;
        invoke.mockImplementation(async (command, payload) => {
            if (command === "compile_preview") throw "Compilation failed.\nerror: chapter.tex:7: Undefined control sequence";
            if (command === "resolve_project_file") return "/project/chapter.tex";
            return normalInvoke(command, payload);
        });
        render(<App />);
        fireEvent.click(screen.getByRole("button", { name: "Open project" }));
        fireEvent.click(await screen.findByRole("button", { name: "chapter.tex:7 Undefined control sequence" }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith("resolve_project_file", {
            projectPath: "/project", rootFile: "/project/main.tex", requestedPath: "chapter.tex",
        }));
        expect(invoke).toHaveBeenCalledWith("read_file_content", { path: "/project/chapter.tex" });
    });

    it("recognizes Windows paths, columns, warnings, and duplicate diagnostics", () => {
        const message = "error: C:\\My Papers\\paper.tex:12:3: Undefined control sequence";
        expect(parseDiagnostics(`${message}\n${message}\nwarning: chapter.tex:4: Missing reference`)).toEqual([
            { file: "C:\\My Papers\\paper.tex", line: 12, column: 3, message: "Undefined control sequence", severity: "error" },
            { file: "chapter.tex", line: 4, column: 1, message: "Missing reference", severity: "warning" },
        ]);
    });

    it("allows file navigation without discarding a conflicting buffer", async () => {
        const normalInvoke = invoke.getMockImplementation()!;
        invoke.mockImplementation(async (command, payload) => {
            if (command === "save_file") throw { message: "File changed", disk_content: "External root" };
            return normalInvoke(command, payload);
        });
        render(<App />);
        fireEvent.click(screen.getByRole("button", { name: "Open project" }));
        await screen.findByDisplayValue("Root document");
        fireEvent.change(screen.getByRole("textbox", { name: "Source" }), { target: { value: "Local root edit" } });
        fireEvent.click(screen.getByRole("button", { name: "Open chapter" }));
        await screen.findByDisplayValue("Chapter");
        fireEvent.click(screen.getByRole("button", { name: "Open root" }));
        await screen.findByDisplayValue("Local root edit");
        expect(screen.getByRole("button", { name: "Use disk version" })).toBeInTheDocument();
    });

    it("restores the previous project's tabs and selected file", async () => {
        saveWorkspace({ ...rememberProject(readWorkspace(), "/project"), sessions: {
            "/project": { files: ["/project/main.tex", "/project/chapter.tex"], activeFile: "/project/chapter.tex" },
        } });
        render(<App />);
        await screen.findByRole("tab", { name: "chapter.tex" });
        expect(screen.getByRole("tab", { name: "chapter.tex" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "main.tex" })).toBeInTheDocument();
    });

    it("stores recent projects and remembers manual build mode", async () => {
        render(<App />);
        fireEvent.click(screen.getByRole("button", { name: "Open project" }));
        await screen.findByRole("tab", { name: "main.tex" });
        fireEvent.click(screen.getByRole("checkbox", { name: "Auto build" }));
        expect(readWorkspace().automaticCompile).toBe(false);
        fireEvent.click(screen.getByRole("button", { name: "Close project" }));
        await screen.findByRole("button", { name: "Open project" });
        await waitFor(() => expect(readWorkspace().lastProject).toBeNull());
        expect(readWorkspace().recentProjects).toEqual(["/project"]);
    });
});