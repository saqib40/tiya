export interface LatexOutlineItem {
    title: string;
    kind: 'chapter' | 'section' | 'subsection' | 'subsubsection' | 'paragraph';
    level: number;
    line: number;
}

export interface LatexCompletionContext {
    kind: 'label' | 'citation';
    startColumn: number;
}

const levels: Record<LatexOutlineItem['kind'], number> = {
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
    paragraph: 5,
};

function withoutComment(line: string) {
    for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== '%') continue;
        let slashes = 0;
        for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) slashes += 1;
        if (slashes % 2 === 0) return line.slice(0, index);
    }
    return line;
}

export function latexOutline(source: string): LatexOutlineItem[] {
    const outline: LatexOutlineItem[] = [];
    source.split(/\r?\n/).forEach((line, index) => {
        const content = withoutComment(line);
        const pattern = /\\(chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g;
        for (const match of content.matchAll(pattern)) {
            const kind = match[1] as LatexOutlineItem['kind'];
            outline.push({ title: match[2].trim(), kind, level: levels[kind], line: index + 1 });
        }
    });
    return outline;
}

export function latexCompletionContext(line: string, column: number): LatexCompletionContext | null {
    const beforeCursor = line.slice(0, Math.max(0, column - 1));
    const kind = /\\(?:ref|pageref|autoref|eqref)\{[^}]*$/.test(beforeCursor)
        ? 'label'
        : /\\(?:cite|citep|citet|nocite)\{[^}]*$/.test(beforeCursor) ? 'citation' : null;
    if (!kind) return null;
    const separator = Math.max(beforeCursor.lastIndexOf('{'), beforeCursor.lastIndexOf(','));
    const whitespace = beforeCursor.slice(separator + 1).match(/^\s*/)?.[0].length ?? 0;
    return { kind, startColumn: separator + whitespace + 2 };
}
