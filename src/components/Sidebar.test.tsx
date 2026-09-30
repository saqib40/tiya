import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar, { itemName } from "./Sidebar";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => vi.fn()) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), confirm: vi.fn(async () => true) }));

describe("safe project file operations", () => {
    beforeEach(() => invoke.mockImplementation(async command => command === "open_directory"
        ? [{ name: "main.tex", path: "/project/main.tex", is_dir: false }] : undefined));

    it("preserves explicit extensions and rejects unsafe names", () => {
        expect(itemName("references.bib", true)).toBe("references.bib");
        expect(itemName("custom.sty", true)).toBe("custom.sty");
        expect(itemName("chapter", true)).toBe("chapter.tex");
        expect(itemName(".latexmkrc", true)).toBe(".latexmkrc");
        for (const name of ["../outside", "sub/file", "CON", "..", "file."]) expect(() => itemName(name)).toThrow();
    });

    it("flushes buffers before renaming and reports the new path", async () => {
        const beforeMutation = vi.fn(async () => {});
        const onMutation = vi.fn(async () => {});
        render(<Sidebar initialPath="/project" onProjectSelect={vi.fn()} onFileSelect={vi.fn()} beforeMutation={beforeMutation} onMutation={onMutation} />);
        fireEvent.click(await screen.findByText("main.tex"));
        fireEvent.click(screen.getByRole("button", { name: "Rename" }));
        fireEvent.change(screen.getByRole("textbox", { name: "New name" }), { target: { value: "paper.tex" } });
        fireEvent.click(screen.getByRole("button", { name: "Apply rename" }));
        await waitFor(() => expect(onMutation).toHaveBeenCalledWith("/project/main.tex", "/project/paper.tex"));
        expect(beforeMutation).toHaveBeenCalledOnce();
        expect(invoke).toHaveBeenCalledWith("move_node", { source: "/project/main.tex", destination: "/project/paper.tex" });
    });

    it("shows failed mutations instead of silently logging them", async () => {
        invoke.mockImplementation(async command => {
            if (command === "open_directory") return [{ name: "main.tex", path: "/project/main.tex", is_dir: false }];
            if (command === "delete_node") throw "Trash is unavailable";
        });
        render(<Sidebar initialPath="/project" onProjectSelect={vi.fn()} onFileSelect={vi.fn()} />);
        fireEvent.click(await screen.findByText("main.tex"));
        fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Trash is unavailable");
    });

    it("stops the owned watcher when a project closes", async () => {
        const { unmount } = render(<Sidebar initialPath="/project" rootFile="/project/main.tex" onProjectSelect={vi.fn()} onFileSelect={vi.fn()} />);
        await waitFor(() => expect(invoke).toHaveBeenCalledWith("watch_directory", {
            path: "/project", rootFile: "/project/main.tex", watchId: expect.any(String),
        }));
        const watchId = invoke.mock.calls.find(([command]) => command === "watch_directory")![1].watchId;
        unmount();
        expect(invoke).toHaveBeenCalledWith("unwatch_directory", { watchId });
    });
});