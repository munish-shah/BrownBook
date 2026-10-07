import { useRef, useState } from 'react';
import { Plus, X } from '@phosphor-icons/react';
import * as domain from '../domain.js';
import { Sheet } from './ui.jsx';

const EMPTY_TASK = { title: '', notes: '', difficulty: 'medium', recurring: false, recurrence: 'daily', activeDays: 3, breakDays: 1, cycleOffset: 0, expiration: '', customExpiration: '', distributeCoins: false, subtasks: [] };

export function TaskComposer({ onClose, act }) {
    const [draft, setDraft] = useState(EMPTY_TASK);
    const stepRefs = useRef([]);
    const set = patch => setDraft(current => ({ ...current, ...patch }));
    const level = domain.DIFFICULTIES[draft.difficulty];
    const levels = Object.entries(domain.DIFFICULTIES).filter(([key]) => !(draft.recurring && key === 'placeholder'));

    const steps = draft.subtasks.filter(step => step.title.trim());
    // Only steps with a title are saved, so only they count towards the split.
    const allocated = steps.reduce((sum, item) => sum + (Number(item.coins) || 0), 0);
    const splitMismatch = draft.distributeCoins && steps.length > 0 && allocated !== level.coins;
    const canSubmit = Boolean(draft.title.trim()) && !splitMismatch && !(draft.expiration === 'custom' && !draft.customExpiration);

    const submit = event => {
        event?.preventDefault();
        if (!canSubmit) return;
        const ok = act(data => { domain.createTask(data, draft); }, `Added ${draft.title.trim()}`, { undo: true });
        if (ok) onClose();
    };

    const setStep = (index, patch) => set({ subtasks: draft.subtasks.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
    const addStep = () => {
        set({ subtasks: [...draft.subtasks, { title: '', coins: 0 }] });
        setTimeout(() => stepRefs.current[draft.subtasks.length]?.focus(), 30);
    };
    const evenSplit = () => {
        const count = steps.length;
        if (!count) return;
        const base = Math.floor(level.coins / count);
        const remainder = level.coins - base * count;
        let seen = 0;
        set({ subtasks: draft.subtasks.map(item => (item.title.trim() ? { ...item, coins: base + (seen++ < remainder ? 1 : 0) } : item)) });
    };

    return (
        <Sheet
            title="New task"
            onClose={onClose}
            footer={<>
                <span className="footer-hint">⌘↵ to add</span>
                <button className="secondary" onClick={onClose}>Cancel</button>
                <button className="primary" disabled={!canSubmit} onClick={submit}>{draft.recurring ? 'Add ritual' : 'Add task'}</button>
            </>}
        >
            <form onSubmit={submit} className="form" onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event); }}>
                <input className="big" autoFocus value={draft.title} onChange={event => set({ title: event.target.value })} placeholder="What needs doing?" aria-label="Title" />
                <input value={draft.notes} onChange={event => set({ notes: event.target.value })} placeholder="Notes (optional)" aria-label="Notes" />
                <div className="chips">
                    {levels.map(([key, value]) => (
                        <button type="button" key={key} className={draft.difficulty === key ? 'chip on' : 'chip'} style={{ '--hue': value.hue }} onClick={() => set({ difficulty: key })}>
                            {value.label}<small>{value.coins}c · {value.time}</small>
                        </button>
                    ))}
                </div>
                <label className="toggle"><input type="checkbox" checked={draft.recurring} onChange={event => set({ recurring: event.target.checked, difficulty: event.target.checked && draft.difficulty === 'placeholder' ? 'quick' : draft.difficulty })} /> Recurring ritual</label>
                {draft.recurring ? (
                    <div className="row wrap">
                        <select value={draft.recurrence} onChange={event => set({ recurrence: event.target.value })} aria-label="Repeats"><option value="daily">Every day</option><option value="interval">On a cycle</option></select>
                        {draft.recurrence === 'interval' && <>
                            <input type="number" min="1" className="narrow" value={draft.activeDays} onChange={event => set({ activeDays: event.target.value })} aria-label="Days on" />
                            <span>days on,</span>
                            <input type="number" min="1" className="narrow" value={draft.breakDays} onChange={event => set({ breakDays: event.target.value })} aria-label="Days off" />
                            <span>off · started</span>
                            <select value={draft.cycleOffset} onChange={event => set({ cycleOffset: event.target.value })} aria-label="Cycle start"><option value="0">today</option><option value="1">yesterday</option><option value="2">2 days ago</option><option value="3">3 days ago</option></select>
                        </>}
                    </div>
                ) : (
                    <div className="row wrap">
                        <select value={draft.expiration} onChange={event => set({ expiration: event.target.value })} aria-label="Expiration">
                            <option value="">No expiration</option><option value="0">Expires at next 6 AM</option><option value="1">Expires in 1 day</option><option value="2">Expires in 2 days</option><option value="3">Expires in 3 days</option><option value="7">Expires in 1 week</option><option value="custom">Custom date…</option>
                        </select>
                        {draft.expiration === 'custom' && <input type="datetime-local" value={draft.customExpiration} onChange={event => set({ customExpiration: event.target.value })} aria-label="Expires at" />}
                    </div>
                )}
                <div className="steps">
                    <div className="row space">
                        <b>Steps</b>
                        <label className="toggle"><input type="checkbox" checked={draft.distributeCoins} onChange={event => set({ distributeCoins: event.target.checked })} /> Split coins across steps</label>
                    </div>
                    {draft.subtasks.map((subtask, index) => (
                        <div key={index} className="row">
                            <input
                                ref={node => { stepRefs.current[index] = node; }}
                                value={subtask.title}
                                onChange={event => setStep(index, { title: event.target.value })}
                                onKeyDown={event => { if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); addStep(); } }}
                                placeholder={`Step ${index + 1}`}
                                aria-label={`Step ${index + 1}`}
                            />
                            {draft.distributeCoins && <input type="number" min="0" className="narrow" value={subtask.coins} onChange={event => setStep(index, { coins: event.target.value })} aria-label={`Coins for step ${index + 1}`} />}
                            <button type="button" className="ghost" onClick={() => set({ subtasks: draft.subtasks.filter((_, i) => i !== index) })} aria-label={`Remove step ${index + 1}`}><X /></button>
                        </div>
                    ))}
                    <div className="row space">
                        <button type="button" className="secondary" onClick={addStep}><Plus /> Step</button>
                        {draft.distributeCoins && steps.length > 0 && (
                            <span className={splitMismatch ? 'hint bad' : 'hint'}>
                                {allocated} / {level.coins} coins
                                {splitMismatch && <button type="button" className="link" onClick={evenSplit}>Split evenly</button>}
                            </span>
                        )}
                    </div>
                </div>
                <button type="submit" hidden />
            </form>
        </Sheet>
    );
}

