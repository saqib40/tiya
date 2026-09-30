interface Draft {
    content: string;
    savedContent: string;
}

const recoveryKey = "tiya.recovery.v1";

function readDrafts(): Record<string, Draft> {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(recoveryKey) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter(([, value]) =>
            value && typeof value.content === "string" && typeof value.savedContent === "string"));
    } catch {
        return {};
    }
}

export function recoveredDraft(path: string): Draft | undefined {
    return readDrafts()[path];
}

export function journalDrafts(buffers: Record<string, Draft>, previousPaths: string[]) {
    const drafts = readDrafts();
    for (const path of previousPaths) delete drafts[path];
    for (const [path, buffer] of Object.entries(buffers)) {
        if (buffer.content !== buffer.savedContent) drafts[path] = { content: buffer.content, savedContent: buffer.savedContent };
    }
    if (Object.keys(drafts).length) localStorage.setItem(recoveryKey, JSON.stringify(drafts));
    else localStorage.removeItem(recoveryKey);
}