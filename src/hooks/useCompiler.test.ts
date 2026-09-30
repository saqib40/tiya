import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompiler } from "./useCompiler";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function deferred() {
    let resolve!: (path: string) => void;
    let reject!: (error: string) => void;
    const promise = new Promise<string>((accept, decline) => { resolve = accept; reject = decline; });
    return { promise, resolve, reject };
}

describe("compilation queue", () => {
    beforeEach(() => invoke.mockReset());

    it("coalesces repeated changes and never publishes an obsolete revision", async () => {
        const first = deferred();
        const newest = deferred();
        invoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(newest.promise);
        const { result } = renderHook(() => useCompiler("/project/main.tex"));
        act(() => {
            result.current.requestCompile();
            result.current.requestCompile();
            result.current.requestCompile();
        });
        expect(invoke).toHaveBeenCalledTimes(1);
        await act(async () => first.resolve("/project/obsolete.pdf"));
        expect(invoke).toHaveBeenCalledTimes(2);
        expect(result.current.pdfPath).toBeNull();
        expect(result.current.status).toBe('Compiling...');
        await act(async () => newest.resolve("/project/current.pdf"));
        expect(result.current.pdfPath).toBe("/project/current.pdf");
        expect(result.current.pdfRevision).toBe(1);
    });

    it("discards a previous root's result while serializing project switches", async () => {
        const oldProject = deferred();
        const newProject = deferred();
        invoke.mockReturnValueOnce(oldProject.promise).mockReturnValueOnce(newProject.promise);
        const { result, rerender } = renderHook(({ root }) => useCompiler(root), { initialProps: { root: "/old/main.tex" } });
        rerender({ root: "/new/main.tex" });
        expect(invoke).toHaveBeenCalledTimes(1);
        await act(async () => oldProject.resolve("/old/main.pdf"));
        expect(result.current.pdfPath).toBeNull();
        expect(invoke).toHaveBeenLastCalledWith("compile_preview", { filePath: "/new/main.tex" });
        await act(async () => newProject.resolve("/new/main.pdf"));
        expect(result.current.pdfPath).toBe("/new/main.pdf");
    });

    it("keeps the last successful preview after a failed build and can retry", async () => {
        invoke.mockResolvedValueOnce("/project/main.pdf");
        const { result } = renderHook(() => useCompiler("/project/main.tex"));
        await waitFor(() => expect(result.current.pdfPath).toBe("/project/main.pdf"));
        invoke.mockRejectedValueOnce("main.tex:8: Undefined control sequence");
        await act(async () => result.current.requestCompile());
        expect(result.current.status).toBe('Error');
        expect(result.current.pdfPath).toBe("/project/main.pdf");
        expect(result.current.error).toContain("main.tex:8");
        invoke.mockResolvedValueOnce("/project/main.pdf");
        await act(async () => result.current.requestCompile());
        expect(result.current.status).toBe('Ready');
        expect(result.current.error).toBeNull();
    });

    it("drops pending work on unmount", async () => {
        const first = deferred();
        invoke.mockReturnValueOnce(first.promise);
        const { result, unmount } = renderHook(() => useCompiler("/project/main.tex"));
        act(() => result.current.requestCompile());
        unmount();
        await act(async () => first.resolve("/project/main.pdf"));
        expect(invoke).toHaveBeenCalledTimes(1);
    });
});