export const THEMES = {
    default: { name: 'BrownBook', bg: '#100d0b', panel: '#1b1714', ink: '#f6ede1', muted: '#9b8f81', accent: '#f2a541', accent2: '#e2674a' },
    midnight: { name: 'Midnight', bg: '#0b0d1c', panel: '#151a31', ink: '#eef0ff', muted: '#8e94b8', accent: '#8ea2ff', accent2: '#c48bff' },
    forest: { name: 'Forest', bg: '#0b130d', panel: '#142018', ink: '#eaf4e8', muted: '#8aa08b', accent: '#8fd477', accent2: '#e2c25b' },
    ocean: { name: 'Ocean', bg: '#071219', panel: '#0f1f2b', ink: '#e6f5fb', muted: '#86a3b2', accent: '#4fc3f7', accent2: '#43e0b8' },
    rose: { name: 'Rose', bg: '#170c11', panel: '#24151c', ink: '#fbeaf0', muted: '#b28c99', accent: '#ff8eae', accent2: '#ffb37a' },
    charcoal: { name: 'Charcoal', bg: '#121212', panel: '#1d1d1f', ink: '#f2f2f2', muted: '#989898', accent: '#d9d9d9', accent2: '#ff9f43' },
    obsidian: { name: 'Obsidian', bg: '#050505', panel: '#111111', ink: '#ffffff', muted: '#8a8a8a', accent: '#ffffff', accent2: '#ff5f57' },
    cyber: { name: 'Cyber', bg: '#08071a', panel: '#131030', ink: '#f2ecff', muted: '#9a90c8', accent: '#c164ff', accent2: '#00f0ff' },
    ember: { name: 'Ember', bg: '#160b07', panel: '#24130d', ink: '#fff0e8', muted: '#b9917f', accent: '#ff7a45', accent2: '#ffcf4a' },
    slate: { name: 'Slate', bg: '#0d1318', panel: '#172129', ink: '#e8f0f5', muted: '#8ca0ad', accent: '#91b8d0', accent2: '#e9b872' },
    mocha: { name: 'Mocha', bg: '#16100d', panel: '#241a15', ink: '#f6e9dc', muted: '#ac9582', accent: '#d7a77d', accent2: '#9fc29a' },
    aurora: { name: 'Aurora', bg: '#081614', panel: '#102522', ink: '#e4faf4', muted: '#87aaa2', accent: '#5de1c5', accent2: '#b08cff' },
    starnight: { name: 'StarNight', bg: '#0f101b', panel: '#1b1d31', ink: '#eeeaff', muted: '#9894bd', accent: '#a99cff', accent2: '#ffd36e' },
    starday: { name: 'StarDay', bg: '#e8f1f0', panel: '#ffffff', ink: '#17221e', muted: '#55645f', accent: '#0b6f66', accent2: '#9a5200', light: true }
};

export function applyTheme(id) {
    const theme = THEMES[id] || THEMES.default;
    const root = document.documentElement.style;
    Object.entries({ bg: theme.bg, panel: theme.panel, ink: theme.ink, muted: theme.muted, accent: theme.accent, accent2: theme.accent2 })
        .forEach(([key, value]) => root.setProperty(`--${key}`, value));
    document.documentElement.dataset.light = theme.light ? 'true' : 'false';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
    try {
        localStorage.setItem('brownbook-theme', THEMES[id] ? id : 'default');
        // Read by the inline script in index.html so the first paint already uses this theme.
        localStorage.setItem('brownbook-theme-vars', JSON.stringify({ bg: theme.bg, panel: theme.panel, ink: theme.ink, muted: theme.muted, accent: theme.accent, accent2: theme.accent2, light: Boolean(theme.light) }));
    } catch { /* storage unavailable */ }
}
