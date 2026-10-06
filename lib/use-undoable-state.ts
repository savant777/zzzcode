"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
type HistoryUpdater<T> = T | ((previous: T) => T);
type History<T> = { value: T; past: T[]; future: T[]; pending: T | null };
const HISTORY_LIMIT = 50;
const HISTORY_DELAY = 700;

export const useUndoableState = <T,>(initialValue: T) => {
    const [state, setState] = useState<History<T>>({ value: initialValue, past: [], future: [], pending: null });
    const current = useRef(state);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const publish = useCallback((next: History<T>) => { current.current = next; setState(next); }, []);
    const clearTimer = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    }, []);
    const append = (past: T[], value: T) => [...past.slice(-(HISTORY_LIMIT - 1)), value];
    const setValue = useCallback((updater: HistoryUpdater<T>) => {
        const previous = current.current;
        const value = typeof updater === 'function' ? (updater as (value: T) => T)(previous.value) : updater;
        if (value === previous.value) return;
        publish({ ...previous, value, future: [], pending: previous.pending ?? previous.value });
        clearTimer();
        timer.current = setTimeout(() => {
            const latest = current.current;
            if (latest.pending !== null) publish({ ...latest, past: append(latest.past, latest.pending), pending: null });
            timer.current = null;
        }, HISTORY_DELAY);
    }, [publish, clearTimer]);
    // A confirmed reorder is its own undo step, separate from recent typing.
    const transact = useCallback((updater: HistoryUpdater<T>) => {
        const previous = current.current;
        const value = typeof updater === 'function' ? (updater as (value: T) => T)(previous.value) : updater;
        if (value === previous.value) return;
        clearTimer();
        const past = previous.pending !== null ? append(previous.past, previous.pending) : previous.past;
        publish({ value, past: append(past, previous.value), future: [], pending: null });
    }, [publish, clearTimer]);
    const reset = useCallback((value: T) => {
        clearTimer();
        publish({ value, past: [], future: [], pending: null });
    }, [publish, clearTimer]);
    const undo = useCallback(() => {
        clearTimer();
        const previous = current.current;
        if (previous.pending !== null) {
            publish({ ...previous, value: previous.pending, pending: null, future: [previous.value, ...previous.future] });
        } else if (previous.past.length) {
            publish({ value: previous.past[previous.past.length - 1], past: previous.past.slice(0, -1), future: [previous.value, ...previous.future], pending: null });
        }
    }, [publish, clearTimer]);
    const redo = useCallback(() => {
        const previous = current.current;
        if (!previous.future.length) return;
        clearTimer();
        publish({ value: previous.future[0], past: append(previous.past, previous.value), future: previous.future.slice(1), pending: null });
    }, [publish, clearTimer]);
    useEffect(() => () => clearTimer(), [clearTimer]);
    return { value: state.value, setValue, transact, reset, undo, redo,
        canUndo: state.pending !== null || state.past.length > 0, canRedo: state.future.length > 0 };
};
