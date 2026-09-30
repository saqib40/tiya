import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import PDFPreview from "./PDFPreview";

export default function AssetPreview({ path, revision }: { path: string; revision: number }) {
    const [scale, setScale] = useState(1);
    const [fit, setFit] = useState(true);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [error, setError] = useState(false);
    useEffect(() => { setError(false); setFit(true); setScale(1); setDimensions({ width: 0, height: 0 }); }, [path, revision]);
    if (/\.pdf$/i.test(path)) return <PDFPreview pdfPath={path} pdfRevision={revision} error={null} />;
    return <section aria-label="Image preview" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-900">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-700 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{dimensions.width ? `${dimensions.width} x ${dimensions.height}` : path.split(/[/\\]/).pop()}</span>
            <button title="Zoom out image" aria-label="Zoom out image" onClick={() => { setFit(false); setScale(value => Math.max(0.25, value - 0.25)); }} className="p-1"><ZoomOut size={16} /></button>
            <span className="w-10 text-center tabular-nums">{fit ? 'Fit' : `${Math.round(scale * 100)}%`}</span>
            <button title="Zoom in image" aria-label="Zoom in image" onClick={() => { setFit(false); setScale(value => Math.min(4, value + 0.25)); }} className="p-1"><ZoomIn size={16} /></button>
            <button title="Fit image" aria-label="Fit image" onClick={() => setFit(true)} className="p-1"><Maximize size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
            {error ? <p role="alert" className="text-sm text-red-300">This image could not be displayed.</p> : <img
                src={`${convertFileSrc(path)}?revision=${revision}`} alt={path.split(/[/\\]/).pop() || 'Project image'}
                onLoad={event => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                onError={() => setError(true)}
                style={fit ? { width: '100%', height: '100%', objectFit: 'contain' } : { width: dimensions.width * scale || 'auto', maxWidth: 'none' }}
            />}
        </div>
    </section>;
}