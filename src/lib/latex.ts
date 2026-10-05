export interface LatexOutlineItem {
    title: string;
    kind: 'chapter' | 'section' | 'subsection' | 'subsubsection' | 'paragraph';
    level: number;
    line: number;
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
