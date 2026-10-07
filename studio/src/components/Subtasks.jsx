import { useState } from 'react';
import { Check, X } from '@phosphor-icons/react';
import * as domain from '../domain.js';

/** Steps for a task or ritual. The add-a-step field is always available. */
export function Subtasks({ task, kind, act, compact }) {
    const [value, setValue] = useState('');
    const done = task.subtasks.filter(subtask => subtask.completed).length;

    const add = event => {
        event.preventDefault();
        if (!value.trim()) return;
        act(draft => domain.addSubtask(draft, task.id, kind, value));
        setValue('');
    };

    return (
        <div className={compact ? 'subtasks compact' : 'subtasks'}>
            {task.subtasks.map(subtask => (
                <div key={subtask.id} className={subtask.completed ? 'subtask done' : 'subtask'}>
                    <button className="tick" onClick={() => act(draft => domain.toggleSubtask(draft, task.id, subtask.id, kind), result => (result?.completedParent ? `${result.awarded ? `+${result.awarded} coins · ` : ''}Finished ${task.title}` : null), { undo: true })} aria-label={`${subtask.completed ? 'Uncheck' : 'Check'} ${subtask.title}`} aria-pressed={subtask.completed}>
                        {subtask.completed && <Check weight="bold" />}
                    </button>
                    <span>{subtask.title}</span>
                    {task.distributeCoins && <small>+{subtask.coins}</small>}
                    <button className="ghost" onClick={() => act(draft => domain.removeSubtask(draft, task.id, subtask.id, kind), 'Step removed', { undo: true })} aria-label={`Remove ${subtask.title}`}><X /></button>
                </div>
            ))}
            <form onSubmit={add}>
                <input value={value} onChange={event => setValue(event.target.value)} placeholder={task.subtasks.length ? `Add another step (${done}/${task.subtasks.length} done)…` : 'Break it into steps…'} aria-label="Add a step" />
            </form>
        </div>
    );
}
