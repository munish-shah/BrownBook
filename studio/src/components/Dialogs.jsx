import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, EyeSlash, PushPin, PushPinSlash, Pause, Trash } from '@phosphor-icons/react';
import { PREVIEW, getSecretKey } from '../store.js';
import * as domain from '../domain.js';
import { Sheet } from './ui.jsx';
import { Subtasks } from './Subtasks.jsx';

export function Dialog({ dialog, data, onClose, act, setDialog }) {
    switch (dialog.type) {
        case 'claim': return <ClaimDialog dialog={dialog} data={data} onClose={onClose} act={act} />;
        case 'suspend': return <SuspendDialog dialog={dialog} onClose={onClose} act={act} />;
        case 'key': return <KeyDialog onClose={onClose} />;
        case 'import': return <ImportDialog onClose={onClose} act={act} />;
        case 'detail': return <DetailDialog dialog={dialog} data={data} onClose={onClose} act={act} setDialog={setDialog} />;
        default: return null;
    }
}

function ClaimDialog({ dialog, data, onClose, act }) {
    const [startTimer, setStartTimer] = useState(true);
    const name = dialog.item?.name || dialog.reward.name;
    const duration = domain.parseDuration(name);
    const balance = data.stats.currentBalance;
    const claim = () => {
        const ok = act(draft => (dialog.item
            ? domain.claimShopItem(draft, draft.customShopItems.find(item => item.id === dialog.item.id))
            : domain.claimReward(draft, draft.rewards.find(reward => reward.id === dialog.reward.id))), price => `−${price} coins · enjoy it`, { undo: true });
        if (ok && duration && startTimer) window.dispatchEvent(new CustomEvent('brownbook-timer', { detail: duration }));
        onClose();
    };
    return (
        <Sheet title={`Claim ${name}`} onClose={onClose} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" autoFocus onClick={claim}>Spend {dialog.price}</button></>}>
            <p>Spend <b>{dialog.price}</b> coins on {name}? You'll have <b>{balance - dialog.price}</b> left.</p>
            {duration > 0 && <label className="toggle"><input type="checkbox" checked={startTimer} onChange={event => setStartTimer(event.target.checked)} /> Start a {Math.round(duration / 60000)} minute timer</label>}
        </Sheet>
    );
}

function SuspendDialog({ dialog, onClose, act }) {
    const [days, setDays] = useState(7);
    const [mode, setMode] = useState('days');
    const [until, setUntil] = useState('');
    const valid = mode === 'indefinite' || (mode === 'days' && Number(days) >= 1) || (mode === 'date' && until);
    const confirm = () => {
        let end = null;
        if (mode === 'days') { const date = domain.taskDay(); date.setDate(date.getDate() + Math.max(1, Number(days)) - 1); date.setHours(23, 59, 59, 999); end = date.toISOString(); }
        if (mode === 'date' && until) { const date = new Date(`${until}T00:00:00`); date.setHours(23, 59, 59, 999); end = date.toISOString(); }
        act(data => domain.suspendRoutine(data, dialog.task.id, end), `Paused ${dialog.task.title}`, { undo: true });
        onClose();
    };
    return (
        <Sheet title={`Pause ${dialog.task.title}`} onClose={onClose} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!valid} onClick={confirm}>Pause</button></>}>
            <div className="chips">
                {[['days', 'For days'], ['date', 'Until date'], ['indefinite', 'Indefinitely']].map(([value, label]) => <button type="button" key={value} className={mode === value ? 'chip on' : 'chip'} onClick={() => setMode(value)}>{label}</button>)}
            </div>
            {mode === 'days' && <input type="number" min="1" value={days} onChange={event => setDays(event.target.value)} aria-label="Days" />}
            {mode === 'date' && <input type="date" value={until} min={domain.dateKey(new Date())} onChange={event => setUntil(event.target.value)} aria-label="Until" />}
            <p>While paused it won't show up, won't count against your consistency and won't break your streak.</p>
        </Sheet>
    );
}

function KeyDialog({ onClose }) {
    const [key, setKey] = useState(PREVIEW ? 'local-preview' : getSecretKey());
    const [shown, setShown] = useState(false);
    const valid = key.trim().length >= 8;
    return (
        <Sheet title="Device key" onClose={onClose} footer={<><button className="secondary" onClick={onClose}>Close</button><button className="primary" disabled={PREVIEW || !valid} onClick={() => { localStorage.setItem('brownbook_secret_key', key.trim()); location.reload(); }}>Load key</button></>}>
            <p>Use the same key on every device to share one BrownBook. Anyone with this key can read and change your data, so keep it private. Loading a different key switches to a different save.</p>
            <div className="row">
                <input type={shown ? 'text' : 'password'} value={key} onChange={event => setKey(event.target.value)} aria-label="Device key" spellCheck={false} autoComplete="off" />
                <button className="ghost" onClick={() => setShown(value => !value)} aria-label={shown ? 'Hide key' : 'Show key'}>{shown ? <EyeSlash /> : <Eye />}</button>
                <button className="secondary" onClick={() => navigator.clipboard.writeText(key).then(() => toast('Key copied'), () => toast.error('Copy failed'))}>Copy</button>
            </div>
            {PREVIEW && <small className="hint">Disabled in preview mode.</small>}
        </Sheet>
    );
}

