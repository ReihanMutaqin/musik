import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const ArrowUpRightIcon = (props: IconProps) => <IconBase {...props}><path d="M7 17 17 7M8 7h9v9" /></IconBase>;
export const ArrowRightIcon = (props: IconProps) => <IconBase {...props}><path d="M5 12h14M14 7l5 5-5 5" /></IconBase>;
export const ChatIcon = (props: IconProps) => <IconBase {...props}><path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3Z" /></IconBase>;
export const HandIcon = (props: IconProps) => <IconBase {...props}><path d="M7.5 11V5.5a1.5 1.5 0 0 1 3 0V10M10.5 9V3.5a1.5 1.5 0 0 1 3 0V9M13.5 9V4.5a1.5 1.5 0 0 1 3 0V10M16.5 10V7a1.5 1.5 0 0 1 3 0v7.5A6.5 6.5 0 0 1 13 21h-1.5a6 6 0 0 1-5.1-2.9L4 14.3a1.8 1.8 0 0 1 2.9-2.1l1.6 1.7" /></IconBase>;
export const SoundIcon = (props: IconProps) => <IconBase {...props}><path d="M6 9H3v6h3l5 4V5L6 9Z" /><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" /></IconBase>;
export const CameraIcon = (props: IconProps) => <IconBase {...props}><path d="M4 7h3l2-2h6l2 2h3v12H4Z" /><circle cx="12" cy="13" r="3.5" /></IconBase>;
export const SparkIcon = (props: IconProps) => <IconBase {...props}><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" /><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></IconBase>;
export const MoonIcon = (props: IconProps) => <IconBase {...props}><path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z" /></IconBase>;
export const SunIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></IconBase>;
export const MenuIcon = (props: IconProps) => <IconBase {...props}><path d="M4 7h16M4 12h16M4 17h16" /></IconBase>;
export const CloseIcon = (props: IconProps) => <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>;
export const PlayIcon = (props: IconProps) => <IconBase {...props}><path d="m8 5 11 7-11 7Z" /></IconBase>;
export const MicIcon = (props: IconProps) => <IconBase {...props}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" /></IconBase>;
export const SettingsIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></IconBase>;
export const ChevronDownIcon = (props: IconProps) => <IconBase {...props}><path d="m7 10 5 5 5-5" /></IconBase>;
export const TrashIcon = (props: IconProps) => <IconBase {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></IconBase>;
export const StopIcon = (props: IconProps) => <IconBase {...props}><rect x="6" y="6" width="12" height="12" rx="1" /></IconBase>;
export const RecordIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" /></IconBase>;
export const RefreshIcon = (props: IconProps) => <IconBase {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.7-1L20 12M4 12l2.2 5a7 7 0 0 0 11.7-1" /></IconBase>;
export const PauseIcon = (props: IconProps) => <IconBase {...props}><path d="M8 5v14M16 5v14" /></IconBase>;
export const InfoIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></IconBase>;
export const SendIcon = (props: IconProps) => <IconBase {...props}><path d="m4 4 17 8-17 8 3-8-3-8Z" /><path d="M7 12h14" /></IconBase>;
