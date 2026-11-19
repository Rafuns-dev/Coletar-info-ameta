interface AmetaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'symbol' | 'card';
}

export function AmetaLogo({
  className = '',
  size = 'md',
  variant = 'full',
}: AmetaLogoProps) {
  if (variant === 'symbol') {
    const dim = size === 'sm' ? 28 : size === 'lg' ? 42 : 34;
    return (
      <img
        src="/ameta-symbol.png"
        alt="Ameta Serviços"
        width={dim}
        height={Math.round(dim * 0.73)}
        className={`object-contain select-none shrink-0 ${className}`}
      />
    );
  }

  if (variant === 'card') {
    const heightClass = size === 'sm' ? 'h-9' : size === 'lg' ? 'h-16' : 'h-12';
    return (
      <span
        className={`inline-flex items-center justify-center rounded-[12px] bg-white px-3.5 py-2 shadow-sm border border-[#E3E7EF] select-none shrink-0 ${className}`}
      >
        <img
          src="/ameta-logo.png"
          alt="Ameta Serviços"
          className={`${heightClass} w-auto object-contain`}
        />
      </span>
    );
  }

  const heightClass = size === 'sm' ? 'h-9' : size === 'lg' ? 'h-20' : 'h-12';

  return (
    <span
      className={`inline-flex items-center justify-center select-none shrink-0 ${className}`}
    >
      <img
        src="/ameta-logo-transparent.png"
        alt="Ameta Serviços"
        className={`${heightClass} w-auto object-contain dark:brightness-110`}
      />
    </span>
  );
}
