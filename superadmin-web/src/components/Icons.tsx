import { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true, ...props,
});

export const OverviewIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
);
export const UsersIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .6 3.1 2.3 3.5 5.2" /></svg>
);
export const ApprovalsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.5" /></svg>
);
export const HistoryIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
);
export const LogoutIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
);
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const DownloadIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>);
export const MoreIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>);

export const LogoMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden="true">
    <rect width="52" height="52" rx="12" fill="#1D9E75" />
    <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 34 Q13 26 20 30 Q27 34 34 26 Q41 18 46 22" strokeWidth="3" />
      <path d="M6 42 Q13 34 20 38 Q27 42 34 34 Q41 26 46 30" strokeWidth="2.5" strokeOpacity=".55" />
      <path d="M18 10 L26 6 L34 10 L34 22 Q26 28 18 22 Z" strokeWidth="2" fill="#fff" fillOpacity=".2" />
    </g>
    <circle cx="26" cy="15" r="3" fill="#fff" />
  </svg>
);
