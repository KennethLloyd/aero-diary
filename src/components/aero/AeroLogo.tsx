import Image from 'next/image';

export function AeroLogo({ className = '' }: { className?: string }) {
  return (
    <Image
      src="/aero-diary-icon.png"
      alt="Aero Diary app icon"
      width={1254}
      height={1254}
      sizes="(max-width: 639px) 180px, 220px"
      preload
      className={`aero-logo-image ${className}`}
    />
  );
}
