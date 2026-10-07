import { useMemo, useState } from 'react';
import { ArrowCounterClockwise, Repeat } from '@phosphor-icons/react';
import { toast } from 'sonner';
import * as domain from '../domain.js';
import { exportBackup } from '../components/ui.jsx';
import { DOC_LIMIT_BYTES } from '../store.js';

export default function Log({ data, act, bytes }) {
    const [limit, setLimit] = useState(120);
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState('all');
    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return data.completedHistory.filter(entry => (
            (kind === 'all' || (kind === 'rituals') === Boolean(entry.isRecurring))
            && (!needle || entry.title.toLowerCase().includes(needle))
        ));
    }, [data.completedHistory, query, kind]);
    const groups = useMemo(() => domain.historyByDay({ completedHistory: filtered }, limit), [filtered, limit]);
    const used = Math.min(100, (bytes / DOC_LIMIT_BYTES) * 100);
    const today = domain.todayKey();

    return (
        <div className="log">
            <header className="log-head">
                <div><p className="eyebrow">Completion log</p><h1>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</h1></div>
                <div className="log-actions">
                    <div className={used > 80 ? 'storage warn' : 'storage'} title="BrownBook keeps everything in one cloud document, which has a 1 MB limit.">
                        <span>Storage {used < 1 ? '<1' : Math.round(used)}% of 1 MB</span>
                        <i><b style={{ width: `${used}%` }} /></i>
                    </div>
                    <button className="secondary" onClick={() => exportBackup(data, domain, toast)}>Export backup</button>
                </div>
            </header>
            <div className="log-tools">
                <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(120); }} placeholder="Search the log…" aria-label="Search the log" />
                <div className="filters" role="tablist" aria-label="Entry type">
                    {[['all', 'All'], ['tasks', 'Tasks'], ['rituals', 'Rituals']].map(([id, label]) => (
                        <button key={id} role="tab" aria-selected={kind === id} className={kind === id ? 'filter on' : 'filter'} onClick={() => { setKind(id); setLimit(120); }}>{label}</button>
                    ))}
                </div>
            </div>
            <div className="timeline">
                {groups.map(group => (
                    <section key={group.key}>
                        <h3><span>{group.key === 'unknown' ? 'Undated' : new Date(`${group.key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span><em>+{group.coins}</em></h3>
                        {group.entries.map(entry => (
                            <div key={entry.id} className="entry" style={{ '--hue': domain.DIFFICULTIES[entry.difficulty].hue }}>
                                <i />
                                <span>{entry.title}</span>
                                {entry.isRecurring && <Repeat aria-label="Ritual" />}
                                {entry.completedAt && <time dateTime={entry.completedAt}>{new Date(entry.completedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>}
                                <b>+{domain.getRecordedCompletionCoins(entry, domain.DIFFICULTY_COINS)}</b>
                                {!entry.isRecurring && group.key === today
                                    ? <button className="ghost" onClick={() => act(draft => domain.reopenTask(draft, entry.id), `Reopened ${entry.title}`)} aria-label={`Reopen ${entry.title}`} title="Reopen"><ArrowCounterClockwise /></button>
                                    : <span className="ghost-spacer" />}
                            </div>
                        ))}
                    </section>
                ))}
                {filtered.length === 0 && <p className="quiet">{data.completedHistory.length ? 'Nothing matches.' : 'Nothing completed yet.'}</p>}
            </div>
            {filtered.length > limit && <button className="secondary more" onClick={() => setLimit(value => value + 120)}>Show more</button>}
        </div>
    );
}