export function RewardComposer({ onClose, act }) {
    const [draft, setDraft] = useState({ name: '', description: '', category: 'other', cost: 50, shop: false, scalingType: 'add', scaling: 10 });
    const set = patch => setDraft(current => ({ ...current, ...patch }));
    const cost = Math.max(0, Number(draft.cost) || 0);
    const canSubmit = Boolean(draft.name.trim()) && cost > 0;
    const submit = event => {
        event?.preventDefault();
        if (!canSubmit) return;
        const ok = act(data => domain.createReward(data, { ...draft, cost }), `Added ${draft.name.trim()}`, { undo: true });
        if (ok) onClose();
    };
    return (
        <Sheet title="New reward" onClose={onClose} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!canSubmit} onClick={submit}>Add reward</button></>}>
            <form onSubmit={submit} className="form">
                <input className="big" autoFocus value={draft.name} onChange={event => set({ name: event.target.value })} placeholder="Reward name (try “30 min gaming”)" aria-label="Name" />
                <input value={draft.description} onChange={event => set({ description: event.target.value })} placeholder="Description (optional)" aria-label="Description" />
                <div className="chips">
                    {domain.CATEGORIES.map(category => <button type="button" key={category} className={draft.category === category ? 'chip on' : 'chip'} onClick={() => set({ category })}>{category}</button>)}
                </div>
                <div className="range">
                    <div className="row space"><span>Cost</span><input type="number" min="1" className="narrow" value={draft.cost} onChange={event => set({ cost: event.target.value })} aria-label="Cost in coins" /></div>
                    <input type="range" min="5" max="1000" step="5" value={Math.min(1000, cost)} onChange={event => set({ cost: Number(event.target.value) })} aria-label="Cost slider" />
                </div>
                <label className="toggle"><input type="checkbox" checked={draft.shop} onChange={event => set({ shop: event.target.checked })} /> Daily shop item (price scales with each purchase)</label>
                {draft.shop && (
                    <div className="row wrap">
                        <select value={draft.scalingType} onChange={event => set({ scalingType: event.target.value, scaling: event.target.value === 'multiply' ? 2 : 10 })} aria-label="Scaling type"><option value="add">Add coins each time</option><option value="multiply">Multiply each time</option></select>
                        <input type="number" min="0" step={draft.scalingType === 'multiply' ? '0.1' : '1'} className="narrow" value={draft.scaling} onChange={event => set({ scaling: Number(event.target.value) })} aria-label="Scaling amount" />
                    </div>
                )}
                <button type="submit" hidden />
            </form>
        </Sheet>
    );
}
