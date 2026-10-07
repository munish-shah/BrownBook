import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { Calendar, CloudSlash, Command as CommandIcon, Coins, Gift, Lightning, Plus, Tray } from '@phosphor-icons/react';
import { DOC_LIMIT_BYTES, useBrownBook } from './store.js';
import { THEMES, applyTheme } from './themes.js';
import * as domain from './domain.js';
import { AnimatedNumber, spring } from './components/ui.jsx';
import { RewardComposer, TaskComposer } from './components/Composers.jsx';
import { Dialog } from './components/Dialogs.jsx';
import { RewardTimer } from './components/RewardTimer.jsx';
import { Logo } from './components/Logo.jsx';
import Today from './views/Today.jsx';
import Vault from './views/Vault.jsx';
import Log from './views/Log.jsx';

const Pulse = lazy(() => import('./views/Pulse.jsx'));
const CommandPalette = lazy(() => import('./components/CommandPalette.jsx'));

const VIEWS = [
    { id: 'today', label: 'Today', icon: Lightning, key: '1' },
    { id: 'vault', label: 'Vault', icon: Gift, key: '2' },
    { id: 'pulse', label: 'Pulse', icon: Calendar, key: '3' },
    { id: 'log', label: 'Log', icon: Tray, key: '4' }
];

const SYNC_LABEL = { synced: 'Saved', saving: 'Saving…', connecting: 'Connecting…', offline: 'Offline', preview: 'Preview' };

