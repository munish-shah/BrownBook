import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowCounterClockwise, Minus, Pause, Play, Plus, Trash, X } from '@phosphor-icons/react';
import * as domain from '../domain.js';
import * as goals from '../goals.js';
import { Sheet } from './ui.jsx';
import { GoalChart, PaceBadge, fmtDate, fmtNumber, paceLine } from './goalUi.jsx';

const tomorrow = () => goals.addDaysKey(domain.todayKey(), 1);

/** Numeric check-in: how much did you get today? */
export function GoalLogDialog({ dialog, data, onClose, act }) {
    const goal = data.goals.find(candidate => candidate.id === dialog.goalId);
    const status = useMemo(() => (goal ? goals.goalStatus(data, goal) : null), [data, goal]);
    const isAmount = goal?.type === 'habit';
    const initial = goal ? (isAmount ? (goal.logs[domain.todayKey()] ?? goal.dailyTarget) : (status.entries.length ? status.current : goal.startValue)) : '';
    const [value, setValue] = useState(String(initial));
    useEffect(() => { if (!goal) onClose(); }, [goal, onClose]);
    if (!goal) return null;

    const step = isAmount ? (goal.dailyTarget >= 50 ? 10 : goal.dailyTarget >= 10 ? 1 : 0.5) : 0.1;
    const number = Number(value);
    const valid = value !== '' && Number.isFinite(number) && number >= 0;
    const unit = goal.unit ? ` ${goal.unit}` : '';
    const bump = amount => setValue(String(Math.max(0, Math.round((number + amount) * 100) / 100)));
    const hit = isAmount && valid && number >= goal.dailyTarget;
    const submit = event => {
        event?.preventDefault();
        if (!valid) return;
        const ok = act(draft => goals.logToday(draft, goal.id, number), result => (result?.awarded ? `+${result.awarded} · logged ${fmtNumber(number)}${unit}` : `Logged ${fmtNumber(number)}${unit}`), { undo: true });
        if (ok) onClose();
    };

    return (
        <Sheet title={goal.title} onClose={onClose} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!valid} onClick={submit}>Log it</button></>}>
            <form className="log-form" onSubmit={submit}>
                <p>{isAmount ? `How much today? Your goal is ${fmtNumber(goal.dailyTarget)}${unit}.` : `What's your number today? You're aiming for ${fmtNumber(goal.targetValue)}${unit}.`}</p>
                <div className="stepper">
                    <button type="button" className="secondary" onClick={() => bump(-step)} aria-label="Less"><Minus /></button>
                    <label><input autoFocus inputMode="decimal" value={value} onChange={event => setValue(event.target.value)} aria-label="Value" /><span>{goal.unit}</span></label>
                    <button type="button" className="secondary" onClick={() => bump(step)} aria-label="More"><Plus /></button>
                </div>
                {isAmount && (
                    <>
                        <div className="meter big" aria-hidden="true"><i className={hit ? 'hit' : ''} style={{ width: `${Math.min(100, (number / goal.dailyTarget) * 100 || 0)}%` }} /></div>
                        <div className="row space">
                            <small className={hit ? 'hint good' : 'hint'}>{valid ? `${fmtNumber(number)} / ${fmtNumber(goal.dailyTarget)}${unit} — ${hit ? 'counts as a hit' : 'not quite a hit, but logging still counts as showing up'}` : 'Enter a number'}</small>
                            <button type="button" className="link" onClick={() => setValue(String(goal.dailyTarget))}>Hit the goal</button>
                        </div>
                    </>
                )}
                <button type="submit" hidden />
            </form>
        </Sheet>
    );
}

const BLANK = {
    type: 'habit', title: '', unit: '', mode: 'check', dailyTarget: 8, daysGoal: 60, weeklyMin: 6,
    startValue: '', targetValue: '', deadline: '', frequency: 'weekly', link: true, deadlineOn: false, countInPulse: false
};

