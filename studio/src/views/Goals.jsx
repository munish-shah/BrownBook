import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Check, Pause, Play, Plus, Target, Trophy } from '@phosphor-icons/react';
import * as domain from '../domain.js';
import * as goals from '../goals.js';
import { PaceBadge, WeekDots, fmtDate, fmtNumber, paceLine } from '../components/goalUi.jsx';

export default function Goals({ data, act, setDialog, openComposer }) {
    const dayKey = domain.todayKey();
    const rows = useMemo(() => data.goals.map(goal => ({ goal, status: goals.goalStatus(data, goal) })), [data, dayKey]);
    const active = rows.filter(row => !row.goal.archived && !row.goal.paused);
    const paused = rows.filter(row => !row.goal.archived && row.goal.paused);
    const archived = rows.filter(row => row.goal.archived);
    const summary = ['ahead', 'on-track', 'behind', 'done'].map(pace => [pace, active.filter(row => row.status.pace === pace).length]).filter(([, count]) => count);

    return (
        <div className="goals">
            <header className="goals-head">
                <div>
                    <p className="eyebrow">Long-term</p>
                    <h1>Goals</h1>
                    <p className="goals-sub">{active.length ? `${active.length} active${summary.length ? ' · ' : ''}${summary.map(([pace, count]) => `${count} ${pace === 'on-track' ? 'on track' : pace === 'done' ? 'achieved' : pace}`).join(' · ')}` : 'Big things, tracked in tiny daily steps.'}</p>
                </div>
                <button className="primary" onClick={() => openComposer()}><Plus /> New goal</button>
            </header>

            {rows.length === 0 && (
                <div className="goals-empty">
                    <Target size={34} />
                    <b>What do you want to be true in a few months?</b>
                    <span>Pick a starting point. Each goal adds one small check-in to Today, and Pulse stays about your daily tasks.</span>
                    <div className="chips">
                        {goals.GOAL_PRESETS.map(item => <button key={item.id} className="chip" onClick={() => openComposer(item)}>{item.label}</button>)}
                    </div>
                </div>
            )}

            <div className="goal-grid">
                {active.map(({ goal, status }) => <GoalCard key={goal.id} goal={goal} status={status} data={data} act={act} setDialog={setDialog} />)}
            </div>
            {active.length > goals.MAX_ACTIVE_GOALS && <p className="goals-hint">That's a lot to carry at once. Pausing a goal keeps its history and takes it off Today.</p>}

            {paused.length > 0 && (
                <section className="goal-group">
                    <h2><Pause /> Paused <small>{paused.length}</small></h2>
                    <div className="goal-mini">
                        {paused.map(({ goal }) => (
                            <div key={goal.id} className="mini-row">
                                <button className="mini-title" onClick={() => setDialog({ type: 'goal-detail', goalId: goal.id })}>{goal.title}</button>
                                <button className="secondary" onClick={() => act(draft => goals.resumeGoal(draft, goal.id), `Resumed ${goal.title}`)}><Play /> Resume</button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {archived.length > 0 && (
                <details className="goal-group">
                    <summary><Trophy /> Finished and retired <small>{archived.length}</small></summary>
                    <div className="goal-mini">
                        {archived.map(({ goal, status }) => (
                            <div key={goal.id} className="mini-row">
                                <button className="mini-title" onClick={() => setDialog({ type: 'goal-detail', goalId: goal.id })}>{goal.title}</button>
                                <small>{status.pace === 'done' ? 'Achieved' : 'Retired'}</small>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}

function GoalCard({ goal, status, data, act, setDialog }) {
    const unit = goal.unit ? ` ${goal.unit}` : '';
    const isTarget = goal.type === 'target';
    const today = domain.todayKey();
    const needsNumber = isTarget || goal.mode === 'amount';
    const logged = goal.logs[today];
    const open = () => setDialog({ type: 'goal-detail', goalId: goal.id });
    const logNow = () => setDialog({ type: 'goal-log', goalId: goal.id });
    const toggleHit = () => act(
        draft => (status.hitToday ? goals.removeGoalLog(draft, goal.id, today) : goals.logToday(draft, goal.id, 1)),
        result => (result?.awarded ? `+${result.awarded} · ${goal.title}` : null),
        { undo: true }
    );

    return (
        <motion.article layout="position" className={`goal-card pace-${status.pace}`}>
            <header>
                <button className="goal-title" onClick={open}>{goal.title}</button>
                <PaceBadge pace={status.pace} />
            </header>

            <div className="goal-figure">
                {isTarget ? (
                    <><b>{fmtNumber(status.current)}</b><span>→ {fmtNumber(goal.targetValue)}{unit}</span></>
                ) : (
                    <><b>{status.daysHit}</b><span>/ {goal.daysGoal} days</span></>
                )}
            </div>

            <div className="goal-bar" role="progressbar" aria-valuenow={Math.round(status.progress * 100)} aria-valuemin="0" aria-valuemax="100">
                <i style={{ width: `${status.progress * 100}%` }} />
                {status.expected !== null && status.expected !== undefined && !status.done && <u style={{ left: `${status.expected * 100}%` }} title="Where the plan says you'd be today" />}
            </div>
            <p className="goal-line">{paceLine(goal, status)}</p>
            {goal.deadline && <small className="goal-date">By {fmtDate(goal.deadline)}</small>}

            {!isTarget && <WeekDots dots={status.dots} />}

            <footer>
                {goal.paused ? (
                    <button className="secondary" onClick={() => act(draft => goals.resumeGoal(draft, goal.id), `Resumed ${goal.title}`)}><Play /> Resume</button>
                ) : needsNumber ? (
                    <button className={logged !== undefined && !isTarget && status.hitToday ? 'secondary done' : 'secondary'} onClick={logNow}>
                        {logged !== undefined ? <><Check weight="bold" /> Logged {fmtNumber(logged)}{unit} · change</> : <><Plus /> {isTarget ? 'Log a value' : 'Log today'}</>}
                    </button>
                ) : (
                    <button className={status.hitToday ? 'secondary done' : 'secondary'} onClick={toggleHit}>
                        {status.hitToday ? <><Check weight="bold" /> Done today · undo</> : <><Check /> Hit it today</>}
                    </button>
                )}
                <button className="ghost-link" onClick={open}>Details</button>
            </footer>
        </motion.article>
    );
}
