import { parser } from "synctex-js";
import { dirname, isAbsolute, join, normalize } from "pathe";

export interface SyncBox {
    file: string;
    line: number;
    page: number;
    left: number;
    top: number;
    width: number;
    height: number;
}

interface ParsedBlock {
    file?: { path: string };
    line: number;
    page: number;
    left: number;
    bottom: number;
    width: number | null;
    height: number;
    elements?: ParsedBlock[];
}

function sourcePath(path: string, root: string) {
    const resolved = normalize(isAbsolute(path) ? path : join(dirname(root), path));
    return /^[a-z]:/i.test(resolved) ? resolved.toLowerCase() : resolved;
}

export function parseSyncMap(content: string, root: string): SyncBox[] {
    const parsed = parser.parseSyncTex(content) as { hBlocks: ParsedBlock[]; offset: { x: number; y: number } };
    const boxes: SyncBox[] = [];
    for (const block of parsed.hBlocks) {
        for (const element of block.elements?.length ? block.elements : [block]) {
            if (!element.file?.path || element.line < 1 || element.page < 1) continue;
            const box = {
                file: sourcePath(element.file.path, root), line: element.line, page: element.page,
                left: element.left + parsed.offset.x, top: element.bottom - (element.height || block.height || 10) + parsed.offset.y,
                width: Math.max(1, element.width || 1), height: Math.max(1, element.height || block.height || 10),
            };
            if ([box.left, box.top, box.width, box.height, box.line, box.page].every(Number.isFinite)) boxes.push(box);
        }
    }
    return boxes;
}

export function forwardSync(boxes: SyncBox[], file: string, line: number): SyncBox | null {
    const source = sourcePath(file, file);
    return boxes.filter(box => box.file === source).sort((first, second) => Math.abs(first.line - line) - Math.abs(second.line - line) || first.page - second.page || first.top - second.top)[0] || null;
}

export function inverseSync(boxes: SyncBox[], page: number, left: number, top: number): SyncBox | null {
    const distance = (box: SyncBox) => Math.hypot(Math.max(box.left - left, 0, left - box.left - box.width), Math.max(box.top - top, 0, top - box.top - box.height));
    return boxes.filter(box => box.page === page).sort((first, second) => distance(first) - distance(second) || first.width * first.height - second.width * second.height)[0] || null;
}