export function GoalComposer({ preset, data, onClose, act }) {
    const [draft, setDraft] = useState(() => ({ ...BLANK, ...(preset || {}), deadlineOn: Boolean(preset?.deadline) }));
    const set = patch => setDraft(current => ({ ...current, ...patch }));
    const isTarget = draft.type === 'target';
    const unit = draft.unit ? ` ${draft.unit}` : '';
    const activeCount = goals.activeGoals(data).length;

    const applyPreset = item => set({ ...BLANK, ...item, deadlineOn: false, deadline: '', startValue: '', targetValue: '' });
    const summary = isTarget
        ? (draft.startValue !== '' && draft.targetValue !== '' && draft.deadline ? `Go from ${draft.startValue} to ${draft.targetValue}${unit} by ${fmtDate(draft.deadline)}.` : 'Pick a start, a target and a date.')
        : `${draft.mode === 'amount' ? `Hit ${draft.dailyTarget || '…'}${unit}` : 'Do it'} on ${draft.daysGoal || '…'} days. A week counts as good at ${draft.weeklyMin} of 7.`;

    const submit = event => {
        event?.preventDefault();
        const ok = act(data2 => { goals.createGoal(data2, { ...draft, deadline: isTarget || draft.deadlineOn ? draft.deadline : '' }); }, `Goal added: ${draft.title.trim()}`, { undo: true });
        if (ok) onClose();
    };

    return (
        <Sheet title="New goal" wide onClose={onClose} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!draft.title.trim()} onClick={submit}>Add goal</button></>}>
            <form className="form" onSubmit={submit}>
                <div className="chips presets">
                    {goals.GOAL_PRESETS.map(item => <button type="button" key={item.id} className="chip" onClick={() => applyPreset(item)}>{item.label}</button>)}
                </div>
                <div className="type-tabs" role="tablist" aria-label="Goal type">
                    <button type="button" role="tab" aria-selected={!isTarget} className={!isTarget ? 'type on' : 'type'} onClick={() => set({ type: 'habit' })}><b>A habit</b><small>Hit it on N days — sleep, protein, workouts</small></button>
                    <button type="button" role="tab" aria-selected={isTarget} className={isTarget ? 'type on' : 'type'} onClick={() => set({ type: 'target' })}><b>A target</b><small>Reach a number by a date — weight, a lift, savings</small></button>
                </div>

                <input className="big" autoFocus value={draft.title} onChange={event => set({ title: event.target.value })} placeholder={isTarget ? 'e.g. Reach 175 lb' : 'e.g. Sleep 8 hours'} aria-label="Goal name" />

                {isTarget ? (
                    <>
                        <div className="grid3">
                            <label>Start<input inputMode="decimal" value={draft.startValue} onChange={event => set({ startValue: event.target.value })} placeholder="185" /></label>
                            <label>Target<input inputMode="decimal" value={draft.targetValue} onChange={event => set({ targetValue: event.target.value })} placeholder="175" /></label>
                            <label>Unit<input value={draft.unit} onChange={event => set({ unit: event.target.value })} placeholder="lb" /></label>
                        </div>
                        <label>Reach it by<input type="date" min={tomorrow()} value={draft.deadline} onChange={event => set({ deadline: event.target.value })} /></label>
                        <label>Check-in in Today
                            <select value={draft.frequency} onChange={event => set({ frequency: event.target.value })}>
                                <option value="weekly">Once a week (a “log” ritual appears that day)</option>
                                <option value="daily">Every day</option>
                                <option value="none">Never — I’ll log from the Goals tab</option>
                            </select>
                        </label>
                    </>
                ) : (
                    <>
                        <div className="chips">
                            <button type="button" className={draft.mode === 'check' ? 'chip plain on' : 'chip plain'} onClick={() => set({ mode: 'check' })}>Just hit or miss<small>Tap done each day</small></button>
                            <button type="button" className={draft.mode === 'amount' ? 'chip plain on' : 'chip plain'} onClick={() => set({ mode: 'amount' })}>Hit an amount<small>Log how much, like 8 of 8</small></button>
                        </div>
                        {draft.mode === 'amount' && (
                            <div className="grid2">
                                <label>Daily amount<input inputMode="decimal" value={draft.dailyTarget} onChange={event => set({ dailyTarget: event.target.value })} /></label>
                                <label>Unit<input value={draft.unit} onChange={event => set({ unit: event.target.value })} placeholder="hrs, g, L…" /></label>
                            </div>
                        )}
                        <div className="grid2">
                            <label>For how many days<input type="number" min="1" value={draft.daysGoal} onChange={event => set({ daysGoal: event.target.value })} /></label>
                            <label className="check-label"><span>Finish by a date</span><input type="checkbox" checked={draft.deadlineOn} onChange={event => set({ deadlineOn: event.target.checked })} /></label>
                        </div>
                        {draft.deadlineOn && <label>Date<input type="date" min={tomorrow()} value={draft.deadline} onChange={event => set({ deadline: event.target.value })} /></label>}
                        <div className="range">
                            <div className="row space"><span>A good week is</span><b>{draft.weeklyMin} of 7 days</b></div>
                            <input type="range" min="1" max="7" value={draft.weeklyMin} onChange={event => set({ weeklyMin: Number(event.target.value) })} aria-label="Days for a good week" />
                            <small className="hint">Missing a day is fine. Goals are measured by weeks, not by an unbroken streak.</small>
                        </div>
                        <label className="toggle"><input type="checkbox" checked={draft.link} onChange={event => set({ link: event.target.checked })} /> Add a daily check-in to Today</label>
                    </>
                )}

                <label className="toggle"><input type="checkbox" checked={draft.countInPulse} onChange={event => set({ countInPulse: event.target.checked })} /> Count its check-ins in my Pulse consistency <small className="hint">(off keeps goals separate)</small></label>
                <p className="summary">{summary}</p>
                {activeCount >= goals.MAX_ACTIVE_GOALS && <small className="hint warn">You already have {activeCount} active goals. Fewer goals tend to get finished; consider pausing one.</small>}
                <button type="submit" hidden />
            </form>
        </Sheet>
    );
}

