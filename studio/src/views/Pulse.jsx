import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, ChartBar, Lightning } from '@phosphor-icons/react';
import * as domain from '../domain.js';
import { Stat } from '../components/ui.jsx';

const RANGES = [['daily', 'Daily', 'Day'], ['weekly', 'Weekly', 'Week'], ['monthly', 'Monthly', 'Month'], ['yearly', 'Yearly', 'Year']];
const CELL = 18;
const GAP = 4;
const LABEL_COLUMN = 34;

const tier = rate => (rate >= 80 ? 'high' : rate >= 50 ? 'medium' : 'low');
const shortDate = date => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function Pulse({ data, act }) {
    const dayKey = domain.todayKey();
    const [range, setRange] = useState(() => {
        try { return localStorage.getItem('brownbook-pulse-range') || 'daily'; } catch { return 'daily'; }
    });
    const [picked, setPicked] = useState(null);
    const [hovered, setHovered] = useState(null);
    const changeRange = next => {
        setRange(next);
        setPicked(null);
        setHovered(null);
        try { localStorage.setItem('brownbook-pulse-range', next); } catch { /* ignore */ }
    };

    const series = useMemo(() => domain.periodSeries(data, range), [data, range, dayKey]);
    const streaks = useMemo(() => domain.allStreaks(data), [data, dayKey]);
    const currentStreak = useMemo(() => domain.streak(data), [data, dayKey]);
    const scored = series.filter(point => !point.vacation);
    const average = scored.length ? Math.round(scored.reduce((sum, point) => sum + point.rate, 0) / scored.length) : 0;
    const best = scored.length ? scored.reduce((top, point) => (point.rate > top.rate ? point : top), scored[0]) : null;
    const periodLabel = RANGES.find(item => item[0] === range)[2];
    const liveRoutines = data.recurringTasks.filter(task => !task.deleted).length;
    const top = useMemo(() => [...streaks].sort((a, b) => b.length - a.length || b.end - a.end).slice(0, 3), [streaks]);
    const active = hovered ?? picked;
    const detail = active !== null && series[active] ? series[active] : series.at(-1);

    const counts = Object.entries(domain.DIFFICULTIES).filter(([key]) => key !== 'placeholder').map(([key, value]) => ({
        key, ...value, count: Number(data.stats[`tasksCompleted${key[0].toUpperCase()}${key.slice(1)}`]) || 0
    }));
    const maxCount = Math.max(1, ...counts.map(item => item.count));
    const totalDone = counts.reduce((sum, item) => sum + item.count, 0);

    return (
        <div className="pulse">
            <section className="stat-row">
                <Stat label="Average consistency" value={series.length ? `${average}%` : '—'} tone={series.length ? tier(average) : undefined} />
                <Stat label={`Best ${periodLabel.toLowerCase()}`} value={best ? best.label : '—'} />
                <Stat label="Rituals" value={liveRoutines} />
                <Stat label="Current streak" value={`${currentStreak}${currentStreak ? ' 🔥' : ''}`} />
            </section>

            <section className="chart-panel">
                <header>
                    <h2><ChartBar /> Consistency</h2>
                    <div className="filters" role="tablist" aria-label="Time range">
                        {RANGES.map(([id, label]) => (
                            <button key={id} role="tab" aria-selected={range === id} className={range === id ? 'filter on' : 'filter'} onClick={() => changeRange(id)}>{label}</button>
                        ))}
                    </div>
                </header>
                {series.length === 0 ? (
                    <p className="quiet">No data yet. Complete some rituals and they will show up here.</p>
                ) : (
                    <>
                        <div className="bars" style={{ '--count': series.length }} onMouseLeave={() => setHovered(null)}>
                            {series.map((point, index) => (
                                <button
                                    key={`${range}-${point.label}`}
                                    className={`bar-col ${point.vacation ? 'vacation' : tier(point.rate)}${detail === point ? ' picked' : ''}`}
                                    onMouseEnter={() => setHovered(index)}
                                    onFocus={() => setHovered(index)}
                                    onBlur={() => setHovered(null)}
                                    onClick={() => setPicked(current => (current === index ? null : index))}
                                    aria-label={`${point.title}: ${point.vacation ? 'vacation' : `${Math.round(point.rate)}%`}`}
                                >
                                    <em>{point.vacation ? '🏖️' : `${Math.round(point.rate)}%`}</em>
                                    <span className="bar-track"><motion.i initial={{ height: 0 }} animate={{ height: `${Math.max(point.rate, 3)}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} /></span>
                                    <small>{point.label}</small>
                                </button>
                            ))}
                        </div>
                        {detail && (
                            <div className="heat-detail">
                                <b>{detail.title}</b>
                                <span>{detail.vacation ? (detail.tasks ? 'Vacation day — protected' : 'Vacation — nothing was expected, so it counts as 100%') : detail.tasks ? `${detail.completed}/${detail.expected} rituals` : `${Math.round(detail.rate)}% over ${detail.days} day${detail.days === 1 ? '' : 's'}${detail.vacationDays ? ` · ${detail.vacationDays} vacation day${detail.vacationDays === 1 ? '' : 's'} not counted` : ''}`}</span>
                                {detail.tasks && !detail.vacation && <div>{detail.tasks.map(task => <i key={task.id} className={task.done ? 'yes' : 'no'}>{task.title}</i>)}</div>}
                            </div>
                        )}
                    </>
                )}
            </section>

            <section className="streak-panel">
                <header><h2><Lightning /> Best streaks</h2></header>
                {top.length === 0 ? <p className="quiet">Finish every ritual in a day to start a streak.</p> : (
                    <ol className="streaks">
                        {top.map((streak, index) => (
                            <li key={streak.start.getTime()} className={streak.isCurrent ? 'current' : ''}>
                                <span className="rank">{index + 1}</span>
                                <div className="streak-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(8, (streak.length / top[0].length) * 100)}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} /></div>
                                <b>{streak.length}d</b>
                                <small>{shortDate(streak.start)} – {streak.isCurrent ? 'now' : shortDate(streak.end)}{streak.isCurrent ? ' · current' : ''}</small>
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            <Heatmap data={data} act={act} />

            <section className="bars-panel">
                <header className="totals">
                    <h2><Lightning /> Effort mix</h2>
                    <dl>
                        <div><dt>Tasks completed</dt><dd>{totalDone.toLocaleString()}</dd></div>
                        <div><dt>Coins earned</dt><dd>{data.stats.totalCoinsEarned.toLocaleString()}</dd></div>
                        <div><dt>Rewards claimed</dt><dd>{data.stats.rewardsClaimed.toLocaleString()}</dd></div>
                    </dl>
                </header>
                {counts.map(item => (
                    <div key={item.key} className="bar" style={{ '--hue': item.hue }}>
                        <span>{item.label}</span>
                        <div><motion.i initial={{ width: 0 }} animate={{ width: `${(item.count / maxCount) * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} /></div>
                        <b>{item.count}</b>
                    </div>
                ))}
            </section>
        </div>
    );
}

function heatLevel(cell) {
    if (cell.vacation) return 'vacation';
    if (cell.rate === null) return 'none';
    if (cell.rate === 0) return 'l0';
    if (cell.rate < 0.5) return 'l1';
    if (cell.rate < 0.8) return 'l2';
    if (cell.rate < 1) return 'l3';
    return 'l4';
}

const HeatCell = memo(function HeatCell({ cell, today, picked, onHover, onPick }) {
    return (
        <button
            className={`cell ${heatLevel(cell)}${today ? ' today' : ''}${picked ? ' picked' : ''}`}
            tabIndex={today ? 0 : -1}
            onMouseEnter={() => onHover(cell)}
            onFocus={() => onHover(cell)}
            onBlur={() => onHover(null)}
            onClick={() => onPick(cell)}
            aria-label={`${cell.key}: ${cell.vacation ? 'vacation' : cell.expected ? `${cell.completed} of ${cell.expected} rituals` : 'nothing scheduled'}`}
        />
    );
});

/** Fixed-size square cells; the number of weeks adapts to the available width. */
function Heatmap({ data, act }) {
    const wrapRef = useRef(null);
    const [weeks, setWeeks] = useState(26);
    const dayKey = domain.todayKey();
    const today = useMemo(() => domain.taskDay(), [dayKey]);
    const todayKey = domain.dateKey(today);

    useEffect(() => {
        const node = wrapRef.current;
        if (!node) return undefined;
        const measure = () => {
            // minus the wrapper's 12px padding, the label column and the 6px grid gap
            const fit = Math.floor((node.clientWidth - 12 - LABEL_COLUMN - 6 + GAP) / (CELL + GAP));
            setWeeks(Math.max(8, Math.min(53, fit)));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    const cells = useMemo(() => {
        const sinceMonday = (today.getDay() + 6) % 7;
        return domain.consistency(data, (weeks - 1) * 7 + sinceMonday + 1);
    }, [data, weeks, today]);
    const [picked, setPicked] = useState(null);
    const [hovered, setHovered] = useState(null);
    // Hover previews a day and releases on mouse-out; click pins one until clicked again.
    const onPick = useCallback(cell => setPicked(current => (current?.key === cell.key ? null : cell)), []);
    const onHover = useCallback(cell => setHovered(cell), []);
    const shown = hovered ?? picked;
    const detail = (shown && cells.find(cell => cell.key === shown.key)) || cells.at(-1);

    const months = [];
    cells.forEach((cell, index) => {
        if (index % 7 !== 0) return;
        const label = cell.date.toLocaleDateString(undefined, { month: 'short' });
        if (months.at(-1)?.label !== label) months.push({ label, column: index / 7 });
    });
    const perfect = cells.filter(cell => cell.rate === 1 && !cell.vacation).length;

    return (
        <section className="heat-panel">
            <header><h2><Calendar /> Ritual heatmap</h2><span>{perfect} perfect days · last {weeks} weeks</span></header>
            <div className="heat-wrap" ref={wrapRef}>
                <div className="heat" style={{ '--cols': weeks, '--cell': `${CELL}px`, '--gap': `${GAP}px`, '--label': `${LABEL_COLUMN}px` }}>
                    <div className="heat-months" aria-hidden="true">
                        {months.map(item => <span key={`${item.label}-${item.column}`} style={{ gridColumn: item.column + 1 }}>{item.label}</span>)}
                    </div>
                    <div className="heat-days" aria-hidden="true"><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span /></div>
                    <div className="heat-grid" onMouseLeave={() => setHovered(null)}>
                        {cells.map(cell => <HeatCell key={cell.key} cell={cell} today={cell.key === todayKey} picked={picked?.key === cell.key} onHover={onHover} onPick={onPick} />)}
                    </div>
                </div>
            </div>
            <div className="heat-legend" aria-hidden="true">
                <span>Less</span><i className="cell l0" /><i className="cell l1" /><i className="cell l2" /><i className="cell l3" /><i className="cell l4" /><span>More</span>
                <span className="legend-gap" /><i className="cell vacation" /><span>Vacation</span>
            </div>
            {detail && (
                <div className="heat-detail">
                    <b>{detail.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</b>
                    <span>{detail.vacation ? 'Vacation — protected' : detail.expected ? `${detail.completed}/${detail.expected} rituals` : 'Nothing scheduled'}</span>
                    {!detail.vacation && detail.tasks.length > 0 && <div>{detail.tasks.map(task => <i key={task.id} className={task.done ? 'yes' : 'no'}>{task.title}</i>)}</div>}
                    <button className="vacation-toggle" onClick={() => act(draft => domain.toggleVacation(draft, detail.key), added => (added ? `${detail.key} marked as vacation` : `${detail.key} is a normal day again`), { undo: true })}>
                        {detail.vacation ? 'Remove vacation' : 'Mark as vacation'}
                    </button>
                </div>
            )}
        </section>
    );
}
