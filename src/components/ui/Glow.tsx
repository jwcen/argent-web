/**
 * 背景光晕。两团高斯模糊的色斑在容器里缓慢漂移，用来给纯色画布制造纵深。
 *
 * 设计取舍：不用图片、不用 canvas —— 两个 div + blur filter 就够，
 * 零请求、零布局偏移。颜色走 --c-glow-a/b 令牌，深色下自动加重饱和度，
 * 否则在纯黑底上会淡到看不见。
 *
 * aria-hidden + pointer-events-none：纯装饰，不能拦截点击也不该被读屏。
 * 减少动态效果偏好下，全局 CSS 已把 animation 压成 0.001ms，光晕会静止。
 */
export function Glow({ className = '' }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div
        className="absolute -top-1/3 -left-[10%] w-[70%] aspect-square rounded-full blur-3xl animate-drift"
        style={{ background: 'radial-gradient(circle, var(--c-glow-a) 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-1/2 -right-[5%] w-[60%] aspect-square rounded-full blur-3xl animate-drift"
        style={{
          background: 'radial-gradient(circle, var(--c-glow-b) 0%, transparent 70%)',
          animationDelay: '-9s',
        }}
      />
    </div>
  )
}
