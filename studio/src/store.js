import { useCallback, useEffect, useRef, useState } from 'react';
import { createDefaultAppData, getDocumentSizeBytes, normalizeAppData } from '../../data-model.js';
import { createPreviewData } from '../../preview-data.js';

export const PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
const PREVIEW_KEY = 'brownbook_studio_preview_v1';
const SAVE_DELAY = 220;
const RETRY_DELAY = 5000;
const CONNECT_GRACE = 4000;
export const DOC_LIMIT_BYTES = 1_048_576;

// Start loading Firebase while React mounts instead of after the first render.
const firebaseReady = PREVIEW ? null : import('./firebase.js');

/** JSON with sorted keys, so two copies of the same document compare equal whatever their key order. */
function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

export function getSecretKey() {
    let key = localStorage.getItem('brownbook_secret_key');
    if (!key) {
        key = `user_${crypto.randomUUID().replaceAll('-', '')}`;
        localStorage.setItem('brownbook_secret_key', key);
    }
    return key;
}

export function useBrownBook() {
    const [data, setData] = useState(null);
    const [sync, setSync] = useState(PREVIEW ? 'preview' : 'connecting');
    const [bytes, setBytes] = useState(0);
    // dataRef is the source of truth so mutations run synchronously: thrown errors
    // (e.g. "Not enough coins") and return values reach the caller instead of
    // surfacing later inside React's render phase.
    const refs = useRef({ docRef: null, setDoc: null, timer: null, dirty: false, data: null, ready: PREVIEW });

    const publish = useCallback(next => {
        refs.current.data = next;
        setData(next);
    }, []);

    const flush = useCallback(async () => {
        const state = refs.current;
        clearTimeout(state.timer);
        if (PREVIEW || !state.dirty || !state.setDoc) return;
        const snapshot = state.data;
        state.dirty = false;
        try {
            // Firestore rejects `undefined` anywhere in a document; a JSON round-trip strips it.
            await state.setDoc(state.docRef, JSON.parse(JSON.stringify(snapshot)));
            setSync(state.dirty ? 'saving' : 'synced');
        } catch {
            state.dirty = true;
            setSync('offline');
            clearTimeout(state.timer);
            state.timer = setTimeout(flush, RETRY_DELAY);
        }
    }, []);

    useEffect(() => {
        if (PREVIEW) {
            const cached = sessionStorage.getItem(PREVIEW_KEY);
            publish(normalizeAppData(cached ? JSON.parse(cached) : createPreviewData()));
            return undefined;
        }

        let unsubscribe = () => {};
        const key = getSecretKey();
        const cacheKey = `brownbook_cache_${key}`;

        // Paint the last known state immediately; edits wait until the server copy arrives
        // so a stale cache can never overwrite newer data from another device.
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) publish(normalizeAppData(JSON.parse(cached)));
        } catch { /* ignore a corrupt cache */ }
        const graceTimer = setTimeout(() => { refs.current.ready = true; }, CONNECT_GRACE);

        (async () => {
            try {
                const firebase = await firebaseReady;
                refs.current.docRef = firebase.doc(firebase.db, 'users', key);
                refs.current.setDoc = firebase.setDoc;
                unsubscribe = firebase.onSnapshot(refs.current.docRef, snapshot => {
                    refs.current.ready = true;
                    if (snapshot.metadata.hasPendingWrites) return;
                    // Never let a remote snapshot clobber edits that have not been saved yet.
                    if (refs.current.dirty) return;
                    if (snapshot.metadata.fromCache && !snapshot.exists()) return;
                    const next = snapshot.exists() ? normalizeAppData(snapshot.data()) : createDefaultAppData();
                    setSync('synced');
                    // Our own saves echo back from the server. Keep the existing object when nothing
                    // changed, otherwise every save would invalidate pending Undo snapshots.
                    if (refs.current.data && stable(refs.current.data) === stable(next)) return;
                    try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* storage full */ }
                    publish(next);
                }, () => {
                    refs.current.ready = true;
                    const cached = localStorage.getItem(cacheKey);
                    if (cached && !refs.current.data) publish(normalizeAppData(JSON.parse(cached)));
                    setSync('offline');
                });
            } catch {
                const cached = localStorage.getItem(cacheKey);
                if (cached) publish(normalizeAppData(JSON.parse(cached)));
                setSync('offline');
            }
        })();

        const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
        const onOnline = () => { setSync(refs.current.dirty ? 'saving' : 'synced'); flush(); };
        const onOffline = () => setSync('offline');
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', flush);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        return () => {
            unsubscribe();
            clearTimeout(refs.current.timer);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', flush);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            clearTimeout(graceTimer);
        };
    }, [flush, publish]);

    const persist = useCallback(next => {
        publish(next);
        const json = JSON.stringify(next);
        try {
            if (PREVIEW) sessionStorage.setItem(PREVIEW_KEY, json);
            else localStorage.setItem(`brownbook_cache_${getSecretKey()}`, json);
        } catch { /* storage full or blocked: the live save below still happens */ }
        if (!PREVIEW) {
            refs.current.dirty = true;
            setSync('saving');
            clearTimeout(refs.current.timer);
            refs.current.timer = setTimeout(flush, SAVE_DELAY);
        }
        setBytes(new TextEncoder().encode(json).byteLength);
    }, [flush, publish]);

    const commit = useCallback(mutator => {
        const current = refs.current.data;
        if (!current) return undefined;
        if (!refs.current.ready) throw new Error('Still connecting — try again in a second.');
        // Mutate a clone: if the mutator throws, state is left untouched.
        const draft = structuredClone(current);
        const result = mutator(draft);
        persist(normalizeAppData(draft));
        return result;
    }, [persist]);

    /** Snapshot of the current document, for undo. */
    const peek = useCallback(() => refs.current.data, []);

    /** Put a snapshot back, but only if nothing else has changed since `expected`. */
    const restore = useCallback((snapshot, expected) => {
        if (refs.current.data !== expected) return false;
        persist(snapshot);
        return true;
    }, [persist]);

    useEffect(() => { if (data) setBytes(getDocumentSizeBytes(data)); }, [data === null]);

    return { data, sync, bytes, commit, peek, restore };
}