export function GoalDetail({ dialog, data, onClose, act }) {
    const goal = data.goals.find(candidate => candidate.id === dialog.goalId);
    const status = useMemo(() => (goal ? goals.goalStatus(data, goal) : null), [data, goal]);
    const [title, setTitle] = useState(goal?.title ?? '');
    const [pastDate, setPastDate] = useState(domain.todayKey());
    const [pastValue, setPastValue] = useState('');
    useEffect(() => { if (!goal) onClose(); }, [goal, onClose]);
    if (!goal) return null;

    const save = patch => act(draft => goals.updateGoal(draft, goal.id, patch));
    const routine = goals.linkedRoutine(data, goal);
    const unit = goal.unit ? ` ${goal.unit}` : '';
    const logs = Object.entries(goal.logs).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 12);
    const numberField = (label, field, extra = {}) => (
        <label key={field}>{label}<input inputMode="decimal" defaultValue={goal[field] ?? ''} onBlur={event => { if (event.target.value !== String(goal[field] ?? '')) save({ [field]: event.target.value }); }} {...extra} /></label>
    );

    return (
        <Sheet
            title="Goal"
            wide
            onClose={onClose}
            footer={<>
                <button className="danger-ghost" onClick={() => { act(draft => goals.deleteGoal(draft, goal.id), `Deleted ${goal.title}`, { undo: true }); onClose(); }}><Trash /> Delete</button>
                {goal.archived
                    ? <button className="secondary" onClick={() => act(draft => goals.restoreGoal(draft, goal.id), 'Goal restored')}><ArrowCounterClockwise /> Restore</button>
                    : <>
                        <button className="secondary" onClick={() => { act(draft => goals.archiveGoal(draft, goal.id), `Archived ${goal.title}`, { undo: true }); onClose(); }}><Archive /> {status.pace === 'done' ? 'Archive' : 'Retire'}</button>
                        <button className="secondary" onClick={() => act(draft => (goal.paused ? goals.resumeGoal(draft, goal.id) : goals.pauseGoal(draft, goal.id)), goal.paused ? 'Goal resumed' : 'Goal paused')}>{goal.paused ? <><Play /> Resume</> : <><Pause /> Pause</>}</button>
                    </>}
                <button className="primary" onClick={onClose}>Done</button>
            </>}
        >
            <div className="form">
                <div className="row space">
                    <input className="big" value={title} onChange={event => setTitle(event.target.value)} onBlur={() => { if (!title.trim()) setTitle(goal.title); else if (title.trim() !== goal.title) save({ title }); }} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} aria-label="Goal name" />
                    <PaceBadge pace={status.pace} />
                </div>
                <p className="pace-line">{paceLine(goal, status)}</p>
                <GoalChart goal={goal} status={status} />

                <div className="settings">
                    {goal.type === 'target' ? (
                        <>
                            {numberField(`Target${unit}`, 'targetValue')}
                            <label>Reach it by<input type="date" defaultValue={goal.deadline} onBlur={event => { if (event.target.value && event.target.value !== goal.deadline) save({ deadline: event.target.value }); }} /></label>
                        </>
                    ) : (
                        <>
                            {goal.mode === 'amount' && numberField(`Daily amount${unit}`, 'dailyTarget')}
                            {numberField('Days to hit', 'daysGoal', { inputMode: 'numeric' })}
                            <label>A good week
                                <select value={goal.weeklyMin} onChange={event => save({ weeklyMin: Number(event.target.value) })}>
                                    {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} of 7 days</option>)}
                                </select>
                            </label>
                        </>
                    )}
                </div>

                <label className="toggle"><input type="checkbox" checked={Boolean(routine)} onChange={event => act(draft => goals.setGoalLink(draft, goal.id, event.target.checked, goal.type === 'target' ? 'weekly' : 'daily'))} /> {goal.type === 'target' ? 'Weekly log ritual in Today' : 'Daily check-in in Today'}</label>
                <label className="toggle"><input type="checkbox" checked={goal.countInPulse} onChange={event => save({ countInPulse: event.target.checked })} /> Count its check-ins in Pulse consistency</label>

                <div className="steps">
                    <div className="row space"><b>Entries</b><small className="hint">{Object.keys(goal.logs).length} logged</small></div>
                    <form className="row" onSubmit={event => { event.preventDefault(); if (pastValue === '') return; if (act(draft => goals.logGoal(draft, goal.id, pastDate, pastValue), `Logged ${fmtDate(pastDate)}`)) setPastValue(''); }}>
                        <input type="date" value={pastDate} max={domain.todayKey()} onChange={event => setPastDate(event.target.value)} aria-label="Date" />
                        <input inputMode="decimal" className="narrow" value={pastValue} onChange={event => setPastValue(event.target.value)} placeholder={goal.type === 'habit' && goal.mode === 'check' ? '1 = hit' : unit.trim() || 'value'} aria-label="Value" />
                        <button className="secondary" type="submit"><Plus /> Add</button>
                    </form>
                    {logs.length === 0 && <small className="hint">Nothing logged yet.</small>}
                    <ul className="log-list">
                        {logs.map(([key, value]) => (
                            <li key={key}>
                                <span>{fmtDate(key)}</span>
                                <b>{fmtNumber(value)}{unit}</b>
                                {goal.type === 'habit' && <em className={goals.isHit(goal, value) ? 'hit' : 'miss'}>{goals.isHit(goal, value) ? 'hit' : 'missed'}</em>}
                                <button className="ghost" onClick={() => act(draft => goals.removeGoalLog(draft, goal.id, key), 'Entry removed', { undo: true })} aria-label={`Remove ${fmtDate(key)}`}><X /></button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </Sheet>
    );
}
