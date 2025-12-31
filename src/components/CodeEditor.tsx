import { useRef, useEffect, useState } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';
import { readText } from '@tauri-apps/plugin-clipboard-manager';

interface CodeEditorProps {
    code: string;
    onChange: (value: string | undefined) => void;
    onSave?: () => void;
}

const CodeEditor = ({ code, onChange, onSave }: CodeEditorProps) => {
    const editorRef = useRef<any>(null);
    const [isPasting, setIsPasting] = useState(false);

    const handleEditorWillMount: BeforeMount = (monaco) => {
        // Explicitly Register the LaTeX language inside the component
        monaco.languages.register({ id: 'latex' });

        // Set the Monarch tokens provider
        monaco.languages.setMonarchTokensProvider('latex', {
            displayName: 'Latex',
            defaultToken: '',
            tokenPostfix: '.latex',

            keywords: [
                '\\documentclass', '\\begin', '\\end', '\\usepackage',
                '\\section', '\\subsection', '\\subsubsection', '\\paragraph',
                '\\label', '\\ref', '\\cite', '\\bibitem', '\\include', '\\input',
                '\\bibliography', '\\bibliographystyle', '\\caption', '\\centering',
                '\\item', '\\textbf', '\\textit', '\\emph', '\\underline'
            ],

            tokenizer: {
                root: [
                    // Comments
                    [/%.*$/, 'comment'],

                    // Math mode
                    [/\$[^$]*\$/, 'string.regexp'], // Inline math $...$
                    [/\\\[[\s\S]*?\\\]/, 'string.regexp'], // Display math \[...\]

                    // Commands
                    [/\\(?:begin|end|section|subsection|subsubsection|paragraph|label|ref|cite|usepackage|documentclass)/, 'keyword'],
                    [/\\[a-zA-Z]+/, 'keyword.flow'],

                    // Brackets
                    [/[{}[\].]/, 'delimiter'],

                    // Numbers
                    [/\d+/, 'number']
                ]
            }
        });

        // Set Language Configuration for better bracket handling
        monaco.languages.setLanguageConfiguration('latex', {
            comments: {
                lineComment: '%',
            },
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')'],
            ],
            autoClosingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '$', close: '$' },
            ],
        });
    };

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;

        // Unified Paste Handler (Tauri System Clipboard + Anti-Freeze UX)
        const performPaste = async () => {
            try {
                // 1. Show Loader
                setIsPasting(true);

                // 2. Fetch the text directly from the OS (Essential for Windows -> WSL)
                const text = await readText();

                if (!text) {
                    setIsPasting(false);
                    return;
                }

                // 3. Defer insertion to allow the loader to render
                setTimeout(() => {
                    const selection = editor.getSelection();
                    if (!selection) {
                        setIsPasting(false);
                        return;
                    }

                    const op = {
                        range: selection,
                        text: text,
                        forceMoveMarkers: true
                    };

                    editor.executeEdits("tauri-paste", [op]);
                    setIsPasting(false);
                }, 100);
            } catch (err) {
                console.error("Clipboard read failed:", err);
                setIsPasting(false);
            }
        };

        // Intercept native DOM paste event (Context Menu, etc.)
        const domNode = editor.getDomNode();
        if (domNode) {
            domNode.addEventListener('paste', (e) => {
                e.preventDefault();
                e.stopPropagation();
                performPaste();
            }, true);
        }

        // Intercept Monaco internal paste command (Ctrl+V)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
            performPaste();
        });

        // Ctrl+S Save Command
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            if (onSave) onSave();
        });
    };

    // "Anti-Freeze" Sync Guard Logic (Keeps parent and child in balance)
    useEffect(() => {
        if (editorRef.current) {
            const currentContent = editorRef.current.getValue();
            if (currentContent !== code) {
                editorRef.current.setValue(code);
            }
        }
    }, [code]);

    return (
        <div className="h-full w-full relative overflow-hidden bg-slate-950">
            {/* Pasting Overlay */}
            {isPasting && (
                <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-slate-200 font-bold text-sm">Pasting large content...</span>
                        <span className="text-slate-500 text-xs">Optimizing editor state</span>
                    </div>
                </div>
            )}

            <Editor
                height="100%"
                defaultLanguage="latex"
                language="latex"
                theme="vs-dark"
                defaultValue={code}
                onChange={onChange}
                beforeMount={handleEditorWillMount}
                onMount={handleEditorDidMount}
                options={{
                    fontSize: 14,
                    fontFamily: "'Fira Code', 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    smoothScrolling: false,
                    contextmenu: true,
                    padding: { top: 16 },
                    lineNumbers: 'on',
                    renderLineHighlight: 'all',
                    cursorBlinking: 'smooth',
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
