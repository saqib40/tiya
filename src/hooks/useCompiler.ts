import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface CompileRequest {
    root: string;
    revision: number;
    backend: 'tectonic' | 'pdflatex';
}

interface RunningBuild extends CompileRequest {
    id: string;
    cancelled: boolean;
}

interface CompileResult {
    pdf_path: string;
    log: string;
}

interface CompileEvent {
    request_id: string;
    kind: string;
    message: string;
}

export function useCompiler(rootFile: string | null, automatic = true, backend: 'tectonic' | 'pdflatex' = 'tectonic') {
    const [pdfPath, setPdfPath] = useState<string | null>(null);
    const [pdfRevision, setPdfRevision] = useState(0);
    const [status, setStatus] = useState<'Ready' | 'Compiling...' | 'Error' | 'Cancelled' | 'Outdated'>('Ready');
    const [error, setError] = useState<string | null>(null);
    const [log, setLog] = useState("");
    const [activity, setActivity] = useState<string | null>(null);
    const [preparingPackages, setPreparingPackages] = useState(false);
    const rootRef = useRef(rootFile);
    const backendRef = useRef(backend);
    const revision = useRef(0);
    const pending = useRef<CompileRequest | null>(null);
    const running = useRef(false);
    const mounted = useRef(false);
    const active = useRef<RunningBuild | null>(null);
    const automaticRef = useRef(automatic);

    useEffect(() => { automaticRef.current = automatic; }, [automatic]);

    const cancelActive = useCallback(() => {
        const request = active.current;
        if (!request) return;
        request.cancelled = true;
        void invoke("cancel_compile", { requestId: request.id }).catch(failure => {
            if (mounted.current) setError(`Could not cancel the build: ${String(failure)}`);
        });
    }, []);

    const drain = useCallback(async () => {
        if (running.current) return;
        running.current = true;
        try {
            while (pending.current && mounted.current) {
                const request = pending.current;
                pending.current = null;
                const task: RunningBuild = { ...request, id: crypto.randomUUID(), cancelled: false };
                active.current = task;
                let unlisten: (() => void) | undefined;
                try {
                    unlisten = await listen<CompileEvent>("compile-output", ({ payload }) => {
                        if (payload.request_id !== task.id) return;
                        if (payload.kind === "started" && task.cancelled) cancelActive();
                        if (mounted.current && task.revision === revision.current) {
                            setLog(previous => `${previous}${payload.message}\n`.slice(-524_288));
                            if (payload.kind === "package") {
                                const message = payload.message.trim().split(/\r?\n/).filter(Boolean).pop();
                                setPreparingPackages(true);
                                setActivity(message?.trim() || "Preparing LaTeX packages");
                            }
                        }
                    });
                    if (!mounted.current || task.cancelled) continue;
                    setLog("");
                    const result = await invoke<CompileResult>("compile_preview", { filePath: request.root, requestId: task.id, backend: request.backend });
                    if (mounted.current && request.revision === revision.current && request.root === rootRef.current) {
                        setPdfPath(result.pdf_path);
                        setPdfRevision(value => value + 1);
                        setLog(result.log);
                        setError(null);
                        setStatus('Ready');
                        setActivity(null);
                        setPreparingPackages(false);
                    }
                } catch (failure) {
                    if (mounted.current && request.revision === revision.current && request.root === rootRef.current) {
                        const message = failure instanceof Error ? failure.message : String(failure);
                        setError(message);
                        setLog(message);
                        setStatus('Error');
                    }
                } finally {
                    unlisten?.();
                    if (active.current === task) active.current = null;
                }
            }
        } finally {
            running.current = false;
        }
    }, [cancelActive]);

    const requestCompile = useCallback(() => {
        if (!rootRef.current || !mounted.current) return;
        pending.current = { root: rootRef.current, revision: ++revision.current, backend: backendRef.current };
        setStatus('Compiling...');
        setActivity(`Starting ${backendRef.current === 'tectonic' ? 'Tectonic' : 'pdflatex'}`);
        setPreparingPackages(false);
        void drain();
    }, [drain]);

    const sourceSaved = useCallback(() => {
        if (automaticRef.current) requestCompile();
        else setStatus('Outdated');
    }, [requestCompile]);

    const cancelCompile = useCallback(() => {
        revision.current += 1;
        pending.current = null;
        cancelActive();
        setStatus('Cancelled');
        setError(null);
        setActivity(null);
        setPreparingPackages(false);
    }, [cancelActive]);

    useEffect(() => {
        mounted.current = true;
        rootRef.current = rootFile;
        backendRef.current = backend;
        revision.current += 1;
        pending.current = null;
        setPdfPath(null);
        setPdfRevision(0);
        setError(null);
        setLog("");
        setStatus('Ready');
        setActivity(null);
        setPreparingPackages(false);
        if (automaticRef.current) requestCompile();
        return () => {
            mounted.current = false;
            revision.current += 1;
            pending.current = null;
            cancelActive();
        };
    }, [rootFile, backend, requestCompile, cancelActive]);

    return { pdfPath, pdfRevision, status, error, log, activity, preparingPackages, requestCompile, sourceSaved, cancelCompile };
}