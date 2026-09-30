import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SyncBox } from "../lib/synctex";

export function useSynctex(pdfPath: string | null, revision: number, root: string | null) {
    const [boxes, setBoxes] = useState<SyncBox[]>([]);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        setBoxes([]);
        setError(null);
        if (!pdfPath || !root) return;
        let disposed = false;
        let worker: Worker | undefined;
        try {
            worker = new Worker(new URL('../lib/synctex.worker.ts', import.meta.url), { type: 'module' });
            worker.onmessage = ({ data }: MessageEvent<{ boxes?: SyncBox[]; error?: string }>) => {
                if (!disposed) { setBoxes(data.boxes || []); setError(data.error || null); }
                worker?.terminate();
            };
            worker.onerror = () => { if (!disposed) setError('SyncTeX navigation is unavailable'); worker?.terminate(); };
            void invoke<string>('read_synctex', { pdfPath }).then(content => {
                if (!disposed) worker?.postMessage({ content, root });
            }).catch(failure => { if (!disposed) setError(`SyncTeX navigation is unavailable: ${String(failure)}`); worker?.terminate(); });
        } catch (failure) { setError(String(failure)); }
        return () => { disposed = true; worker?.terminate(); };
    }, [pdfPath, revision, root]);
    return { boxes, error };
}