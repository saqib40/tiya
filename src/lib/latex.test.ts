import { describe, expect, it } from "vitest";
import { latexCompletionContext, latexOutline } from "./latex";

describe("LaTeX outline", () => {
    it("extracts structural headings with source lines", () => {
        expect(latexOutline(String.raw`\chapter{Start}
Text
\section[Short]{Full title}
\subsection*{Details}`)).toEqual([
            { title: "Start", kind: "chapter", level: 1, line: 1 },
            { title: "Full title", kind: "section", level: 2, line: 3 },
            { title: "Details", kind: "subsection", level: 3, line: 4 },
        ]);
    });

    it("ignores comments but keeps headings before an unescaped comment", () => {
        expect(latexOutline(String.raw`% \section{Hidden}
\section{Visible} % \subsection{Hidden too}
Text \% not a comment`)).toEqual([
            { title: "Visible", kind: "section", level: 2, line: 2 },
        ]);
    });

    it("detects label and citation argument fragments", () => {
        expect(latexCompletionContext(String.raw`See \ref{sec:in`, 15)).toEqual({ kind: "label", startColumn: 10 });
        expect(latexCompletionContext(String.raw`\cite{first, kn`, 16)).toEqual({ kind: "citation", startColumn: 14 });
        expect(latexCompletionContext("plain text", 11)).toBeNull();
    });
});
