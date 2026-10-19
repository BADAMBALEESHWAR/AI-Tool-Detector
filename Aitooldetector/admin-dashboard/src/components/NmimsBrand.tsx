import { ShieldCheck } from 'lucide-react';

interface NmimsBrandProps {
  /** Product area shown under the wordmark, e.g. "Admin Console". */
  subtitle: string;
  size?: 'sm' | 'lg';
}

/** SVKM's NMIMS wordmark used in headers and on the sign-in screens. */
export default function NmimsBrand({ subtitle, size = 'sm' }: NmimsBrandProps) {
  const lg = size === 'lg';
  return (
    <div className="flex items-center gap-3">
      <div className={`${lg ? 'w-14 h-14' : 'w-10 h-10'} bg-nmims-600 rounded-md flex items-center justify-center shadow-sm shrink-0`}>
        <ShieldCheck className={`${lg ? 'w-7 h-7' : 'w-5 h-5'} text-paper`} />
      </div>
      <div className="leading-tight text-left">
        <p className={`${lg ? 'text-xs' : 'text-[10px]'} font-semibold uppercase tracking-[0.18em] text-zinc-500`}>SVKM's</p>
        <p className={`${lg ? 'text-3xl' : 'text-xl'} font-display font-extrabold text-nmims-600 tracking-wide -my-0.5`}>NMIMS</p>
        <p className={`${lg ? 'text-xs' : 'text-[10px]'} font-semibold text-zinc-400`}>
          AI Integrity Monitor <span className="text-zinc-600">·</span> {subtitle}
        </p>
      </div>
    </div>
  );
}
