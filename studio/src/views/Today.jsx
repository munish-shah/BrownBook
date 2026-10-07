import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowCounterClockwise, CaretDown, Check, CheckCircle, Pause, PencilSimple, Plus, PushPin, PushPinSlash, Repeat, Sparkle, Trash, Tray } from '@phosphor-icons/react';
import * as domain from '../domain.js';
import { Ring, formatLeft } from '../components/ui.jsx';
import { Subtasks } from '../components/Subtasks.jsx';

const isRoutineId = (data, id) => data.recurringTasks.some(task => task.id === id);

export default function Today({ data, act, openComposer, setDialog }) {
    const dayKey = domain.todayKey();
    // dayKey in the deps makes everything recompute when the 6 AM reset passes.
    const today = useMemo(() => domain.deriveToday(data), [data, dayKey]);
    const currentStreak = useMemo(() => domain.streak(data), [data, dayKey]);
    const [focusId, setFocusId] = useState(null);
    const [openIds, setOpenIds] = useState(() => {
        try { return new Set(JSON.parse(sessionStorage.getItem('brownbook-open-tasks') || '[]')); } catch { return new Set(); }
    });
    const toggleOpen = id => setOpenIds(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        try { sessionStorage.setItem('brownbook-open-tasks', JSON.stringify([...next])); } catch { /* ignore */ }
        return next;
    });
    const hero = today.focus.find(task => task.id === focusId) || today.focus[0];
    const hour = new Date().getHours();
    const greeting = hour < 6 ? 'Late night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';

    const complete = task => act(draft => domain.completeTask(draft, task.id), awarded => awarded ? `+${awarded} coins · ${task.title}` : `Cleared ${task.title}`, { undo: true });
    const routine = task => act(draft => domain.toggleRoutine(draft, task.id), ({ awarded, bonus }) => bonus ? `+${awarded} and +${bonus} early-bird bonus` : awarded ? `+${awarded} · ${task.title}` : `Undid ${task.title}`, { undo: true });
    const pin = task => act(draft => domain.togglePin(draft, task.id));
    const detail = (task, kind) => setDialog({ type: 'detail', id: task.id, kind });

    const pinCandidates = [...today.routinesOpen, ...today.open].slice(0, 4);
    const queue = useMemo(() => [...today.open].sort((a, b) => (a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity) - (b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity)), [today.open]);
    const ritualTotal = today.routinesDone.length + today.routinesOpen.length + today.focus.filter(task => isRoutineId(data, task.id)).length;

    return (
        <div className="today">
            <section className="hero-zone">
                <div className="hero-copy">
                    <p className="eyebrow">{greeting} · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                    <h1>{today.remaining === 0 ? 'All clear.' : <>{today.remaining} thing{today.remaining === 1 ? '' : 's'} <span>left today.</span></>}</h1>
                    {today.vacation && <p className="vacation-note"><Sparkle weight="fill" /> Vacation day — streak protected</p>}
                </div>
                <div className="dial">
                    <Ring value={today.percent} />
                    <div className="dial-label"><b>{today.percent}%</b><span>{currentStreak} day streak</span></div>
                </div>
            </section>

            <div className="today-main">
                {hero ? (
                    <FocusCard
                        key={hero.id}
                        task={hero}
                        tabs={today.focus}
                        onSelect={setFocusId}
                        act={act}
                        isRoutine={isRoutineId(data, hero.id)}
                        onComplete={() => (isRoutineId(data, hero.id) ? routine(hero) : complete(hero))}
                        onDetail={() => detail(hero, isRoutineId(data, hero.id) ? 'routine' : 'task')}
                        onUnpin={() => pin(hero)}
                    />
                ) : (
                    <div className="focus-card empty">
                        <PushPin size={30} />
                        <b>Nothing pinned</b>
                        <span>Pin what matters most and it lives here, with its steps.</span>
                        {pinCandidates.length > 0 && (
                            <div className="pin-suggest">
                                {pinCandidates.map(task => <button key={task.id} className="chip" onClick={() => pin(task)}><PushPin /> {task.title}</button>)}
                            </div>
                        )}
                    </div>
                )}
                {today.completedToday.length > 0 && (
                    <section className="done-strip">
                        <h2><CheckCircle /> Done today <small>{today.completedToday.length}</small></h2>
                        <div>
                            {today.completedToday.map(task => (
                                <button key={task.id} onClick={() => act(draft => domain.reopenTask(draft, task.id), `Reopened ${task.title}`)} title="Reopen">
                                    <Check weight="bold" /> {task.title} <ArrowCounterClockwise />
                                </button>
                            ))}
                        </div>
                    </section>
                )}
            </div>

            <div className="today-side">
                <section className="track">
                    <header><h2><Repeat /> Rituals</h2><span>{today.routinesDone.length}/{ritualTotal}</span></header>
                    <div className="orbs">
                        {[...today.routinesOpen, ...today.routinesDone].map(task => {
                            const done = data.recurringCompletions[task.id] === today.today;
                            const level = domain.DIFFICULTIES[task.difficulty];
                            const steps = task.subtasks.length;
                            return (
                                <motion.div layout key={task.id} className={done ? 'orb done' : 'orb'} style={{ '--hue': level.hue }}>
                                    <motion.button whileTap={{ scale: 0.9 }} className="orb-face" onClick={() => routine(task)} aria-label={`${done ? 'Undo' : 'Complete'} ${task.title}`}>
                                        {done ? <Check weight="bold" /> : <span>{level.coins}</span>}
                                    </motion.button>
                                    <button className="orb-title" onClick={() => detail(task, 'routine')} title="Open details and steps">
                                        <b>{task.title}</b>
                                        <small>{steps ? `${task.subtasks.filter(step => step.completed).length}/${steps} steps` : task.notes || level.label}</small>
                                    </button>
                                    <div className="orb-tools">
                                        <button onClick={() => pin(task)} aria-label={`Pin ${task.title}`} title="Pin to focus"><PushPin /></button>
                                        <button onClick={() => detail(task, 'routine')} aria-label={`Edit ${task.title}`} title="Edit and add steps"><PencilSimple /></button>
                                        <button onClick={() => setDialog({ type: 'suspend', task })} aria-label={`Pause ${task.title}`} title="Pause"><Pause /></button>
                                        <button onClick={() => act(draft => domain.deleteRoutine(draft, task.id), `Deleted ${task.title}`, { undo: true })} aria-label={`Delete ${task.title}`} title="Delete"><Trash /></button>
                                    </div>
                                </motion.div>
                            );
                        })}
                        {ritualTotal === 0 && <p className="quiet">No rituals scheduled today.</p>}
                    </div>
                    {today.suspended.length > 0 && (
                        <div className="suspended">
                            Paused: {today.suspended.map(task => (
                                <button key={task.id} onClick={() => act(draft => domain.resumeRoutine(draft, task.id), `Resumed ${task.title}`)}><Pause weight="fill" /> {task.title} · resume</button>
                            ))}
                        </div>
                    )}
                </section>

                <section className="queue">
                    <header><h2><Tray /> Queue <small>{queue.length}</small></h2><button onClick={openComposer}><Plus /> Detailed</button></header>
                    <QuickAdd act={act} />
                    <ul>
                        <AnimatePresence initial={false}>
                            {queue.map(task => (
                                <QueueItem key={task.id} task={task} act={act} open={openIds.has(task.id)} onToggle={() => toggleOpen(task.id)} onComplete={() => complete(task)} onPin={() => pin(task)} onDetail={() => detail(task, 'task')} />
                            ))}
                        </AnimatePresence>
                        {queue.length === 0 && <li className="quiet">Queue is empty — add something above.</li>}
                    </ul>
                </section>
            </div>
        </div>
    );
}

