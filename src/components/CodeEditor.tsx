import { useRef, useEffect, useState } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type { editor as MonacoEditor, Position } from 'monaco-editor';
import { Loader2, Crosshair, ListTree, Save } from 'lucide-react';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { EditorLocation } from '../lib/diagnostics';
import { latexCompletionContext, latexOutline } from '../lib/latex';

interface CodeEditorProps {
    code: string;
    onChange: (value: string | undefined) => void;
    onSave?: () => void;
    onForwardSync?: (line: number) => void;
    location?: EditorLocation | null;
    path?: string;
    openPaths?: string[];
    fontSize?: number;
    wordWrap?: boolean;
    theme?: 'dark' | 'light';
    labels?: string[];
    citations?: string[];
}

const CodeEditor = ({ code, onChange, onSave, onForwardSync, location, path = "untitled.tex", openPaths, fontSize = 14, wordWrap = true, theme = 'dark', labels = [], citations = [] }: CodeEditorProps) => {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
    const modelPaths = useRef(new Set<string>());
    const onSaveRef = useRef(onSave);
    const [isPasting, setIsPasting] = useState(false);
    const [pasteError, setPasteError] = useState<string | null>(null);
    const [outlineOpen, setOutlineOpen] = useState(false);
    const locationRef = useRef(location);
    const symbolsRef = useRef({ labels, citations });
    const completionProvider = useRef<{ dispose: () => void } | null>(null);
    const outline = latexOutline(code);

    const revealLocation = (target: EditorLocation | null | undefined) => {
        if (!target || !editorRef.current) return;
        editorRef.current.setPosition({ lineNumber: target.line, column: target.column });
        editorRef.current.revealLineInCenter(target.line);
        editorRef.current.focus();
    };

    useEffect(() => {
        locationRef.current = location;
        revealLocation(location);
    }, [location]);

    useEffect(() => {
        onSaveRef.current = onSave;
    }, [onSave]);
    useEffect(() => { symbolsRef.current = { labels, citations }; }, [labels, citations]);

    useEffect(() => { modelPaths.current.add(path); }, [path]);
    useEffect(() => {
        const monaco = monacoRef.current;
        if (!monaco || !openPaths) return;
        for (const modelPath of modelPaths.current) {
            if (modelPath !== path && !openPaths.includes(modelPath)) {
                monaco.editor.getModel(monaco.Uri.parse(modelPath))?.dispose();
                modelPaths.current.delete(modelPath);
            }
        }
    }, [openPaths, path]);
    useEffect(() => () => {
        completionProvider.current?.dispose();
        const monaco = monacoRef.current;
        if (!monaco) return;
        for (const modelPath of modelPaths.current) monaco.editor.getModel(monaco.Uri.parse(modelPath))?.dispose();
    }, []);

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

        completionProvider.current?.dispose();
        completionProvider.current = monaco.languages.registerCompletionItemProvider('latex', {
            triggerCharacters: ['{', ','],
            provideCompletionItems(model: MonacoEditor.ITextModel, position: Position) {
                const context = latexCompletionContext(model.getLineContent(position.lineNumber), position.column);
                if (!context) return { suggestions: [] };
                const values = context.kind === 'label' ? symbolsRef.current.labels : symbolsRef.current.citations;
                return { suggestions: values.map(value => ({
                    label: value,
                    kind: monaco.languages.CompletionItemKind.Reference,
                    insertText: value,
                    range: {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: context.startColumn,
                        endColumn: position.column,
                    },
                })) };
            },
        });
    };

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        revealLocation(locationRef.current);

        // Unified Paste Handler (Tauri System Clipboard + Anti-Freeze UX)
        const performPaste = async () => {
            const model = editor.getModel();
            const selection = editor.getSelection();
            try {
                setIsPasting(true);
                setPasteError(null);
                const text = await readText();
                if (!text || !selection || !model || model.isDisposed() || editor.getModel() !== model) return;
                editor.pushUndoStop();
                editor.executeEdits("tauri-paste", [{ range: selection, text, forceMoveMarkers: true }]);
                editor.pushUndoStop();
            } catch (err) {
                setPasteError(`Clipboard unavailable: ${String(err)}`);
            } finally {
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
            onSaveRef.current?.();
        });
    };

    return (
        <div className="h-full min-h-0 w-full flex-1 relative flex flex-col overflow-hidden bg-slate-950">
            <div className="relative flex shrink-0 items-center justify-end gap-2 border-b border-slate-800 px-3 py-1 text-slate-400">
                <button title="Document outline" aria-label="Document outline" aria-expanded={outlineOpen} disabled={outline.length === 0} onClick={() => setOutlineOpen(value => !value)} className="p-1 disabled:opacity-30"><ListTree size={15} /></button>
                <button title="Save source" aria-label="Save source" disabled={!onSave} onClick={onSave} className="p-1 disabled:opacity-30"><Save size={15} /></button>
                <button title="Show in PDF" aria-label="Show in PDF" disabled={!onForwardSync} onClick={() => { const position = editorRef.current?.getPosition(); if (position) onForwardSync?.(position.lineNumber); }} className="p-1 disabled:opacity-30"><Crosshair size={15} /></button>
                {outlineOpen && <div role="menu" aria-label="Document outline" className="absolute right-3 top-8 z-40 max-h-80 w-72 overflow-auto rounded border border-slate-700 bg-slate-900 py-1 text-xs shadow-xl">
                    {outline.map(item => <button key={`${item.line}-${item.title}`} role="menuitem" onClick={() => { revealLocation({ line: item.line, column: 1, revision: item.line }); setOutlineOpen(false); }} className="block w-full truncate px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800" style={{ paddingLeft: `${12 + (item.level - 1) * 12}px` }} title={item.title}>
                        {item.title}
                    </button>)}
                </div>}
            </div>
            {pasteError && <div role="alert" className="absolute bottom-0 left-0 right-0 z-50 break-words bg-red-950 px-3 py-2 text-xs text-red-200">{pasteError}</div>}
            {/* Pasting Overlay */}
            {isPasting && (
                <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <div className="flex flex-col items-center gap-1">
                          <span className="text-slate-200 font-bold text-sm">Pasting...</span>
                    </div>
                </div>
            )}

            <div className="min-h-0 flex-1">
            <Editor
                height="100%"
                path={path}
                keepCurrentModel
                saveViewState
                defaultLanguage="latex"
                language="latex"
                theme={theme === 'light' ? 'vs' : 'vs-dark'}
                defaultValue={code}
                value={code}
                onChange={onChange}
                beforeMount={handleEditorWillMount}
                onMount={handleEditorDidMount}
                options={{
                    fontSize,
                    fontFamily: "'Fira Code', 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: wordWrap ? 'on' : 'off',
                    automaticLayout: true,
                    smoothScrolling: false,
                    contextmenu: true,
                    padding: { top: 16 },
                    lineNumbers: 'on',
                    renderLineHighlight: 'all',
                    cursorBlinking: 'smooth',
                    scrollbar: {
                        vertical: 'auto',
                        horizontal: 'auto',
                        verticalScrollbarSize: 10,
                        horizontalScrollbarSize: 10,
                    }
                }}
            />
            </div>
        </div>
    );
};

export default CodeEditor;
