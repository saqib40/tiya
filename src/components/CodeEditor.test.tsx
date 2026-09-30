import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CodeEditor from "./CodeEditor";

const { commands, editor } = vi.hoisted(() => {
    const commands = new Map<number, () => void>();
    return {
        commands,
        editor: {
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

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ readText: vi.fn() }));
vi.mock("@monaco-editor/react", async () => {
    const { useEffect } = await import("react");
    return {
        default: function MockEditor({ onMount }: { onMount: (instance: unknown, monaco: unknown) => void }) {
            useEffect(() => {
                onMount(editor, { KeyMod: { CtrlCmd: 2048 }, KeyCode: { KeyV: 52, KeyS: 49 } });
            }, []);
            return <div data-testid="editor" />;
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
});