export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-tile bg-surface-2 ${className}`}
      aria-hidden="true"
    >
      {/* 微光用 --c-shimmer，深色下是极淡的白、浅色下是接近纯白，
          直接写死 white/70 会让深色骨架屏刺眼。 */}
      <div
        className="absolute inset-0 -translate-x-full [animation:shimmer_1.6s_infinite]"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--c-shimmer), transparent)',
        }}
      />
    </div>
  )
}