export default function App() {
    const { data, sync, bytes, commit, peek, restore } = useBrownBook();
    const [view, setView] = useState(() => {
        const saved = sessionStorage.getItem('brownbook-view');
        return VIEWS.some(item => item.id === saved) ? saved : 'today';
    });
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [paletteLoaded, setPaletteLoaded] = useState(false);
    const [composer, setComposer] = useState(false);
    const [rewardComposer, setRewardComposer] = useState(false);
    const [dialog, setDialog] = useState(null);
    const [theme, setTheme] = useState(localStorage.getItem('brownbook-theme') || 'default');
    const [tick, setTick] = useState(0);

    useEffect(() => { sessionStorage.setItem('brownbook-view', view); }, [view]);
    useEffect(() => { applyTheme(theme); }, [theme]);
    useEffect(() => {
        if (data?.settings?.theme && THEMES[data.settings.theme] && data.settings.theme !== theme) setTheme(data.settings.theme);
    }, [data?.settings?.theme]);

    // Re-render every 30 s so countdowns, expiry and the 6 AM reset stay current.
    useEffect(() => {
        const id = setInterval(() => setTick(value => value + 1), 30_000);
        const onVisible = () => document.visibilityState === 'visible' && setTick(value => value + 1);
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    }, []);

    useEffect(() => {
        if (!data) return;
        const now = new Date();
        const expired = data.tasks.filter(task => task.expiresAt && new Date(task.expiresAt) <= now);
        if (expired.length) {
            try {
                commit(draft => {
                    draft.tasks = draft.tasks.filter(task => !task.expiresAt || new Date(task.expiresAt) > now);
                    draft.focusPinnedIds = draft.focusPinnedIds.filter(id => draft.tasks.some(task => task.id === id) || draft.recurringTasks.some(task => task.id === id));
                });
                toast(`${expired.length === 1 ? `“${expired[0].title}” expired` : `${expired.length} tasks expired`}`);
            } catch { /* still connecting: try again on the next tick */ }
        }
    }, [data, tick, commit]);

    useEffect(() => {
        if (bytes > DOC_LIMIT_BYTES * 0.85) {
            toast.warning('Your BrownBook is nearly full. Export a backup from Log and consider archiving old history.', { id: 'storage-warning', duration: 10_000 });
        }
    }, [bytes > DOC_LIMIT_BYTES * 0.85]);

    useEffect(() => {
        const onKey = event => {
            const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
            const modalOpen = Boolean(document.querySelector('[role="dialog"], [cmdk-root]'));
            const mod = event.metaKey || event.ctrlKey;
            if (mod && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setPaletteLoaded(true);
                setPaletteOpen(open => !open);
            } else if (mod && event.key.toLowerCase() === 'n') {
                event.preventDefault();
                setComposer(true);
            } else if (!typing && !modalOpen && !mod && !event.altKey) {
                const target = VIEWS.find(item => item.key === event.key);
                if (target) setView(target.id);
                else if (event.key === 'n') { event.preventDefault(); setComposer(true); }
                else if (event.key === '/') { event.preventDefault(); setPaletteLoaded(true); setPaletteOpen(true); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const changeTheme = useCallback(id => {
        setTheme(id);
        try { commit(draft => { draft.settings = { ...draft.settings, theme: id }; }); } catch { /* still connecting: the theme still applies locally */ }
    }, [commit]);

    /** Run a mutation. Returns true on success. `opts.undo` adds an Undo action to the toast. */
    const act = useCallback((fn, message, opts = {}) => {
        const before = peek();
        try {
            const result = commit(fn);
            const after = peek();
            const text = typeof message === 'function' ? message(result) : message;
            if (text) {
                toast(text, opts.undo ? {
                    duration: 6000,
                    action: { label: 'Undo', onClick: () => (restore(before, after) ? toast('Undone') : toast.error('Can’t undo — something changed since.')) }
                } : undefined);
            }
            return true;
        } catch (error) {
            toast.error(error.message);
            return false;
        }
    }, [commit, peek, restore]);

    const openPalette = () => { setPaletteLoaded(true); setPaletteOpen(true); };
    const closeDialog = useCallback(() => setDialog(null), []);

    if (!data) {
        return (
            <div className="boot">
                {sync === 'offline'
                    ? <div className="boot-error"><b>Can’t reach your BrownBook.</b><p>Check your connection. Nothing has been changed — it will load as soon as you’re back online.</p><button className="secondary" onClick={() => location.reload()}>Try again</button></div>
                    : <span />}
            </div>
        );
    }

    return (
        <MotionConfig reducedMotion="user">
        <div className="shell">
            <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
            <TopBar data={data} sync={sync} view={view} setView={setView} openPalette={openPalette} />
            {sync === 'offline' && <div className="offline-banner" role="status"><CloudSlash /> Offline — your changes are saved on this device and will sync when you’re back online.</div>}
            <main className="stage">
                {/* CSS enter animation: no exit phase to wait for, so view changes are instant and never stall */}
                <section key={view} className="view">
                    {view === 'today' && <Today data={data} act={act} openComposer={() => setComposer(true)} setDialog={setDialog} />}
                    {view === 'vault' && <Vault data={data} act={act} openComposer={() => setRewardComposer(true)} setDialog={setDialog} />}
                    {view === 'pulse' && <Suspense fallback={<div className="view-loading"><span /></div>}><Pulse data={data} /></Suspense>}
                    {view === 'log' && <Log data={data} act={act} bytes={bytes} />}
                </section>
            </main>
            <button className="fab" onClick={() => setComposer(true)} aria-label="New task" title="New task (N)"><Plus weight="bold" /></button>
            {paletteLoaded && (
                <Suspense fallback={null}>
                    <CommandPalette
                        open={paletteOpen}
                        onClose={() => setPaletteOpen(false)}
                        data={data}
                        views={VIEWS}
                        setView={setView}
                        theme={theme}
                        changeTheme={changeTheme}
                        openComposer={() => setComposer(true)}
                        openRewardComposer={() => setRewardComposer(true)}
                        setDialog={setDialog}
                        act={act}
                    />
                </Suspense>
            )}
            <AnimatePresence>
                {composer && <TaskComposer key="task" onClose={() => setComposer(false)} act={act} />}
                {rewardComposer && <RewardComposer key="reward" onClose={() => setRewardComposer(false)} act={act} />}
                {dialog && <Dialog key={`${dialog.type}-${dialog.id || ''}`} dialog={dialog} data={data} onClose={closeDialog} act={act} setDialog={setDialog} />}
            </AnimatePresence>
            <RewardTimer />
            <Toaster position="top-center" offset={76} theme={THEMES[theme]?.light ? 'light' : 'dark'} toastOptions={{ className: 'toast' }} />
        </div>
        </MotionConfig>
    );
}

function TopBar({ data, sync, view, setView, openPalette }) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    return (
        <header className="topbar">
            <div className="brand"><Logo /><span>BrownBook</span></div>
            <LayoutGroup>
                <nav className="segments" aria-label="Views">
                    {VIEWS.map(item => (
                        <button key={item.id} className={view === item.id ? 'segment active' : 'segment'} onClick={() => setView(item.id)} aria-current={view === item.id ? 'page' : undefined}>
                            {view === item.id && <motion.span layoutId="segment-pill" className="segment-pill" transition={spring} />}
                            <item.icon weight={view === item.id ? 'fill' : 'regular'} />
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>
            </LayoutGroup>
            <div className="top-actions">
                <button className="kbar" onClick={openPalette} aria-label="Open command palette"><CommandIcon /><span>Command</span><kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd></button>
                <div className={`sync sync-${sync}`} role="status" title={SYNC_LABEL[sync]}><i /><span>{SYNC_LABEL[sync]}</span></div>
                <div className="wallet" aria-label={`${data.stats.currentBalance} coins`}>
                    <Coins weight="fill" /><b><AnimatedNumber value={data.stats.currentBalance} /></b>
                </div>
            </div>
        </header>
    );
}
