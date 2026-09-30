import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PDFPreview from "./PDFPreview";

const { invoke, save } = vi.hoisted(() => ({ invoke: vi.fn(async () => undefined), save: vi.fn(async () => "/exports/paper.pdf") }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, convertFileSrc: (path: string) => path }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("react-pdf", async () => {
    const { useEffect } = await import("react");
    return {
    pdfjs: { GlobalWorkerOptions: {} },
    Document: ({ file, onLoadError, onLoadSuccess, children }: { file: string; onLoadError: (error: Error) => void; onLoadSuccess: (document: unknown) => void; children: React.ReactNode }) => {
        useEffect(() => { onLoadSuccess({ numPages: 30, getPage: async (page: number) => ({ getTextContent: async () => ({ items: [{ str: page === 20 ? "Bibliography result" : "Other text" }] }) }) }); }, [file]);
        return <div data-testid="pdf-document" data-file={file}>
        {children}
        <button onClick={() => onLoadError(new Error("PDF could not be read"))}>Fail PDF load</button>
    </div>;
    },
    Page: ({ pageNumber, renderTextLayer, renderAnnotationLayer }: { pageNumber: number; renderTextLayer: boolean; renderAnnotationLayer: boolean }) => <div data-testid="pdf-page" data-text={renderTextLayer} data-links={renderAnnotationLayer}>PDF page {pageNumber}</div>,
}; });

describe("PDF error recovery", () => {
    beforeEach(() => {
        vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
        vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
        Element.prototype.scrollIntoView = vi.fn();
    });
    afterEach(() => vi.unstubAllGlobals());

    it("keeps the successful PDF mounted during builds and compiler failures", () => {
        const { rerender } = render(<PDFPreview pdfPath="/project/main.pdf" error={null} />);
        const document = screen.getByTestId("pdf-document");
        rerender(<PDFPreview pdfPath="/project/main.pdf" error={null} compiling />);
        expect(screen.getByTestId("pdf-document")).toBe(document);
        rerender(<PDFPreview pdfPath="/project/main.pdf" error="Undefined command" />);
        expect(screen.getByTestId("pdf-document")).toBe(document);
        expect(screen.getByRole("status")).toHaveTextContent("Preview from last successful build");
    });

    it("retries a failed PDF load without reloading the application", () => {
        render(<PDFPreview pdfPath="/project/main.pdf" error={null} />);
        fireEvent.click(screen.getByRole("button", { name: "Fail PDF load" }));
        expect(screen.queryByTestId("pdf-document")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry PDF preview" }));
        expect(screen.getByTestId("pdf-document")).toHaveAttribute("data-file", "/project/main.pdf?rev=0&reload=1");
    });

    it("navigates pages and bounds the number of rendered canvases", () => {
        render(<PDFPreview pdfPath="/project/main.pdf" error={null} />);
        expect(screen.getAllByTestId("pdf-page").length).toBeLessThanOrEqual(5);
        fireEvent.change(screen.getByRole("spinbutton", { name: "Page number" }), { target: { value: "20" } });
        expect(screen.getByText("PDF page 20")).toBeInTheDocument();
        expect(screen.queryByText("PDF page 1")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Next page" }));
        expect(screen.getByRole("spinbutton", { name: "Page number" })).toHaveValue(21);
        expect(screen.getAllByTestId("pdf-page")[0]).toHaveAttribute("data-text", "true");
        expect(screen.getAllByTestId("pdf-page")[0]).toHaveAttribute("data-links", "true");
    });

    it("searches PDF text and navigates to a result", async () => {
        render(<PDFPreview pdfPath="/project/main.pdf" error={null} />);
        fireEvent.change(screen.getByRole("searchbox", { name: "Search PDF" }), { target: { value: "Bibliography" } });
        fireEvent.click(screen.getByRole("button", { name: "Find in PDF" }));
        fireEvent.click(await screen.findByRole("button", { name: "Page 20: Bibliography result" }));
        expect(screen.getByRole("spinbutton", { name: "Page number" })).toHaveValue(20);
    });

    it("exports through a native save dialog", async () => {
        render(<PDFPreview pdfPath="/project/main.pdf" error={null} />);
        fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith("export_pdf", { source: "/project/main.pdf", destination: "/exports/paper.pdf" }));
    });

    it('reveals and highlights a forward SyncTeX position', () => {
        render(<PDFPreview pdfPath="/project/main.pdf" error={null} location={{ file: '/project/chapter.tex', line: 7, page: 20, left: 72, top: 100, width: 120, height: 12, revision: 1 }} />);
        expect(screen.getByRole('spinbutton', { name: 'Page number' })).toHaveValue(20);
        expect(screen.getByLabelText('Source location')).toBeInTheDocument();
    });

    it('converts a clicked PDF location to page coordinates for inverse SyncTeX', () => {
        const onSource = vi.fn();
        render(<PDFPreview pdfPath="/project/main.pdf" error={null} onSource={onSource} />);
        const page = screen.getByText('PDF page 1').closest('[data-page]')!;
        vi.spyOn(page, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 20, left: 10, top: 20, right: 622, bottom: 812, width: 612, height: 792, toJSON: () => ({}) });
        fireEvent.doubleClick(page, { clientX: 82, clientY: 120 });
        expect(onSource).toHaveBeenCalledWith(1, 72, 100);
    });
});