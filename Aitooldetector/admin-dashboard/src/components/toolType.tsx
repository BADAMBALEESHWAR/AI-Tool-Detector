import { Globe, Monitor, PanelRight } from 'lucide-react';

export type ToolType = 'WEB' | 'APP' | 'EMBEDDED' | 'UNKNOWN';

const META: Record<'WEB' | 'APP' | 'EMBEDDED', { label: string; Icon: typeof Globe; cls: string }> = {
  WEB: { label: 'Web App', Icon: Globe, cls: 'bg-blue-500/10 border-blue-500/25 text-blue-300' },
  APP: { label: 'Desktop App', Icon: Monitor, cls: 'bg-purple-500/10 border-purple-500/25 text-purple-300' },
  // AI built into another application, e.g. the Copilot pane in Word.
  EMBEDDED: { label: 'In-app AI', Icon: PanelRight, cls: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
};

export function toolTypeMeta(type?: string) {
  return META[(type === 'APP' || type === 'EMBEDDED' ? type : 'WEB') as keyof typeof META];
}

export function ToolTypeBadge({ type, size = 11 }: { type?: string; size?: number }) {
  const { label, Icon, cls } = toolTypeMeta(type);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${cls}`}>
      <Icon size={size} />
      {label}
    </span>
  );
}

export function ToolTypeIcon({ type, size = 14 }: { type?: string; size?: number }) {
  const { Icon, cls } = toolTypeMeta(type);
  return (
    <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${cls}`}>
      <Icon size={size} />
    </div>
  );
}