function ImportDialog({ onClose, act }) {
    const [json, setJson] = useState('');
    const [summary, setSummary] = useState(null);
    const read = text => {
        setJson(text);
        try {
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed.tasks) || !parsed.stats || typeof parsed.stats !== 'object') throw new Error();
            setSummary({ ok: true, text: `${parsed.tasks.length} tasks, ${(parsed.recurringTasks || []).length} rituals, ${(parsed.completedHistory || []).length} log entries, ${parsed.stats.currentBalance ?? 0} coins` });
        } catch {
            setSummary(text.trim() ? { ok: false, text: 'That does not look like a BrownBook backup.' } : null);
        }
    };
    const apply = () => {
        const parsed = JSON.parse(json);
        const ok = act(data => {
            try { localStorage.setItem('brownbook_pre_import_backup', JSON.stringify({ savedAt: new Date().toISOString(), data })); } catch { /* storage full: continue */ }
            Object.keys(data).forEach(field => delete data[field]);
            Object.assign(data, parsed);
        }, 'Backup imported — your previous data is kept in this browser', { undo: true });
        if (ok) onClose();
    };
    return (
        <Sheet title="Import backup" onClose={onClose} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="danger" disabled={!summary?.ok} onClick={apply}>Replace data</button></>}>
            <p>This replaces everything in the current save. Export a backup first if you are unsure — you can also undo right after importing.</p>
            <input type="file" accept="application/json,.json" aria-label="Backup file" onChange={event => event.target.files[0]?.text().then(read)} />
            <textarea rows="6" value={json} onChange={event => read(event.target.value)} placeholder="…or paste the backup JSON here" aria-label="Backup JSON" />
            {summary && <small className={summary.ok ? 'hint' : 'hint bad'}>{summary.ok ? `Ready to import: ${summary.text}` : summary.text}</small>}
        </Sheet>
    );
}

function DetailDialog({ dialog, data, onClose, act }) {
    const isRoutine = dialog.kind === 'routine';
    const task = (isRoutine ? data.recurringTasks : data.tasks).find(candidate => candidate.id === dialog.id);
    const [title, setTitle] = useState(task?.title ?? '');
    const [notes, setNotes] = useState(task?.notes ?? '');
    useEffect(() => { if (!task) onClose(); }, [task, onClose]);
    if (!task) return null;

    const save = patch => act(draft => domain.updateTask(draft, task.id, dialog.kind, patch));
    const commitTitle = () => {
        if (!title.trim()) { setTitle(task.title); return; }
        if (title.trim() !== task.title) save({ title });
    };
    const commitNotes = () => { if (notes.trim() !== task.notes) save({ notes }); };
    const pinned = data.focusPinnedIds.includes(task.id);
    const levels = Object.entries(domain.DIFFICULTIES).filter(([key]) => !(isRoutine && key === 'placeholder'));
    const expiry = task.expiresAt ? new Date(task.expiresAt) : null;
    const setExpiry = value => {
        if (value === 'none') save({ expiresAt: null });
        else save({ expiresAt: domain.nextResetAfter(new Date(), Number(value)).toISOString() });
    };

    return (
        <Sheet
            title={isRoutine ? 'Edit ritual' : 'Edit task'}
            wide
            onClose={onClose}
            footer={<>
                <button className="danger-ghost" onClick={() => { act(draft => (isRoutine ? domain.deleteRoutine(draft, task.id) : domain.deleteTask(draft, task.id)), `Deleted ${task.title}`, { undo: true }); onClose(); }}><Trash /> Delete</button>
                {isRoutine && <button className="secondary" onClick={() => setDialog({ type: 'suspend', task })}><Pause /> Pause</button>}
                <button className="secondary" onClick={() => act(draft => domain.togglePin(draft, task.id))}>{pinned ? <><PushPinSlash /> Unpin</> : <><PushPin /> Pin</>}</button>
                <button className="primary" onClick={onClose}>Done</button>
            </>}
        >
            <div className="form">
                <input className="big" value={title} onChange={event => setTitle(event.target.value)} onBlur={commitTitle} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} aria-label="Title" />
                <textarea rows="2" value={notes} onChange={event => setNotes(event.target.value)} onBlur={commitNotes} placeholder="Notes" aria-label="Notes" />
                <div className="chips">
                    {levels.map(([key, value]) => (
                        <button type="button" key={key} className={task.difficulty === key ? 'chip on' : 'chip'} style={{ '--hue': value.hue }} onClick={() => save({ difficulty: key })}>{value.label}<small>{value.coins}c</small></button>
                    ))}
                </div>
                {!isRoutine && (
                    <div className="row wrap">
                        <span>Expiration</span>
                        <select value="" onChange={event => event.target.value && setExpiry(event.target.value)} aria-label="Change expiration">
                            <option value="">{expiry ? `Expires ${expiry.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'No expiration'}</option>
                            <option value="none">Never expires</option><option value="0">At next 6 AM</option><option value="1">In 1 day</option><option value="2">In 2 days</option><option value="3">In 3 days</option><option value="7">In 1 week</option>
                        </select>
                    </div>
                )}
                {isRoutine && task.type === 'interval' && <small className="hint">Cycle: {task.activeDays} days on, {task.breakDays} off.</small>}
                <div className="steps">
                    <b>Steps</b>
                    <Subtasks task={task} kind={dialog.kind} act={act} />
                </div>
            </div>
        </Sheet>
    );
}
