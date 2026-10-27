import * as domain from '../domain.js';

/**
 * Complete or undo a ritual from anywhere in the UI. A goal check-in that needs a number
 * (an amount habit, or a target goal) opens the log dialog instead of completing straight away.
 */
export function runRoutine({ task, data, act, setDialog }) {
    const goal = task.goalId ? data.goals.find(candidate => candidate.id === task.goalId) : null;
    const done = data.recurringCompletions[task.id] === domain.todayKey();
    if (goal && !done && (goal.type === 'target' || goal.mode === 'amount')) {
        setDialog({ type: 'goal-log', goalId: goal.id });
        return;
    }
    act(
        draft => domain.toggleRoutine(draft, task.id),
        ({ awarded, bonus }) => (bonus ? `+${awarded} and +${bonus} early-bird bonus` : awarded ? `+${awarded} · ${task.title}` : `Undid ${task.title}`),
        { undo: true }
    );
}
