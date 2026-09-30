import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompiler } from "./useCompiler";

const { invoke, builds, listen } = vi.hoisted(() => ({ invoke: vi.fn(), builds: vi.fn(), listen: vi.fn(async () => vi.fn()) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

function deferred() {
    let resolve!: (path: string) => void;
    let reject!: (error: string) => void;
    const promise = new Promise<{ pdf_path: string; log: string }>((accept, decline) => {
        resolve = path => accept({ pdf_path: path, log: "Build complete" });
        reject = decline;
    });
    return { promise, resolve, reject };
}

describe("compilation queue", () => {
    beforeEach(() => {
        builds.mockReset();
        invoke.mockReset().mockImplementation((command, payload) => command === "compile_preview" ? builds(payload) : Promise.resolve());
    });

    it("coalesces repeated changes and never publishes an obsolete revision", async () => {
        const first = deferred();
        const newest = deferred();
        builds.mockReturnValueOnce(first.promise).mockReturnValueOnce(newest.promise);
        const { result } = renderHook(() => useCompiler("/project/main.tex"));
        await waitFor(() => expect(builds).toHaveBeenCalledTimes(1));
        act(() => {
            result.current.requestCompile();
            result.current.requestCompile();
            result.current.requestCompile();
        });
        expect(builds).toHaveBeenCalledTimes(1);
        await act(async () => first.resolve("/project/obsolete.pdf"));
        expect(builds).toHaveBeenCalledTimes(2);
        expect(result.current.pdfPath).toBeNull();
        expect(result.current.status).toBe('Compiling...');
        await act(async () => newest.resolve("/project/current.pdf"));
        expect(result.current.pdfPath).toBe("/project/current.pdf");
        expect(result.current.pdfRevision).toBe(1);
    });

    it("discards a previous root's result while serializing project switches", async () => {
        const oldProject = deferred();
        const newProject = deferred();
        builds.mockReturnValueOnce(oldProject.promise).mockReturnValueOnce(newProject.promise);
        const { result, rerender } = renderHook(({ root }) => useCompiler(root), { initialProps: { root: "/old/main.tex" } });
        await waitFor(() => expect(builds).toHaveBeenCalledTimes(1));
        rerender({ root: "/new/main.tex" });
        expect(builds).toHaveBeenCalledTimes(1);
        await act(async () => oldProject.resolve("/old/main.pdf"));
        expect(result.current.pdfPath).toBeNull();
        expect(invoke).toHaveBeenLastCalledWith("compile_preview", { filePath: "/new/main.tex", requestId: expect.any(String) });
        await act(async () => newProject.resolve("/new/main.pdf"));
        expect(result.current.pdfPath).toBe("/new/main.pdf");
    });

    it("keeps the last successful preview after a failed build and can retry", async () => {
        builds.mockResolvedValueOnce({ pdf_path: "/project/main.pdf", log: "Success" });
        const { result } = renderHook(() => useCompiler("/project/main.tex"));
        await waitFor(() => expect(result.current.pdfPath).toBe("/project/main.pdf"));
        builds.mockRejectedValueOnce("main.tex:8: Undefined control sequence");
        await act(async () => result.current.requestCompile());
        expect(result.current.status).toBe('Error');
        expect(result.current.pdfPath).toBe("/project/main.pdf");
        expect(result.current.error).toContain("main.tex:8");
        builds.mockResolvedValueOnce({ pdf_path: "/project/main.pdf", log: "Success" });
        await act(async () => result.current.requestCompile());
        expect(result.current.status).toBe('Ready');
        expect(result.current.error).toBeNull();
    });

    it("drops pending work on unmount", async () => {
        const first = deferred();
        builds.mockReturnValueOnce(first.promise);
        const { result, unmount } = renderHook(() => useCompiler("/project/main.tex"));
        await waitFor(() => expect(builds).toHaveBeenCalledTimes(1));
        act(() => result.current.requestCompile());
        unmount();
        await act(async () => first.resolve("/project/main.pdf"));
        expect(builds).toHaveBeenCalledTimes(1);
        expect(invoke).toHaveBeenCalledWith("cancel_compile", { requestId: expect.any(String) });
    });

    it("does not build automatically in manual mode", async () => {
        builds.mockResolvedValue({ pdf_path: "/project/main.pdf", log: "Success" });
        const { result } = renderHook(() => useCompiler("/project/main.tex", false));
        act(() => result.current.sourceSaved());
        expect(builds).not.toHaveBeenCalled();
        expect(result.current.status).toBe('Outdated');
        await act(async () => result.current.requestCompile());
        expect(builds).toHaveBeenCalledTimes(1);
        expect(result.current.status).toBe('Ready');
    });

    it("cancels the running build and drops the queued build", async () => {
        const first = deferred();
        builds.mockReturnValueOnce(first.promise);
        const { result } = renderHook(() => useCompiler("/project/main.tex"));
        await waitFor(() => expect(builds).toHaveBeenCalledTimes(1));
        act(() => { result.current.requestCompile(); result.current.cancelCompile(); });
        await act(async () => first.reject("Build cancelled"));
        expect(result.current.status).toBe('Cancelled');
        expect(result.current.error).toBeNull();
        expect(builds).toHaveBeenCalledTimes(1);
        expect(invoke).toHaveBeenCalledWith("cancel_compile", { requestId: expect.any(String) });
    });
});