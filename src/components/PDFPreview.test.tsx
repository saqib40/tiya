import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PDFPreview from "./PDFPreview";

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path }));
vi.mock("react-pdf", () => ({
    pdfjs: { GlobalWorkerOptions: {} },
    Document: ({ file, onLoadError, children }: { file: string; onLoadError: (error: Error) => void; children: React.ReactNode }) => <div data-testid="pdf-document" data-file={file}>
        {children}
        <button onClick={() => onLoadError(new Error("PDF could not be read"))}>Fail PDF load</button>
    </div>,
    Page: () => <div>PDF page</div>,
}));

describe("PDF error recovery", () => {
    beforeEach(() => {
        vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
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
});