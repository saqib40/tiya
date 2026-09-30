import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const { open, invoke } = vi.hoisted(() => ({ open: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("project onboarding", () => {
    beforeEach(() => {
        open.mockReset();
        invoke.mockReset().mockResolvedValue({ path: "/projects/Paper" });
        HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    });

    it("creates a selected template and opens the resulting project", async () => {
        open.mockResolvedValueOnce("/projects");
        const selected = vi.fn();
        render(<Home onProjectSelect={selected} />);
        fireEvent.click(screen.getByRole("button", { name: "New Project" }));
        fireEvent.change(await screen.findByRole("textbox", { name: "Project name" }), { target: { value: "Paper" } });
        fireEvent.change(screen.getByRole("combobox", { name: "Template" }), { target: { value: "report" } });
        fireEvent.click(screen.getByRole("button", { name: "Create" }));
        await waitFor(() => expect(selected).toHaveBeenCalledWith("/projects/Paper"));
        expect(invoke).toHaveBeenCalledWith("create_project", { parentPath: "/projects", name: "Paper", template: "report" });
    });

    it("imports a ZIP into a new named project", async () => {
        open.mockResolvedValueOnce("/downloads/Paper.zip").mockResolvedValueOnce("/projects");
        render(<Home onProjectSelect={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Import ZIP" }));
        await screen.findByRole("textbox", { name: "Project name" });
        fireEvent.click(screen.getByRole("button", { name: "Import" }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith("import_project", { archivePath: "/downloads/Paper.zip", parentPath: "/projects", name: "Paper" }));
    });

    it("shows creation failures without closing the dialog", async () => {
        open.mockResolvedValueOnce("/projects");
        invoke.mockRejectedValueOnce("The project folder already exists");
        render(<Home onProjectSelect={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "New Project" }));
        await screen.findByRole("textbox", { name: "Project name" });
        fireEvent.click(screen.getByRole("button", { name: "Create" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
});