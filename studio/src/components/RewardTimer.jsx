import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, Stop } from '@phosphor-icons/react';

const KEY = 'brownbook_studio_timer';

export function RewardTimer() {
    const [state, setState] = useState(() => {
        try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
    });
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const start = event => setState({ end: Date.now() + event.detail, paused: null });
        window.addEventListener('brownbook-timer', start);
        return () => window.removeEventListener('brownbook-timer', start);
    }, []);
    useEffect(() => {
        try {
            if (state) localStorage.setItem(KEY, JSON.stringify(state));
            else localStorage.removeItem(KEY);
        } catch { /* ignore */ }
    }, [state]);
    useEffect(() => {
        if (!state) return undefined;
        const id = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(id);
    }, [state]);

    const remaining = state ? (state.paused ?? Math.max(0, state.end - now)) : 0;
    const ringing = Boolean(state && state.paused === null && remaining === 0);

    useEffect(() => {
        if (!ringing) return undefined;
        const context = new AudioContext();
        context.resume?.();
        const beep = () => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(0.6, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.3);
        };
        beep();
        const id = setInterval(beep, 1000);
        return () => { clearInterval(id); context.close(); };
    }, [ringing]);

    // Keep the tab title useful while a timer runs.
    useEffect(() => {
        if (!state) return undefined;
        const seconds = Math.ceil(remaining / 1000);
        const stamp = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        document.title = ringing ? '⏰ Time’s up — BrownBook' : `${stamp} · BrownBook`;
        return () => { document.title = 'BrownBook'; };
    }, [state, remaining, ringing]);

    if (!state) return null;
    const seconds = Math.ceil(remaining / 1000);
    return (
        <motion.div className={ringing ? 'timer ringing' : 'timer'} role="timer" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            <b>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</b>
            {!ringing && (
                <button className="ghost" onClick={() => setState(state.paused !== null ? { end: Date.now() + state.paused, paused: null } : { ...state, paused: remaining })} aria-label={state.paused !== null ? 'Resume timer' : 'Pause timer'}>
                    {state.paused !== null ? <Play weight="fill" /> : <Pause weight="fill" />}
                </button>
            )}
            <button className="ghost" onClick={() => setState(null)} aria-label="Stop timer"><Stop weight="fill" /></button>
        </motion.div>
    );
}
