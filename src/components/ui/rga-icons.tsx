import type { ReactNode } from 'react';

/** RGA navigation pictograms. A 24px grid, rounded contours and compact brand accents.
 * The main contour inherits the foreground for light and dark surfaces.
 * Icons are decorative: the surrounding control supplies its accessible name.
 */
type IconProps = { size?: number; strokeWidth?: number; className?: string };
const blue = '#1581C9';
const purple = '#6C336E';
const yellow = '#F9C82B';

function pictogram(body: ReactNode) {
  return function RgaIcon({ size = 24, strokeWidth = 1.65, className }: IconProps) {
    return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      className={className}>{body}</svg>;
  };
}

export const RgaDashboard = pictogram(<>
  <rect x="2.5" y="3.5" width="19" height="17" rx="2.5" />
  <path d="M3 8h18" /><path d="M6 5.8h.1M9 5.8h.1" strokeWidth="2" />
  <rect x="6" y="14" width="2.5" height="3.5" rx=".6" fill={blue} stroke="none" />
  <rect x="10" y="11" width="2.5" height="6.5" rx=".6" fill={purple} stroke="currentColor" strokeWidth=".6" />
  <circle cx="17" cy="14.5" r="3" /><path d="M17 11.5a3 3 0 0 1 3 3h-3Z" fill={yellow} stroke="none" />
</>);
export const RgaJobs = pictogram(<>
  <rect x="2.5" y="7" width="19" height="14" rx="2.5" />
  <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 11.5c5.8 3 12.2 3 18 0" />
  <path d="M4 8.5h16v2.1c-5 2.1-11 2.1-16 0Z" fill={blue} stroke="none" />
  <rect x="10" y="12" width="4" height="3.5" rx="1" fill={yellow} />
</>);
export const RgaPipeline = pictogram(<>
  <rect x="2.5" y="3" width="5" height="18" rx="1.6" />
  <rect x="9.5" y="3" width="5" height="18" rx="1.6" />
  <rect x="16.5" y="3" width="5" height="18" rx="1.6" />
  <path d="M4 6h2M11 6h2M18 6h2" />
  <rect x="3.7" y="9" width="2.6" height="4.5" rx=".7" fill={blue} stroke="none" />
  <rect x="10.7" y="11" width="2.6" height="4.5" rx=".7" fill={purple} stroke="currentColor" strokeWidth=".45" />
  <rect x="17.7" y="14" width="2.6" height="4.5" rx=".7" fill={yellow} stroke="none" />
</>);
export const RgaTalents = pictogram(<>
  <circle cx="12" cy="7" r="3.2" fill={blue} />
  <path d="M5.8 20v-2.2a6.2 6.2 0 0 1 12.4 0V20Z" fill={blue} />
  <path d="M5.5 10a2.8 2.8 0 0 1 0-5.5M18.5 4.5a2.8 2.8 0 0 1 0 5.5M4.3 13a4.5 4.5 0 0 0-2 4v1.5M19.7 13a4.5 4.5 0 0 1 2 4v1.5" />
  <path d="M3.8 14.8v2.5M20.2 14.8v2.5" stroke={yellow} strokeWidth="2" />
</>);
export const RgaClients = pictogram(<>
  <path d="M3 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14M15 10h4a2 2 0 0 1 2 2v9M2 21h20" />
  <path d="M7 9h4M7 13h4M17.5 14h1M17.5 17h1" />
  <rect x="7" y="17" width="4" height="4" rx=".7" fill={blue} />
  <path d="M5 7h8" stroke={yellow} />
</>);
export const RgaInterviews = pictogram(<>
  <rect x="2.5" y="5" width="19" height="16" rx="2.5" />
  <path d="M7 3v4M17 3v4M3 10h18" />
  <path d="M4 7h16v2H4Z" fill={purple} stroke="none" />
  <rect x="6" y="12.5" width="3" height="3" rx=".6" fill={yellow} stroke="none" />
  <path d="M7.5 18h.1M11.5 14h.1M11.5 18h.1" strokeWidth="2" />
  <path d="M15 13h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z" fill={blue} stroke="none" />
  <path d="m19 15 2-1v4l-2-1Z" fill={blue} stroke="none" />
</>);
export const RgaTasks = pictogram(<>
  <rect x="3" y="3" width="18" height="18" rx="2.5" />
  <path d="M6.5 8l1.5 1.5 2.5-3M6.5 13l1.5 1.5 2.5-3" stroke={blue} strokeWidth="2" />
  <rect x="6.5" y="16.5" width="3" height="3" rx=".5" />
  <path d="M13 8h5M13 13h5M13 18h5" />
</>);
export const RgaReports = pictogram(<>
  <path d="M5 2.5h9l5 5V19a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 3 19V5a2.5 2.5 0 0 1 2-2.5Z" />
  <path d="M14 2.5V8h5" fill={purple} />
  <rect x="6" y="14" width="2.5" height="4.5" rx=".6" fill={blue} stroke="none" />
  <rect x="10" y="12" width="2.5" height="6.5" rx=".6" fill={yellow} stroke="none" />
  <rect x="14" y="10" width="2.5" height="8.5" rx=".6" fill={purple} stroke="currentColor" strokeWidth=".5" />
</>);
export const RgaReview = pictogram(<>
  <rect x="4" y="5" width="16" height="16.5" rx="2" />
  <rect x="8" y="2.5" width="8" height="5" rx="1.4" fill={blue} />
  <path d="M7.5 11.5l1.5 1.5 2-2.5M7.5 16l1.5 1.5 2-2.5M13.5 12h3" />
  <circle cx="18.5" cy="18" r="4" fill={yellow} stroke="#161D27" strokeWidth="1" />
  <path d="m16.7 18 1.2 1.2 2.4-2.5" stroke="#161D27" strokeWidth="1.5" />
</>);
export const RgaReferrals = pictogram(<>
  <path d="M12 9.5v2.7M6 14l4-2h4l4 2" />
  <circle cx="12" cy="5.7" r="3.7" fill={blue} />
  <circle cx="5.5" cy="17.5" r="3.7" fill={purple} />
  <circle cx="18.5" cy="17.5" r="3.7" fill={yellow} />
  <path d="M12 4.5v2.4M10.8 5.7h2.4" stroke="#fff" strokeWidth="1.4" />
</>);
export const RgaSettings = pictogram(<>
  <path d="M9.5 3h5l.7 2.3 2 .9 2.2-1.1 2.5 4.3-1.8 1.7v2l1.8 1.6-2.5 4.3-2.2-1-2 .9-.7 2.1h-5l-.7-2.1-2-.9-2.2 1L2.1 15l1.8-1.6v-2L2.1 9.7l2.5-4.3 2.2 1.1 2-.9Z" />
  <circle cx="12" cy="12" r="4.2" fill={blue} />
  <circle cx="12" cy="12" r="1.6" fill={yellow} stroke="none" />
</>);
export const RgaSearch = pictogram(<>
  <circle cx="10" cy="10" r="6.5" />
  <path d="m15 15 5.5 5.5" strokeWidth="2.8" />
  <circle cx="10" cy="8" r="1.8" fill={blue} stroke="none" />
  <path d="M6.7 13a3.3 3.3 0 0 1 6.6 0Z" fill={blue} stroke="none" />
</>);
export const RgaMore = pictogram(<>
  <rect x="3" y="3" width="18" height="18" rx="5" />
  <circle cx="7" cy="12" r="1.4" fill={blue} stroke="none" />
  <circle cx="12" cy="12" r="1.4" fill={purple} stroke="currentColor" strokeWidth=".5" />
  <circle cx="17" cy="12" r="1.4" fill={yellow} stroke="none" />
</>);
export const RgaDisc = pictogram(<>
  <circle cx="12" cy="12" r="9" />
  <path d="M12 3a9 9 0 0 1 9 9h-9Z" fill={blue} stroke="none" />
  <path d="M12 12h9a9 9 0 0 1-9 9Z" fill={purple} stroke="none" />
  <path d="M12 12v9a9 9 0 0 1-9-9Z" fill={yellow} stroke="none" />
  <path d="M12 3v18M3 12h18" />
</>);

export const RgaAi = pictogram(<>
  <rect x="3" y="7" width="18" height="13" rx="4" fill={blue} />
  <path d="M12 7V4M5 11H2M22 11h-3" />
  <circle cx="12" cy="3.5" r="1.5" fill={yellow} stroke="none" />
  <circle cx="8" cy="12.5" r="1.6" fill={yellow} stroke="none" />
  <circle cx="16" cy="12.5" r="1.6" fill={yellow} stroke="none" />
  <path d="M9 16h6" stroke="#fff" />
  <path d="m19 2 1 2.5L22.5 5 20 6l-1 2-1-2.5L15.5 5 18 4Z" fill={yellow} stroke="none" />
</>);
