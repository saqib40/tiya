import { describe, expect, it } from "vitest";
import { forwardSync, inverseSync, parseSyncMap } from "./synctex";
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const content = `SyncTeX Version:1
Input:1:/project/main.tex
Input:2:chapters/./intro.tex
Output:pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,12:4736286,46945331:22609920,40894464,0
(2,7:4736286,8865054:22609920,448000,0
h2,7:4736286,8865054:6578176,448000,0
)
]
}1
Postamble:
Count:8
`;

describe('SyncTeX navigation', () => {
    it('maps a chapter source line to a PDF position through the parser', () => {
        const boxes = parseSyncMap(content, '/project/main.tex');
        const target = forwardSync(boxes, '/project/chapters/intro.tex', 8);
        expect(target).toMatchObject({ file: '/project/chapters/intro.tex', line: 7, page: 1 });
        expect(target!.width).toBeCloseTo(100);
        expect(inverseSync(boxes, 1, target!.left + 1, target!.top + 1)).toEqual(target);
    });

    it('never matches a different source with the same basename or a missing page', () => {
        const boxes = parseSyncMap(content, '/project/main.tex');
        expect(forwardSync(boxes, '/elsewhere/intro.tex', 7)).toBeNull();
        expect(inverseSync(boxes, 2, 70, 100)).toBeNull();
    });

    it('normalizes Windows source paths without losing drive letters', () => {
        const boxes = parseSyncMap(content.replace('/project/main.tex', 'C:/Papers/main.tex').replace('chapters/./intro.tex', 'C:/Papers/chapters/intro.tex'), 'C:/Papers/main.tex');
        expect(forwardSync(boxes, 'c:/papers/chapters/intro.tex', 7)?.line).toBe(7);
    });

    it.skipIf(process.env.TIYA_TEST_ENGINE !== '1')('maps real multi-file Tectonic output in both directions', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'tiya-sync-'));
        try {
            await mkdir(join(directory, 'chapters'));
            const root = join(directory, 'main.tex');
            const chapter = join(directory, 'chapters', 'intro.tex');
            await writeFile(root, String.raw`\documentclass{article}
\begin{document}
\input{chapters/intro}
\newpage
\section{Second page}
A second page for PDF navigation.
\end{document}`);
            await writeFile(chapter, String.raw`\section{Introduction}
An identifiable SyncTeX chapter.
`);
            const target = process.platform === 'win32' ? 'x86_64-pc-windows-msvc.exe' : process.platform === 'darwin' ? `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin` : 'x86_64-unknown-linux-gnu';
            execFileSync(resolve('src-tauri/binaries', `tectonic-${target}`), ['-X', 'compile', '--synctex', '--untrusted', root], { cwd: directory, timeout: 300_000 });
            const bytes = await readFile(join(directory, 'main.pdf'));
            expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
            const index = parseSyncMap(gunzipSync(await readFile(join(directory, 'main.synctex.gz'))).toString(), root);
            const location = forwardSync(index, chapter, 2);
            expect(location?.page).toBe(1);
            expect(Math.abs(location!.line - 2)).toBeLessThanOrEqual(1);
            expect(inverseSync(index, 1, location!.left + 0.1, location!.top + 0.1)?.file).toBe(location!.file);
            if (process.env.TIYA_SMOKE_OUTPUT) {
                const output = resolve(process.env.TIYA_SMOKE_OUTPUT);
                await mkdir(output, { recursive: true });
                await copyFile(join(directory, 'main.pdf'), join(output, 'main.pdf'));
                await copyFile(join(directory, 'main.synctex.gz'), join(output, 'main.synctex.gz'));
            }
        } finally { await rm(directory, { recursive: true, force: true }); }
    }, 300_000);
});