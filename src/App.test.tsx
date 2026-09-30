import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
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
        invoke.mockImplementation(async (command: string) => {
            if (command === "load_project" || command === "set_project_root") {
                return { path: "/project", root_file: "/project/main.tex", tex_files: ["/project/main.tex", "/project/chapter.tex"] };
            }
            if (command === "read_file_content") return "Root document";
            if (command === "compile_preview") return "/project/main.pdf";
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
        expect(builds).toEqual([["compile_preview", { filePath: "/project/main.tex" }]]);
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
        expect(invoke).toHaveBeenCalledWith("save_file", { path: "/project/references.bib", content: "Updated bibliography" });
        expect(invoke.mock.calls.filter(([command]) => command === "compile_preview").slice(-1)[0])
            .toEqual(["compile_preview", { filePath: "/project/main.tex" }]);
    });
});