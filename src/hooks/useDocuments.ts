import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface DocumentBuffer {
    path: string;
    content: string;
    savedContent: string;
}

export function useDocuments(onSaved: (path: string) => void) {
    const [buffers, setBuffers] = useState<Record<string, DocumentBuffer>>({});
    const [activePath, setActivePath] = useState("");
    const [savingCount, setSavingCount] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const buffersRef = useRef(buffers);
    const pending = useRef(new Map<string, Promise<boolean>>());
    const onSavedRef = useRef(onSaved);

    useEffect(() => {
        onSavedRef.current = onSaved;
    }, [onSaved]);

    const publish = useCallback((next: Record<string, DocumentBuffer>) => {
        buffersRef.current = next;
        setBuffers(next);
    }, []);

    const openDocument = useCallback((path: string, content: string) => {
        if (!buffersRef.current[path]) {
            publish({ ...buffersRef.current, [path]: { path, content, savedContent: content } });
        }
        setActivePath(path);
    }, [publish]);

    const updateDocument = useCallback((path: string, content: string) => {
        const buffer = buffersRef.current[path];
        if (buffer && buffer.content !== content) {
            publish({ ...buffersRef.current, [path]: { ...buffer, content } });
        }
    }, [publish]);

    const saveDocument = useCallback((path: string): Promise<boolean> => {
        const previous = pending.current.get(path) ?? Promise.resolve(false);
        const task = previous.catch(() => false).then(async () => {
            const buffer = buffersRef.current[path];
            if (!buffer || buffer.content === buffer.savedContent) return false;

            setSavingCount(count => count + 1);
            setError(null);
            try {
                await invoke("save_file", { path, content: buffer.content });
                const current = buffersRef.current[path];
                if (current) {
                    publish({ ...buffersRef.current, [path]: { ...current, savedContent: buffer.content } });
                }
                onSavedRef.current(path);
                return true;
            } catch (failure) {
                setError(`Could not save ${path}: ${String(failure)}`);
                throw failure;
            } finally {
                setSavingCount(count => count - 1);
            }
        });
        pending.current.set(path, task);
        const removeTask = () => {
            if (pending.current.get(path) === task) pending.current.delete(path);
        };
        void task.then(removeTask, removeTask);
        return task;
    }, [publish]);

    const flushAll = useCallback(async () => {
        while (true) {
            await Promise.all(pending.current.values());
            const dirty = Object.values(buffersRef.current).filter(buffer => buffer.content !== buffer.savedContent);
            if (dirty.length === 0) return;
            await Promise.all(dirty.map(buffer => saveDocument(buffer.path)));
        }
    }, [saveDocument]);

    const reset = useCallback(() => {
        publish({});
        setActivePath("");
        setError(null);
    }, [publish]);

    const relocateDocuments = useCallback((source: string, destination: string) => {
        const relocated = (path: string) => path === source || path.startsWith(`${source}/`) || path.startsWith(`${source}\\`)
            ? `${destination}${path.slice(source.length)}` : path;
        const next: Record<string, DocumentBuffer> = {};
        for (const buffer of Object.values(buffersRef.current)) {
            const path = relocated(buffer.path);
            next[path] = { ...buffer, path };
        }
        publish(next);
        setActivePath(path => relocated(path));
    }, [publish]);

    const removeDocuments = useCallback((source: string) => {
        const next = Object.fromEntries(Object.entries(buffersRef.current).filter(([path]) =>
            path !== source && !path.startsWith(`${source}/`) && !path.startsWith(`${source}\\`)));
        publish(next);
        setActivePath(path => next[path] ? path : Object.keys(next)[0] ?? "");
        setError(null);
    }, [publish]);

    useEffect(() => {
        if (!Object.values(buffers).some(buffer => buffer.content !== buffer.savedContent)) return;
        const timer = setTimeout(() => {
            void flushAll().catch(() => undefined);
        }, 1000);
        return () => clearTimeout(timer);
    }, [buffers, flushAll]);

    useEffect(() => {
        const appWindow = getCurrentWindow();
        let disposed = false;
        let unlisten: (() => void) | undefined;
        let closing = false;
        let allowClose = false;

        void appWindow.onCloseRequested(async event => {
            if (allowClose) return;
            event.preventDefault();
            if (closing) return;
            closing = true;
            try {
                await flushAll();
                allowClose = true;
                await appWindow.close();
            } catch (failure) {
                allowClose = false;
                closing = false;
                setError(`Window kept open because saving failed: ${String(failure)}`);
            }
        }).then(stop => {
            if (disposed) stop();
            else unlisten = stop;
        }).catch(failure => setError(`Could not protect unsaved changes: ${String(failure)}`));

        return () => {
            disposed = true;
            unlisten?.();
        };
    }, [flushAll]);

    return {
        buffers,
        activePath,
        activeDocument: buffers[activePath] ?? null,
        dirtyCount: Object.values(buffers).filter(buffer => buffer.content !== buffer.savedContent).length,
        saving: savingCount > 0,
        error,
        openDocument,
        updateDocument,
        saveDocument,
        flushAll,
        reset,
        relocateDocuments,
        removeDocuments,
    };
}