// Pure-CSS Aero logo orb with the grass swoosh.
export function AeroLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`aero-logo-orb ${className}`} aria-hidden="true">
      <div className="aero-swoosh" />
    </div>
  );
}
