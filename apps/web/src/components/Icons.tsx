/** Nav glyphs — original stroke icons, currentColor. */

const GLYPHS: Record<string, React.ReactNode> = {
  trophy: (
    <>
      <path d="M8 5h8v4a4 4 0 0 1-8 0V5z" />
      <path d="M8 6.5H5.5a2.5 2.5 0 0 0 2.6 3" />
      <path d="M16 6.5h2.5a2.5 2.5 0 0 1-2.6 3" />
      <path d="M12 13v3.5" />
      <path d="M9.5 16.5h5" />
      <path d="M8.5 19.5h7" />
    </>
  ),
  swords: (
    <>
      <path d="M6.5 20.5 17.5 5" />
      <path d="M17.5 20.5 6.5 5" />
      <path d="M9.5 15.5l2.5 2.5" />
      <path d="M14.5 15.5 12 18" />
    </>
  ),
  scroll: (
    <>
      <path d="M7 4h9.5a2.5 2.5 0 0 1 2.5 2.5V18a2 2 0 0 1-2 2H7" />
      <path d="M7 4a2.5 2.5 0 0 0-2.5 2.5V17A2.5 2.5 0 0 0 7 19.5" />
      <path d="M7 4v15.5" />
      <path d="M9.5 9h5" />
      <path d="M9.5 13h5" />
    </>
  ),
  banner: (
    <>
      <path d="M6.5 3v18" />
      <path d="M6.5 4.5H18l-3 4 3 4H6.5" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z" />
    </>
  ),
  gate: (
    <>
      <path d="M4 5.5h16" />
      <path d="M6.5 5.5V20" />
      <path d="M17.5 5.5V20" />
      <path d="M6.5 10a5.5 4.5 0 0 1 11 0" />
      <path d="M4 20h5" />
      <path d="M15 20h5" />
    </>
  ),
  helm: (
    <>
      <path d="M12 3l7 2.5V11c0 4.2-2.9 7.5-7 9-4.1-1.5-7-4.8-7-9V5.5z" />
      <path d="M12 7.5V17" />
      <path d="M8.5 10.5h7" />
    </>
  ),
  pulse: (
    <path d="M3 12h4l2.2-6 4 12 2.2-6H21" />
  ),
};

export function NavIcon({ name }: { name: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {GLYPHS[name] ?? null}
    </svg>
  );
}
