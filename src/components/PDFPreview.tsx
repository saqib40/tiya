import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
    Loader2,
    AlertCircle,
    ZoomIn,
    ZoomOut,
    Maximize,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Search,
    Download,
    ExternalLink
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
    const viewportRef = useRef<HTMLDivElement>(null);
    const pageNodes = useRef(new Map<number, HTMLDivElement>());
    const pdfRef = useRef<PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSizes, setPageSizes] = useState<Record<number, { width: number; height: number }>>({});
    const [query, setQuery] = useState("");
    const [matches, setMatches] = useState<Array<{ page: number; text: string }>>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const searchRevision = useRef(0);

    useEffect(() => {
        setCurrentPage(1);
        setPageSizes({});
        if (!pdfPath) setNumPages(null);
        setMatches([]);
        setSearched(false);
        setActionError(null);
        if (viewportRef.current) viewportRef.current.scrollTop = 0;
    }, [pdfPath]);

    useEffect(() => {
        searchRevision.current += 1;
        setMatches([]);
        setSearched(false);
        setSearching(false);
        return () => { searchRevision.current += 1; };
    }, [pdfPath, pdfRevision]);

    const goToPage = (page: number) => {
        const target = Math.max(1, Math.min(numPages || 1, Math.trunc(page) || 1));
        setCurrentPage(target);
        pageNodes.current.get(target)?.scrollIntoView({ block: 'start' });
    };

    useEffect(() => {
        if (!numPages || !viewportRef.current) return;
        const visible = new Map<number, number>();
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const page = Number((entry.target as HTMLElement).dataset.page);
                if (entry.isIntersecting) visible.set(page, entry.intersectionRatio);
                else visible.delete(page);
            }
            const best = [...visible].sort((first, second) => second[1] - first[1])[0];
            if (best) setCurrentPage(best[0]);
        }, { root: viewportRef.current, threshold: [0, 0.25, 0.5, 0.75, 1] });
        pageNodes.current.forEach(node => observer.observe(node));
        return () => observer.disconnect();
    }, [numPages, pdfPath]);

    const searchPdf = async (event: React.FormEvent) => {
        event.preventDefault();
        const document = pdfRef.current;
        const term = query.trim().toLocaleLowerCase();
        const revision = ++searchRevision.current;
        setMatches([]);
        setSearched(false);
        if (!document || !term) return;
        setSearching(true);
        setActionError(null);
        try {
            const results: Array<{ page: number; text: string }> = [];
            for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
                if (revision !== searchRevision.current) return;
                const page = await document.getPage(pageNumber);
                const content = await page.getTextContent();
                const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
                const index = text.toLocaleLowerCase().indexOf(term);
                if (index >= 0) results.push({ page: pageNumber, text: text.slice(Math.max(0, index - 35), index + term.length + 70) });
            }
            if (revision === searchRevision.current) { setMatches(results); setSearched(true); }
        } catch (failure) {
            if (revision === searchRevision.current) setActionError(String(failure));
        } finally {
            if (revision === searchRevision.current) setSearching(false);
        }
    };

    const exportPdf = async () => {
        if (!pdfPath) return;
        try {
            const destination = await save({ title: 'Export PDF', defaultPath: pdfPath.split(/[/\\]/).pop(), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
            if (destination) await invoke('export_pdf', { source: pdfPath, destination });
            setActionError(null);
        } catch (failure) { setActionError(String(failure)); }
    };

    const openPdf = async () => {
        try { await invoke('open_pdf', { path: pdfPath }); setActionError(null); }
        catch (failure) { setActionError(String(failure)); }
    };

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

    function onDocumentLoadSuccess(document: PDFDocumentProxy) {
        pdfRef.current = document;
        setNumPages(document.numPages);
        setCurrentPage(page => Math.max(1, Math.min(page, document.numPages)));
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
                        <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} title="Previous page" aria-label="Previous page" className="p-1 hover:text-white disabled:opacity-30">
                            <ChevronLeft size={16} />
                        </button>
                        <input aria-label="Page number" type="number" min={1} max={numPages || 1} value={currentPage} onChange={event => goToPage(Number(event.target.value))} className="w-12 rounded border border-slate-700 bg-slate-950 px-1 py-1 text-center text-xs" />
                        <span className="text-xs">/ {numPages || '-'}</span>
                        <button onClick={() => goToPage(currentPage + 1)} disabled={!numPages || currentPage >= numPages} title="Next page" aria-label="Next page" className="p-1 hover:text-white disabled:opacity-30">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    <button onClick={() => void exportPdf()} title="Export PDF" aria-label="Export PDF" className="p-1 text-slate-300 hover:text-white"><Download size={16} /></button>
                    <button onClick={() => void openPdf()} title="Open PDF externally" aria-label="Open PDF externally" className="p-1 text-slate-300 hover:text-white"><ExternalLink size={16} /></button>
                </div>
            )}

            {pdfPath && <form onSubmit={event => void searchPdf(event)} className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
                <input type="search" aria-label="Search PDF" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs" />
                <button type="submit" title="Find in PDF" aria-label="Find in PDF" disabled={searching} className="p-1 text-slate-300">{searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}</button>
            </form>}
            {searched && <div className="max-h-36 shrink-0 overflow-auto border-b border-slate-800 px-3 py-2 text-xs">
                {matches.length ? matches.map(match => <button key={match.page} onClick={() => goToPage(match.page)} className="block w-full truncate py-1 text-left text-emerald-300 hover:underline">Page {match.page}: {match.text}</button>) : <span>No matches</span>}
            </div>}
            {actionError && <div role="alert" className="shrink-0 break-words px-3 py-2 text-xs text-red-300">{actionError}</div>}

            {(compiling || error) && <div role="status" className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs text-amber-200">
                {compiling ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <AlertCircle size={14} className="shrink-0" />}
                <span>{compiling ? 'Building PDF...' : pdfPath ? 'Preview from last successful build' : 'Build failed'}</span>
            </div>}
            {loadError && <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-red-800 bg-red-950 px-3 py-2 text-xs text-red-200">
                <span className="min-w-0 flex-1 break-words">{loadError}</span>
                <button aria-label="Retry PDF preview" title="Retry PDF preview" onClick={() => setReloadRevision(value => value + 1)} className="shrink-0 p-1"><RefreshCw size={16} /></button>
            </div>}
            <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto custom-scrollbar p-4" onClick={event => {
                const link = (event.target as HTMLElement).closest('a');
                if (link && /^(https?:|mailto:)/i.test(link.href)) {
                    event.preventDefault();
                    void openUrl(link.href).catch(failure => setActionError(String(failure)));
                }
            }}>

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
                        onItemClick={({ pageNumber }) => { if (pageNumber) goToPage(pageNumber); }}
                        onLoadError={(loadFailure) => setLoadError(loadFailure.message)}
                        loading={null}
                        className="flex flex-col items-center gap-6 min-w-full w-max"
                    >
                        {Array.from({ length: numPages || 0 }, (_, index) => {
                            const pageNumber = index + 1;
                            const size = pageSizes[pageNumber] || pageSizes[1] || { width: 612, height: 792 };
                            const width = fitToWidth ? Math.max(1, containerWidth - 32) : size.width * scale;
                            return <div key={pageNumber} data-page={pageNumber} ref={node => { if (node) pageNodes.current.set(pageNumber, node); else pageNodes.current.delete(pageNumber); }} className="pdf-canvas relative shrink-0 bg-white" style={{ width, height: width * size.height / size.width }}>
                                {Math.abs(pageNumber - currentPage) <= 2 && <Page
                                    pageNumber={pageNumber}
                                    width={width}
                                    devicePixelRatio={Math.min(2, window.devicePixelRatio)}
                                    renderTextLayer
                                    renderAnnotationLayer
                                    onLoadSuccess={page => {
                                        const viewport = page.getViewport({ scale: 1 });
                                        setPageSizes(previous => previous[pageNumber]?.width === viewport.width && previous[pageNumber]?.height === viewport.height ? previous : { ...previous, [pageNumber]: { width: viewport.width, height: viewport.height } });
                                    }}
                                    className="bg-white"
                                    loading={null}
                                />}
                            </div>;
                        })}
                    </Document>
                )}

            </div>
        </div>
    );
};

export default PDFPreview;