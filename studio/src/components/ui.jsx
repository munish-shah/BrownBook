import { useEffect, useRef } from 'react';
import { animate, motion } from 'motion/react';
import { X } from '@phosphor-icons/react';

export const spring = { type: 'spring', stiffness: 420, damping: 34 };

export function AnimatedNumber({ value }) {
    const ref = useRef(null);
    const previous = useRef(value);
    useEffect(() => {
        const node = ref.current;
        const controls = animate(previous.current, value, {
            duration: 0.6,
            ease: [0.16, 1, 0.3, 1],
            onUpdate: latest => { if (node) node.textContent = Math.round(latest).toLocaleString(); }
        });
        previous.current = value;
        return () => controls.stop();
    }, [value]);
    return <span ref={ref}>{Math.round(value).toLocaleString()}</span>;
}

export function Ring({ value, size = 180 }) {
    const radius = size / 2 - 12;
    const circumference = 2 * Math.PI * radius;
    return (
        <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}% of today done`}>
            <circle cx={size / 2} cy={size / 2} r={radius} className="ring-track" />
            <motion.circle
                cx={size / 2} cy={size / 2} r={radius} className="ring-fill"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference * (1 - value / 100) }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            />
        </svg>
    );
}

export function Stat({ label, value, tone }) {
    return <div className="stat"><b className={tone}>{value}</b><span>{label}</span></div>;
}

/** Modal sheet: Escape closes it, focus moves in and returns to the trigger on close. */
export function Sheet({ title, onClose, children, footer, wide }) {
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        const opener = document.activeElement;
        const onKey = event => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
                event.preventDefault();
                closeRef.current();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
        };
    }, []);

    return (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => event.target === event.currentTarget && onClose()}>
            <motion.div className={wide ? 'sheet wide' : 'sheet'} role="dialog" aria-modal="true" aria-label={title} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={spring}>
                <header><h2>{title}</h2><button className="ghost" onClick={onClose} aria-label="Close"><X /></button></header>
                <div className="sheet-body">{children}</div>
                {footer && <footer>{footer}</footer>}
            </motion.div>
        </motion.div>
    );
}

export function formatLeft(ms) {
    if (ms <= 0) return 'expired';
    const hours = Math.floor(ms / 3_600_000);
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    return `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

export function exportBackup(data, domain, toast) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `brownbook-backup-${domain.todayKey()}.json` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
    toast('Backup downloaded');
}
