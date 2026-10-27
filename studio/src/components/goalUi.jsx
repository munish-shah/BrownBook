import { useMemo } from 'react';
import { addDaysKey, daysBetweenKeys, keyToDate, weeklyHits } from '../goals.js';
import { todayKey } from '../domain.js';

export const PACE_LABEL = { new: 'Just started', ahead: 'Ahead', 'on-track': 'On track', behind: 'Behind', done: 'Achieved', paused: 'Paused' };

export function fmtNumber(value) {
    if (value === undefined || value === null || Number.isNaN(value)) return '—';
    return String(Math.round(value * 10) / 10);
}

export const fmtSigned = value => `${value < 0 ? '−' : '+'}${fmtNumber(Math.abs(value))}`;

export function fmtDate(key) {
    return keyToDate(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function PaceBadge({ pace }) {
    return <span className={`pace pace-${pace}`}>{PACE_LABEL[pace]}</span>;
}

export function WeekDots({ dots }) {
    return (
        <div className="week-dots" aria-label="Last 7 days">
            {dots.map(dot => (
                <span key={dot.key} className={`wd ${dot.state}`} title={`${fmtDate(dot.key)}: ${dot.state}${dot.value !== undefined ? ` (${fmtNumber(dot.value)})` : ''}`}>
                    <i />
                    <small>{keyToDate(dot.key).toLocaleDateString(undefined, { weekday: 'narrow' })}</small>
                </span>
            ))}
        </div>
    );
}

/** One plain-English line about where a goal stands. */
export function paceLine(goal, status) {
    const unit = goal.unit ? ` ${goal.unit}` : '';
    if (status.pace === 'paused') return 'Paused. No check-ins until you resume.';
    if (status.type === 'habit') {
        if (status.pace === 'done') return `You hit it on ${status.daysHit} days.`;
        const parts = [status.eligible < 4 ? `Day ${status.elapsed} of building it` : `This week ${status.hits}/${status.eligible} (a good week is ${status.need})`];
        if (status.daysLeft !== null) parts.push(status.daysLeft >= 0 ? `${status.daysLeft} days left` : 'past its date');
        if (status.eta) parts.push(`at this pace: ${fmtDate(status.eta)}`);
        return parts.join(' · ');
    }
    if (status.pace === 'done') return `Reached ${fmtNumber(status.current)}${unit}.`;
    const parts = [`${fmtNumber(Math.abs(status.remaining))}${unit} to go`];
    if (status.daysLeft !== null) parts.push(status.daysLeft >= 0 ? `${status.daysLeft} days left` : 'past its date');
    if (status.needPerWeek !== null) parts.push(`need ${fmtSigned(status.needPerWeek)}${unit}/wk`);
    if (status.perWeek !== null) parts.push(`averaging ${fmtSigned(status.perWeek)}${unit}/wk`);
    return parts.join(' · ');
}

/** Target goals: actual values against the straight line to the deadline. Habits: hits per week. */
export function GoalChart({ goal, status }) {
    const today = todayKey();
    const target = useMemo(() => {
        if (goal.type !== 'target') return null;
        const width = 600;
        const height = 190;
        const pad = { left: 38, right: 16, top: 14, bottom: 24 };
        const endKey = goal.deadline;
        const spanDays = Math.max(1, daysBetweenKeys(goal.startDate, endKey));
        const points = [{ key: goal.startDate, value: goal.startValue }, ...status.entries.map(([key, value]) => ({ key, value }))];
        const values = [goal.startValue, goal.targetValue, ...status.entries.map(([, value]) => value)];
        const low = Math.min(...values);
        const high = Math.max(...values);
        const margin = (high - low || 1) * 0.12;
        const x = key => pad.left + (clampNumber(daysBetweenKeys(goal.startDate, key) / spanDays, 0, 1.0) * (width - pad.left - pad.right));
        const y = value => pad.top + (1 - (value - (low - margin)) / ((high + margin) - (low - margin))) * (height - pad.top - pad.bottom);
        return { width, height, pad, points, x, y, endKey, low, high };
    }, [goal, status]);

    const weeks = useMemo(() => (goal.type === 'habit' ? weeklyHits(goal, 12) : null), [goal, status]);

    if (target) {
        const { width, height, pad, points, x, y } = target;
        const todayX = x(today);
        return (
            <svg className="goal-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Progress chart">
                <line x1={pad.left} x2={width - pad.right} y1={y(goal.targetValue)} y2={y(goal.targetValue)} className="gc-target" />
                <line x1={x(goal.startDate)} y1={y(goal.startValue)} x2={x(goal.deadline)} y2={y(goal.targetValue)} className="gc-plan" />
                <line x1={todayX} x2={todayX} y1={pad.top} y2={height - pad.bottom} className="gc-today" />
                {points.length > 1 && <polyline className="gc-line" fill="none" points={points.map(point => `${x(point.key)},${y(point.value)}`).join(' ')} />}
                {points.map(point => <circle key={point.key} className="gc-dot" cx={x(point.key)} cy={y(point.value)} r="3.5" />)}
                <text x={pad.left - 6} y={y(goal.startValue) + 4} textAnchor="end" className="gc-label">{fmtNumber(goal.startValue)}</text>
                <text x={pad.left - 6} y={y(goal.targetValue) + 4} textAnchor="end" className="gc-label strong">{fmtNumber(goal.targetValue)}</text>
                <text x={pad.left} y={height - 6} className="gc-label">{fmtDate(goal.startDate)}</text>
                <text x={width - pad.right} y={height - 6} textAnchor="end" className="gc-label">{fmtDate(goal.deadline)}</text>
            </svg>
        );
    }

    const width = 600;
    const height = 170;
    const pad = { left: 24, right: 8, top: 12, bottom: 24 };
    const slot = (width - pad.left - pad.right) / weeks.length;
    const barY = hits => pad.top + (1 - hits / 7) * (height - pad.top - pad.bottom);
    return (
        <svg className="goal-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Days hit per week">
            <line x1={pad.left} x2={width - pad.right} y1={barY(goal.weeklyMin)} y2={barY(goal.weeklyMin)} className="gc-plan" />
            {weeks.map((week, index) => (
                <g key={week.start}>
                    <rect className={week.hits >= goal.weeklyMin ? 'gc-bar good' : 'gc-bar'} x={pad.left + index * slot + 4} width={slot - 8} y={barY(week.hits)} height={Math.max(2, height - pad.bottom - barY(week.hits))} rx="4" />
                    {week.hits > 0 && <text x={pad.left + index * slot + slot / 2} y={barY(week.hits) - 4} textAnchor="middle" className="gc-label">{week.hits}</text>}
                </g>
            ))}
            <text x={pad.left} y={height - 6} className="gc-label">{fmtDate(weeks[0].start)}</text>
            <text x={width - pad.right} y={height - 6} textAnchor="end" className="gc-label">this week</text>
            <text x={pad.left - 4} y={barY(goal.weeklyMin) + 4} textAnchor="end" className="gc-label strong">{goal.weeklyMin}</text>
        </svg>
    );
}

function clampNumber(value, low, high) {
    return Math.min(high, Math.max(low, value));
}

export { addDaysKey };
