import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CodeEditor from "./CodeEditor";

const { commands, editor, readText } = vi.hoisted(() => {
    const commands = new Map<number, () => void>();
    return {
        commands,
        readText: vi.fn(),
        editor: {
            getModel: vi.fn(() => ({ isDisposed: (): boolean => false })),
            getSelection: vi.fn(() => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 })),
            executeEdits: vi.fn(),
            pushUndoStop: vi.fn(),
            getValue: vi.fn(() => "original"),
            setValue: vi.fn(),
            setPosition: vi.fn(),
            revealLineInCenter: vi.fn(),
            focus: vi.fn(),
            getDomNode: vi.fn(() => null),
            addCommand: vi.fn((key: number, callback: () => void) => commands.set(key, callback)),
        },
    };
});

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ readText }));
vi.mock("@monaco-editor/react", async () => {
    const { useEffect } = await import("react");
    return {
        default: function MockEditor({ onMount, path, keepCurrentModel, saveViewState }: { onMount: (instance: unknown, monaco: unknown) => void; path: string; keepCurrentModel: boolean; saveViewState: boolean }) {
            useEffect(() => {
                onMount(editor, { KeyMod: { CtrlCmd: 2048 }, KeyCode: { KeyV: 52, KeyS: 49 }, editor: { getModel: vi.fn() }, Uri: { parse: (path: string) => path } });
            }, []);
            return <div data-testid="editor" data-path={path} data-keep-model={keepCurrentModel} data-view-state={saveViewState} />;
        },
    };
});

describe("editor save shortcut", () => {
    beforeEach(() => commands.clear());

    it("saves the latest content after the editor has mounted", () => {
        const save = vi.fn();
        const { rerender } = render(
            <CodeEditor code="original" onChange={vi.fn()} onSave={() => save("first.tex", "original")} />,
        );
        rerender(
            <CodeEditor code="edited" onChange={vi.fn()} onSave={() => save("first.tex", "edited")} />,
        );

        commands.get(2048 | 49)!();

        expect(save).toHaveBeenCalledExactlyOnceWith("first.tex", "edited");
    });

    it("saves the active file after switching documents", () => {
        const save = vi.fn();
        const { rerender } = render(
            <CodeEditor code="original" onChange={vi.fn()} onSave={() => save("first.tex")} />,
        );
        rerender(<CodeEditor code="second" onChange={vi.fn()} onSave={() => save("second.tex")} />);

        commands.get(2048 | 49)!();

        expect(save).toHaveBeenCalledExactlyOnceWith("second.tex");
    });

    it("reveals a diagnostic on mount and on subsequent navigation", () => {
        const { rerender } = render(<CodeEditor code="text" onChange={vi.fn()} location={{ line: 7, column: 2, revision: 1 }} />);
        expect(editor.setPosition).toHaveBeenLastCalledWith({ lineNumber: 7, column: 2 });
        rerender(<CodeEditor code="text" onChange={vi.fn()} location={{ line: 14, column: 1, revision: 2 }} />);
        expect(editor.revealLineInCenter).toHaveBeenLastCalledWith(14);
        expect(editor.focus).toHaveBeenCalled();
    });

    it("uses stable file models instead of resetting the editor value", () => {
        const { rerender } = render(<CodeEditor path="/project/main.tex" code="main" onChange={vi.fn()} />);
        expect(screen.getByTestId("editor")).toHaveAttribute("data-keep-model", "true");
        expect(screen.getByTestId("editor")).toHaveAttribute("data-view-state", "true");
        rerender(<CodeEditor path="/project/chapter.tex" code="chapter" onChange={vi.fn()} />);
        expect(screen.getByTestId("editor")).toHaveAttribute("data-path", "/project/chapter.tex");
        expect(editor.setValue).not.toHaveBeenCalled();
    });

    it("does not paste delayed clipboard content into a different file", async () => {
        let finish!: (text: string) => void;
        readText.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
        const firstModel = { isDisposed: () => false };
        editor.getModel.mockReturnValue(firstModel);
        render(<CodeEditor code="first" onChange={vi.fn()} />);
        act(() => commands.get(2048 | 52)!());
        editor.getModel.mockReturnValue({ isDisposed: () => false });
        await act(async () => finish("clipboard text"));
        expect(editor.executeEdits).not.toHaveBeenCalled();
    });
});