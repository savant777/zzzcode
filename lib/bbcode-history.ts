export type TextSnapshot = { value: string; start: number; end: number };

// Each textarea owns its history, including edits made by toolbar buttons.
export class BBCodeHistory {
    current: TextSnapshot;
    private past: TextSnapshot[] = [];
    private future: TextSnapshot[] = [];

    constructor(value: string) {
        this.current = { value, start: 0, end: 0 };
    }

    sync(value: string) {
        if (value === this.current.value) return;
        this.current = { value, start: 0, end: 0 };
        this.past = [];
        this.future = [];
    }

    select(start: number, end: number) {
        this.current = { ...this.current, start, end };
    }

    record(next: TextSnapshot) {
        if (next.value === this.current.value) return;
        this.past.push(this.current);
        if (this.past.length > 100) this.past.shift();
        this.current = next;
        this.future = [];
    }

    undo() {
        const previous = this.past.pop();
        if (!previous) return null;
        this.future.push(this.current);
        return this.current = previous;
    }

    redo() {
        const next = this.future.pop();
        if (!next) return null;
        this.past.push(this.current);
        return this.current = next;
    }
}
