import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Command } from 'cmdk';
import { toast } from 'sonner';
import { Check, Gift, Key, Palette as PaletteIcon, Plus, PushPin, Repeat, Tray } from '@phosphor-icons/react';
import { THEMES } from '../themes.js';
import * as domain from '../domain.js';
import { exportBackup, spring } from './ui.jsx';

export default function CommandPalette({ open, onClose, data, views, setView, theme, changeTheme, openComposer, openRewardComposer, setDialog, act }) {
    const [search, setSearch] = useState('');
    const close = () => { setSearch(''); onClose(); };
    const run = fn => () => { fn(); close(); };
    const today = domain.deriveToday(data);
    const isRoutine = task => data.recurringTasks.some(candidate => candidate.id === task.id);
    const openTasks = [...today.focus.filter(task => !isRoutine(task)), ...today.open];
    const openRituals = [...today.focus.filter(isRoutine), ...today.routinesOpen];
    const typed = search.trim();

    return (
        <AnimatePresence>
            {open && (
                <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => event.target === event.currentTarget && close()}>
                    <motion.div initial={{ y: -16, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: -8, scale: 0.98 }} transition={spring}>
                        <Command className="cmdk" label="Command palette" loop>
                            <Command.Input autoFocus value={search} onValueChange={setSearch} placeholder="Type a command, or a new task to add…" onKeyDown={event => event.key === 'Escape' && close()} />
                            <Command.List>
                                <Command.Empty>No match.</Command.Empty>
                                <Command.Group heading="Go">
                                    {views.map(item => <Command.Item key={item.id} onSelect={run(() => setView(item.id))}><item.icon />{item.label}<kbd>{item.key}</kbd></Command.Item>)}
                                </Command.Group>
                                <Command.Group heading="Create">
                                    <Command.Item onSelect={run(openComposer)}><Plus />New task<kbd>N</kbd></Command.Item>
                                    <Command.Item onSelect={run(openRewardComposer)}><Gift />New reward</Command.Item>
                                </Command.Group>
                                {(openTasks.length > 0 || openRituals.length > 0) && (
                                    <Command.Group heading="Complete">
                                        {openTasks.slice(0, 12).map(task => (
                                            <Command.Item key={task.id} value={`complete ${task.title}`} onSelect={run(() => act(draft => domain.completeTask(draft, task.id), awarded => `+${awarded} · ${task.title}`, { undo: true }))}><Check />{task.title}{data.focusPinnedIds.includes(task.id) && <PushPin weight="fill" />}</Command.Item>
                                        ))}
                                        {openRituals.map(task => (
                                            <Command.Item key={task.id} value={`ritual ${task.title}`} onSelect={run(() => act(draft => domain.toggleRoutine(draft, task.id), `Done · ${task.title}`, { undo: true }))}><Repeat />{task.title}{data.focusPinnedIds.includes(task.id) && <PushPin weight="fill" />}</Command.Item>
                                        ))}
                                    </Command.Group>
                                )}
                                <Command.Group heading="Theme">
                                    {Object.entries(THEMES).map(([id, item]) => (
                                        <Command.Item key={id} value={`theme ${item.name}`} onSelect={run(() => changeTheme(id))}>
                                            <PaletteIcon /><i className="swatch" style={{ background: `linear-gradient(135deg, ${item.accent}, ${item.bg})` }} />{item.name}{theme === id && <Check />}
                                        </Command.Item>
                                    ))}
                                </Command.Group>
                                <Command.Group heading="Data">
                                    <Command.Item onSelect={run(() => setDialog({ type: 'key' }))}><Key />Device key</Command.Item>
                                    <Command.Item onSelect={run(() => setDialog({ type: 'import' }))}><Tray />Import backup</Command.Item>
                                    <Command.Item onSelect={run(() => exportBackup(data, domain, toast))}><Tray />Export backup</Command.Item>
                                </Command.Group>
                                {typed.length > 1 && (
                                    <Command.Group heading="Add">
                                        <Command.Item forceMount value={`__add ${typed}`} onSelect={run(() => act(draft => domain.createTask(draft, { title: typed, notes: '', difficulty: 'medium', recurring: false, expiration: '', distributeCoins: false, subtasks: [] }), `Added ${typed}`, { undo: true }))}><Plus />Add task “{typed}”</Command.Item>
                                    </Command.Group>
                                )}
                            </Command.List>
                        </Command>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
