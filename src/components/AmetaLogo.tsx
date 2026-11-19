interface AmetaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AmetaLogo({ className = '', size = 'md' }: AmetaLogoProps) {
  const iconSize = size === 'sm' ? 24 : size === 'lg' ? 36 : 30;
  const textSize =
    size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <span className={`inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          width="36"
          height="36"
          rx="8"
          className="fill-[#0F2942] dark:fill-slate-100"
        />
        <path
          d="M18 8.5L26.5 27H22.4L20.65 22.85H15.35L13.6 27H9.5L18 8.5ZM16.55 19.6H19.45L18 15.9L16.55 19.6Z"
          className="fill-white dark:fill-[#0F2942]"
        />
      </svg>
      <span
        className={`font-display font-bold tracking-tight text-[#0F2942] dark:text-slate-100 ${textSize}`}
      >
        Ameta
      </span>
    </span>
  );
}