function QuickAdd({ act }) {
    const [title, setTitle] = useState('');
    const [difficulty, setDifficulty] = useState('medium');
    const submit = event => {
        event.preventDefault();
        if (!title.trim()) return;
        const ok = act(draft => domain.createTask(draft, { title, notes: '', difficulty, recurring: false, expiration: '', distributeCoins: false, subtasks: [] }), `Added ${title.trim()}`, { undo: true });
        if (ok) setTitle('');
    };
    return (
        <form className="quick-add" onSubmit={submit}>
            <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Add a task…" aria-label="Quick add a task" />
            <select value={difficulty} onChange={event => setDifficulty(event.target.value)} aria-label="Difficulty" title={`${domain.DIFFICULTIES[difficulty].coins} coins`}>
                {Object.entries(domain.DIFFICULTIES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
        </form>
    );
}

function FocusCard({ task, tabs, onSelect, act, isRoutine, onComplete, onDetail, onUnpin }) {
    const done = task.subtasks.filter(subtask => subtask.completed).length;
    const level = domain.DIFFICULTIES[task.difficulty];
    const reward = task.distributeCoins ? task.subtasks.reduce((sum, subtask) => sum + subtask.coins, 0) : level.coins;
    return (
        <motion.article layout="position" className="focus-card" style={{ '--hue': level.hue }}>
            {tabs.length > 1 && (
                <div className="focus-tabs" role="tablist" aria-label="Pinned items">
                    {tabs.map(item => (
                        <button key={item.id} role="tab" aria-selected={item.id === task.id} className={item.id === task.id ? 'focus-tab on' : 'focus-tab'} onClick={() => onSelect(item.id)}>
                            <PushPin weight="fill" /><span>{item.title}</span>
                        </button>
                    ))}
                </div>
            )}
            <div className="focus-meta">
                <span className="badge"><PushPin weight="fill" /> Focus{tabs.length > 1 ? ` · ${tabs.findIndex(item => item.id === task.id) + 1} of ${tabs.length}` : ''}</span>
                <span className="badge">{level.label} · {reward}c</span>
                {isRoutine && <span className="badge"><Repeat /> Ritual</span>}
            </div>
            <h2>{task.title}</h2>
            <div className="focus-scroll">
                {task.notes && <p className="focus-notes">{task.notes}</p>}
                {task.subtasks.length > 0 && (
                    <div className="progress-line"><span className="track-bar"><motion.i animate={{ width: `${(done / task.subtasks.length) * 100}%` }} /></span><span>{done}/{task.subtasks.length}</span></div>
                )}
                <Subtasks task={task} kind={isRoutine ? 'routine' : 'task'} act={act} />
            </div>
            <div className="focus-actions">
                <motion.button whileTap={{ scale: 0.96 }} className="primary" onClick={onComplete}><Check weight="bold" /> Complete</motion.button>
                <button className="secondary" onClick={onDetail}><PencilSimple /> Edit</button>
                <button className="secondary" onClick={onUnpin}><PushPinSlash /> Unpin</button>
            </div>
        </motion.article>
    );
}

function QueueItem({ task, act, open, onToggle, onComplete, onPin, onDetail }) {
    const level = domain.DIFFICULTIES[task.difficulty];
    const left = task.expiresAt ? new Date(task.expiresAt) - new Date() : null;
    const steps = task.subtasks.length;
    const doneSteps = task.subtasks.filter(subtask => subtask.completed).length;
    return (
        <motion.li initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0 }} transition={{ duration: 0.2 }} className={open ? 'queue-item open' : 'queue-item'} style={{ '--hue': level.hue }}>
            <div className="queue-row">
                <motion.button whileTap={{ scale: 0.85 }} className="check" onClick={onComplete} aria-label={`Complete ${task.title}`}><Check weight="bold" /></motion.button>
                <button className="queue-body" onClick={onToggle} aria-expanded={open}>
                    <b>{task.title}</b>
                    <small>
                        {level.label}
                        {left !== null && <em className={left < 7_200_000 ? 'urgent' : ''}> · {formatLeft(left)}</em>}
                    </small>
                </button>
                <span className="coins">{level.coins}</span>
                <div className="row-tools">
                    <button className="ghost" onClick={onDetail} aria-label={`Edit ${task.title}`} title="Edit"><PencilSimple /></button>
                    <button className="ghost" onClick={onPin} aria-label={`Pin ${task.title}`} title="Pin to focus"><PushPin /></button>
                    <button className="ghost" onClick={() => act(draft => domain.deleteTask(draft, task.id), `Deleted ${task.title}`, { undo: true })} aria-label={`Delete ${task.title}`} title="Delete"><Trash /></button>
                </div>
                <button className={steps ? 'steps-toggle has-steps' : 'steps-toggle'} onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} steps for ${task.title}`} title={open ? 'Hide steps' : steps ? 'Show steps' : 'Add steps'}>
                    {steps > 0 ? <span className="steps-count">{doneSteps}/{steps}</span> : <Plus />}
                    <CaretDown className="caret" weight="bold" />
                </button>
            </div>
            {steps > 0 && <div className="mini-progress" aria-hidden="true"><i style={{ width: `${(doneSteps / steps) * 100}%` }} /></div>}
            {/* Height is animated with a CSS grid-rows transition: compositor-friendly, no JS layout measuring. */}
            <div className="detail-wrap" data-open={open} inert={!open}>
                <div className="detail-clip">
                    <div className="queue-detail">
                        {task.notes && <p>{task.notes}</p>}
                        {steps > 0 && <div className="progress-line"><span className="track-bar"><i style={{ width: `${(doneSteps / steps) * 100}%` }} /></span><span>{doneSteps}/{steps}</span></div>}
                        <Subtasks task={task} kind="task" act={act} compact />
                        <div className="detail-actions">
                            <button onClick={onDetail}><PencilSimple /> Edit</button>
                            <button onClick={onPin}><PushPin /> Pin</button>
                            <button className="bad" onClick={() => act(draft => domain.deleteTask(draft, task.id), `Deleted ${task.title}`, { undo: true })}><Trash /> Delete</button>
                        </div>
                    </div>
                </div>
            </div>
        </motion.li>
    );
}
