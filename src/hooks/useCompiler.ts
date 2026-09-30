import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface CompileRequest {
    root: string;
    revision: number;
}

export function useCompiler(rootFile: string | null) {
    const [pdfPath, setPdfPath] = useState<string | null>(null);
    const [pdfRevision, setPdfRevision] = useState(0);
    const [status, setStatus] = useState<'Ready' | 'Compiling...' | 'Error'>('Ready');
    const [error, setError] = useState<string | null>(null);
    const rootRef = useRef(rootFile);
    const revision = useRef(0);
    const pending = useRef<CompileRequest | null>(null);
    const running = useRef(false);
    const mounted = useRef(false);

    const drain = useCallback(async () => {
        if (running.current) return;
        running.current = true;
        try {
            while (pending.current && mounted.current) {
                const request = pending.current;
                pending.current = null;
                try {
                    const result = await invoke<string>("compile_preview", { filePath: request.root });
                    if (mounted.current && request.revision === revision.current && request.root === rootRef.current) {
                        setPdfPath(result);
                        setPdfRevision(value => value + 1);
                        setError(null);
                        setStatus('Ready');
                    }
                } catch (failure) {
                    if (mounted.current && request.revision === revision.current && request.root === rootRef.current) {
                        setError(failure instanceof Error ? failure.message : String(failure));
                        setStatus('Error');
                    }
                }
            }
        } finally {
            running.current = false;
        }
    }, []);

    const requestCompile = useCallback(() => {
        if (!rootRef.current || !mounted.current) return;
        pending.current = { root: rootRef.current, revision: ++revision.current };
        setStatus('Compiling...');
        void drain();
    }, [drain]);

    useEffect(() => {
        mounted.current = true;
        rootRef.current = rootFile;
        revision.current += 1;
        pending.current = null;
        setPdfPath(null);
        setPdfRevision(0);
        setError(null);
        setStatus('Ready');
        requestCompile();
        return () => {
            mounted.current = false;
            revision.current += 1;
            pending.current = null;
        };
    }, [rootFile, requestCompile]);

    return { pdfPath, pdfRevision, status, error, requestCompile };
}