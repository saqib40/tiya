import { useRef, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { readText } from '@tauri-apps/plugin-clipboard-manager';

interface CodeEditorProps {
    code: string;
    onChange: (value: string | undefined) => void;
    onSave?: () => void;
}

const CodeEditor = ({ code, onChange, onSave }: CodeEditorProps) => {
    const editorRef = useRef<any>(null);

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;

        // Hard Override for Paste Command
        editor.onKeyDown(async (e: any) => {
            const isPaste = (e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyV;

            if (isPaste) {
                console.log("Ctrl+V detected (onKeyDown)!");
                e.preventDefault();
                e.stopPropagation();

                try {
                    console.log("Attempting to read clipboard...");
                    const text = await readText();
                    console.log("Clipboard content received:", text);

                    if (text) {
                        editor.trigger('keyboard', 'type', { text });
                    } else {
                        console.warn("Clipboard is empty or null (onKeyDown)");
                        alert("Clipboard is empty or access denied");
                    }
                } catch (err) {
                    console.error('Hard paste override failed:', err);
                    alert("Error reading clipboard: " + err);
                }
            }
        });

        // Monaco internal paste action override
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, async () => {
            console.log("Paste Command triggered (addCommand)!");
            try {
                console.log("Attempting to read clipboard...");
                const text = await readText();
                console.log("Clipboard content received:", text);

                if (text) {
                    editor.trigger('keyboard', 'type', { text });
                } else {
                    console.warn("Clipboard is empty or null (addCommand)");
                    alert("Clipboard is empty or access denied");
                }
            } catch (err) {
                console.error('Monaco paste command override failed:', err);
                alert("Error reading clipboard: " + err);
            }
        });

        // Ctrl+S Save Command
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            if (onSave) onSave();
        });
    };

    // Sync internal editor value when props change
    useEffect(() => {
        if (editorRef.current && editorRef.current.getValue() !== code) {
            editorRef.current.setValue(code);
        }
    }, [code]);

    return (
        <div className="h-full w-full overflow-hidden">
            <Editor
                height="100%"
                defaultLanguage="latex"
                theme="vs-dark"
                value={code}
                onChange={onChange}
                onMount={handleEditorDidMount}
                options={{
                    fontSize: 14,
                    fontFamily: "'Fira Code', 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16 },
                    lineNumbers: 'on',
                    renderLineHighlight: 'all',
                    cursorBlinking: 'smooth',
                    smoothScrolling: true,
                    scrollbar: {
                        vertical: 'hidden',
                        horizontal: 'hidden',
                        verticalScrollbarSize: 0,
                        horizontalScrollbarSize: 0,
                    }
                }}
            />
        </div>
    );
};

export default CodeEditor;
