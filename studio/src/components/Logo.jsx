/** The BrownBook mark: the leather book from the app icon (brown cover, gold ribbon and page edge). */
export function Logo({ size = 34 }) {
    return (
        <svg className="logo" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="BrownBook">
            <path d="M12 10a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v42H12z" fill="#a0602f" />
            <path d="M12 10a4 4 0 0 1 4-4h6v46H12z" fill="#b97440" />
            <path d="M31 9.5h17a2 2 0 0 1 2 2V45a2 2 0 0 1-2 2H28" fill="none" stroke="#1d2022" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M18 44.5h32a2 2 0 0 1 2 2V56a2 2 0 0 1-2 2H18a6 6 0 0 1-6-6v-1.5a6 6 0 0 1 6-6z" fill="#e2b13c" stroke="#1d2022" strokeWidth="2" strokeLinejoin="round" />
            <path d="M27 51.5h20" stroke="#1d2022" strokeWidth="2" strokeLinecap="round" />
            <rect x="22" y="6" width="5" height="52" fill="#e2b13c" stroke="#1d2022" strokeWidth="1.8" />
        </svg>
    );
}
