import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

// 滚动进入视口时淡入上移。once:true 保证只播一次，避免来回滚动闪烁。
export function Reveal({
  children,
  delay = 0,
  className = '',
  y = 16,
}: {
  children: ReactNode
  delay?: number
  className?: string
  y?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  )
}
