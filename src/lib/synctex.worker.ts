import { parseSyncMap } from "./synctex";

self.onmessage = ({ data }: MessageEvent<{ content: string; root: string }>) => {
    try { self.postMessage({ boxes: parseSyncMap(data.content, data.root) }); }
    catch (failure) { self.postMessage({ error: `SyncTeX data could not be read: ${String(failure)}` }); }
};