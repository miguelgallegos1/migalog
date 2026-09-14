export function Logo({ size = 40 }: { size?: number }) {
  return <img src="/favicon.svg" width={size} height={size} alt="MigaLog" className="drop-shadow-lg" />;
}
