import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocuments } from "./useDocuments";

const { invoke, close, handlers } = vi.hoisted(() => ({
    invoke: vi.fn(),
    close: vi.fn(),
    handlers: [] as Array<(event: { preventDefault: () => void }) => Promise<void>>,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/window", () => ({
    getCurrentWindow: () => ({
        close,
        onCloseRequested: vi.fn(async callback => {
            handlers.push(callback);
            return vi.fn();
        }),
    }),
}));

describe("document save safety", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        handlers.length = 0;
        invoke.mockResolvedValue(undefined);
        close.mockResolvedValue(undefined);
    });

    afterEach(() => vi.useRealTimers());

    it("saves pending edits even after the active file changes", async () => {
        const { result } = renderHook(() => useDocuments(vi.fn()));
        act(() => result.current.openDocument("/first.tex", "original"));
        act(() => result.current.updateDocument("/first.tex", "edited"));
        act(() => result.current.openDocument("/second.tex", "second"));

        await act(() => vi.advanceTimersByTimeAsync(1000));

        expect(invoke).toHaveBeenCalledWith("save_file", { path: "/first.tex", content: "edited" });
        expect(result.current.activePath).toBe("/second.tex");
        expect(result.current.dirtyCount).toBe(0);
    });

    it("serializes writes to a file and preserves edits made during a save", async () => {
        let finishFirst!: () => void;
        invoke.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; }));
        const { result } = renderHook(() => useDocuments(vi.fn()));
        act(() => result.current.openDocument("/first.tex", "original"));
        act(() => result.current.updateDocument("/first.tex", "first edit"));
        let firstSave!: Promise<boolean>;
        await act(async () => { firstSave = result.current.saveDocument("/first.tex"); });
        act(() => result.current.updateDocument("/first.tex", "latest edit"));
        let secondSave!: Promise<boolean>;
        await act(async () => { secondSave = result.current.saveDocument("/first.tex"); });
        expect(invoke).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishFirst();
            await Promise.all([firstSave, secondSave]);
        });

        expect(invoke).toHaveBeenNthCalledWith(2, "save_file", { path: "/first.tex", content: "latest edit" });
        expect(result.current.activeDocument?.savedContent).toBe("latest edit");
        expect(result.current.dirtyCount).toBe(0);
    });

    it("flushes edits made while a close-time save is running", async () => {
        let finishFirst!: () => void;
        invoke.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; }));
        const { result } = renderHook(() => useDocuments(vi.fn()));
        act(() => result.current.openDocument("/first.tex", "original"));
        act(() => result.current.updateDocument("/first.tex", "first edit"));
        let flushing!: Promise<void>;
        await act(async () => { flushing = result.current.flushAll(); });
        act(() => result.current.updateDocument("/first.tex", "latest edit"));

        await act(async () => { finishFirst(); await flushing; });

        expect(invoke).toHaveBeenLastCalledWith("save_file", { path: "/first.tex", content: "latest edit" });
        expect(result.current.dirtyCount).toBe(0);
    });

    it("waits for an in-flight save when an edit is reverted", async () => {
        let finishFirst!: () => void;
        invoke.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; }));
        const { result } = renderHook(() => useDocuments(vi.fn()));
        act(() => result.current.openDocument("/first.tex", "original"));
        act(() => result.current.updateDocument("/first.tex", "temporary"));
        await act(async () => { void result.current.saveDocument("/first.tex"); });
        act(() => result.current.updateDocument("/first.tex", "original"));
        let flushing!: Promise<void>;
        await act(async () => { flushing = result.current.flushAll(); });

        await act(async () => { finishFirst(); await flushing; });

        expect(invoke).toHaveBeenLastCalledWith("save_file", { path: "/first.tex", content: "original" });
        expect(result.current.dirtyCount).toBe(0);
    });

    it("keeps a failed save dirty and reports the error", async () => {
        invoke.mockRejectedValueOnce("disk full");
        const { result } = renderHook(() => useDocuments(vi.fn()));
        act(() => result.current.openDocument("/first.tex", "original"));
        act(() => result.current.updateDocument("/first.tex", "edited"));

        await act(async () => {
            await expect(result.current.flushAll()).rejects.toBe("disk full");
        });

        expect(result.current.dirtyCount).toBe(1);
        expect(result.current.error).toContain("disk full");
    });

    it("waits for pending writes before closing the native window", async () => {
        let finishSave!: () => void;
        invoke.mockImplementationOnce(() => new Promise<void>(resolve => { finishSave = resolve; }));
        const { result } = renderHook(() => useDocuments(vi.fn()));
        act(() => result.current.openDocument("/first.tex", "original"));
        act(() => result.current.updateDocument("/first.tex", "edited"));
        const event = { preventDefault: vi.fn() };
        let closing!: Promise<void>;
        await act(async () => { closing = handlers[0](event); });

        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(close).not.toHaveBeenCalled();

        await act(async () => { finishSave(); await closing; });

        expect(close).toHaveBeenCalledOnce();
        expect(result.current.dirtyCount).toBe(0);
    });

    it("keeps the window open when saving fails", async () => {
        invoke.mockRejectedValueOnce("permission denied");
        const { result } = renderHook(() => useDocuments(vi.fn()));
        act(() => result.current.openDocument("/first.tex", "original"));
        act(() => result.current.updateDocument("/first.tex", "edited"));

        await act(async () => { await handlers[0]({ preventDefault: vi.fn() }); });

        expect(close).not.toHaveBeenCalled();
        expect(result.current.dirtyCount).toBe(1);
        expect(result.current.error).toContain("Window kept open");
    });
});