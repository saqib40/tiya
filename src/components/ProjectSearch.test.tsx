import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectSearch from "./ProjectSearch";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("project search", () => {
    beforeEach(() => invoke.mockResolvedValue([
        { path: "/project/chapters/intro.tex", line: 12, column: 4, preview: "A useful needle appears." },
    ]));

    it("searches the current project and opens a selected match", async () => {
        const onSelect = vi.fn();
        render(<ProjectSearch projectPath="/project" onSelect={onSelect} onClose={vi.fn()} />);
        fireEvent.change(screen.getByRole("searchbox", { name: "Search project" }), { target: { value: "needle" } });
        fireEvent.submit(screen.getByRole("search"));
        expect(await screen.findByText("A useful needle appears.")).toBeInTheDocument();
        expect(invoke).toHaveBeenCalledWith("search_project", { projectPath: "/project", query: "needle" });
        fireEvent.click(screen.getByRole("button", { name: /chapters\/intro\.tex:12/ }));
        expect(onSelect).toHaveBeenCalledWith({ path: "/project/chapters/intro.tex", line: 12, column: 4, preview: "A useful needle appears." });
    });
});
