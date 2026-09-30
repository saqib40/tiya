import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
    Loader2,
    AlertCircle,
    ZoomIn,
    ZoomOut,
    Maximize,
    ChevronLeft,
    ChevronRight,
    RefreshCw
} from 'lucide-react';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

interface PDFPreviewProps {
    pdfPath: string | null;
    pdfRevision?: number;
    compiling?: boolean;
    error: string | null;
}

const PDFPreview = ({ pdfPath, pdfRevision = 0, compiling = false, error }: PDFPreviewProps) => {
    const [numPages, setNumPages] = useState<number | null>(null);
    const [containerWidth, setContainerWidth] = useState<number>(600);
    const [scale, setScale] = useState<number>(1.0);
    const [fitToWidth, setFitToWidth] = useState<boolean>(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reloadRevision, setReloadRevision] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Cache-busted URL
    const assetUrl = useMemo(() => {
        if (!pdfPath) return null;
        const base = convertFileSrc(pdfPath);
        return `${base}?rev=${pdfRevision}&reload=${reloadRevision}`;
    }, [pdfPath, pdfRevision, reloadRevision]);

    useEffect(() => {
        setLoadError(null);
    }, [assetUrl]);

    // Handle Resize
    const handleResize = useCallback((entries: ResizeObserverEntry[]) => {
        for (let entry of entries) {
            const { width } = entry.contentRect;
            if (width > 0) {
                setContainerWidth(width);
            }
        }
    }, []);

    useEffect(() => {
        const observer = new ResizeObserver(handleResize);
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }
        return () => observer.disconnect();
    }, [handleResize]);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
        setLoadError(null);
    }

    const zoomIn = () => {
        setFitToWidth(false);
        setScale(prev => Math.min(prev + 0.1, 3.0));
    };

    const zoomOut = () => {
        setFitToWidth(false);
        setScale(prev => Math.max(prev - 0.1, 0.2));
    };

    const toggleFitToWidth = () => {
        setFitToWidth(!fitToWidth);
        if (!fitToWidth) setScale(1.0);
    };

    return (
        <div
            ref={containerRef}
            className="h-full w-full bg-slate-950 flex flex-col overflow-hidden relative selection:bg-blue-500/30"
            style={{
                backgroundImage: 'radial-gradient(circle, #1e293b 1px, transparent 1px)',
                backgroundSize: '24px 24px'
            }}
        >
            {/* Custom Styles */}
            <style>{`
                .pdf-canvas {
                    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    transition: transform 0.2s ease-out;
                }
                .pdf-canvas:hover {
                    transform: translateY(-2px);
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>

            {/* Floating Glass Header */}
            {pdfPath && (
                <div className="flex shrink-0 flex-wrap items-center border-b border-slate-800 bg-slate-900 px-3 py-2 gap-3">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={zoomOut}
                            className="p-1 hover:text-white text-slate-400 transition-colors"
                            title="Zoom Out"
                        >
                            <ZoomOut size={16} />
                        </button>

                        <div className="min-w-[3.5rem] text-center text-[10px] font-black text-slate-300 tracking-tighter select-none">
                            {fitToWidth ? "FIT" : `${Math.round(scale * 100)}%`}
                        </div>

                        <button
                            onClick={zoomIn}
                            className="p-1 hover:text-white text-slate-400 transition-colors"
                            title="Zoom In"
                        >
                            <ZoomIn size={16} />
                        </button>
                    </div>

                    <div className="w-px h-4 bg-slate-700/50" />

                    <button
                        onClick={toggleFitToWidth}
                        className={`transition-colors flex items-center gap-2 ${fitToWidth ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-white'
                            }`}
                        title="Toggle Fit to Width"
                    >
                        <Maximize size={16} />
                    </button>

                    <div className="w-px h-4 bg-slate-700/50" />

                    <div className="flex items-center gap-2 text-slate-400">
                        <button className="hover:text-white opacity-50 cursor-not-allowed">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-[10px] font-black min-w-[2.5rem] text-center">{numPages ? `1 / ${numPages}` : '-'}</span>
                        <button className="hover:text-white opacity-50 cursor-not-allowed">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {(compiling || error) && <div role="status" className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs text-amber-200">
                {compiling ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <AlertCircle size={14} className="shrink-0" />}
                <span>{compiling ? 'Building PDF...' : pdfPath ? 'Preview from last successful build' : 'Build failed'}</span>
            </div>}
            {loadError && <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-red-800 bg-red-950 px-3 py-2 text-xs text-red-200">
                <span className="min-w-0 flex-1 break-words">{loadError}</span>
                <button aria-label="Retry PDF preview" title="Retry PDF preview" onClick={() => setReloadRevision(value => value + 1)} className="shrink-0 p-1"><RefreshCw size={16} /></button>
            </div>}
            <div className="min-h-0 flex-1 overflow-auto custom-scrollbar flex flex-col items-center p-4">

                {!pdfPath && !compiling && !error && !loadError && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 select-none h-full min-h-[400px]">
                        <div className="relative">
                            <Maximize className="w-24 h-24 stroke-[1] text-slate-600 opacity-50" />
                            <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full" />
                        </div>
                        <div className="text-center gap-1 flex flex-col">
                            <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">No Document Loaded</p>
                            <p className="text-[10px] font-medium max-w-[12rem] mx-auto text-slate-500 italic">
                                Save your work to generate a preview
                            </p>
                        </div>
                    </div>
                )}

                {pdfPath && !loadError && (
                    <Document
                        file={assetUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={(loadFailure) => setLoadError(loadFailure.message)}
                        loading={null}
                        className="flex flex-col items-center gap-12 w-full"
                    >
                        {Array.from(new Array(numPages || 0), (_, index) => (
                            <div key={index} className="pdf-canvas group relative">
                                <Page
                                    pageNumber={index + 1}
                                    width={fitToWidth ? (containerWidth - 64) : undefined}
                                    scale={fitToWidth ? undefined : scale}
                                    devicePixelRatio={Math.min(2, window.devicePixelRatio)}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                    className="bg-white"
                                    loading={null}
                                />
                                {/* Floating Index */}
                                <div className="absolute -left-12 top-0 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 backdrop-blur-md border border-white/5 text-[10px] font-black w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 shadow-xl">
                                    {index + 1}
                                </div>
                            </div>
                        ))}
                    </Document>
                )}

            </div>
        </div>
    );
};

export default PDFPreview;