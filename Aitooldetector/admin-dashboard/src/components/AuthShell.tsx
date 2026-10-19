import type { ReactNode } from 'react';
import NmimsBrand from './NmimsBrand';

interface AuthShellProps {
  subtitle: string;
  heroTitle: string;
  heroText: string;
  points: string[];
  children: ReactNode;
}

/** NMIMS-styled frame for the sign-in / sign-up screens: red hero panel + form column. */
export default function AuthShell({ subtitle, heroTitle, heroText, points, children }: AuthShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-950">
      <div className="bg-ink text-paper/80 text-[11px]">
        <div className="flex items-center justify-between px-6 h-8">
          <span className="tracking-wide">Shri Vile Parle Kelavani Mandal's · Narsee Monjee Institute of Management Studies</span>
          <span className="hidden md:inline uppercase tracking-[0.2em] font-semibold text-paper/60">Deemed-to-be University</span>
        </div>
      </div>

      <div className="flex-1 grid lg:grid-cols-2">
        <section className="hidden lg:flex flex-col justify-between bg-nmims-600 text-paper p-12 relative overflow-hidden">
          <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full border-[40px] border-paper/10 pointer-events-none" />
          <div className="absolute right-16 top-16 w-40 h-40 rounded-full border-[18px] border-paper/10 pointer-events-none" />
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-paper/70">Academic Integrity</p>
          <div className="relative max-w-md">
            <h2 className="font-display text-4xl font-extrabold leading-tight">{heroTitle}</h2>
            <div className="w-16 h-1 bg-paper my-6" />
            <p className="text-paper/85 leading-relaxed">{heroText}</p>
            <ul className="mt-8 space-y-3">
              {points.map(point => (
                <li key={point} className="flex items-start gap-3 text-sm text-paper/90">
                  <span className="mt-1.5 w-2 h-2 bg-paper shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-paper/60">Metadata-only monitoring · No content, keystrokes or screenshots</p>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md animate-fade-in">
            <div className="mb-8">
              <NmimsBrand subtitle={subtitle} size="lg" />
            </div>
            {children}
          </div>
        </section>
      </div>

      <footer className="bg-ink text-paper/60 text-[11px] px-6 py-3 flex flex-wrap items-center justify-between gap-2">
        <span>© {new Date().getFullYear()} SVKM's NMIMS · AI Integrity Monitor</span>
        <span className="uppercase tracking-wider">For authorised institutional use</span>
      </footer>
    </div>
  );
}
