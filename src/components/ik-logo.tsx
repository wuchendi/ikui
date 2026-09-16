import { cn } from 'cn'

interface IkLogoProps {
  className?: string
  size?: number
}

export function IkLogo({ className, size = 24 }: IkLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="138 111 261 290"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <circle cx="174" cy="150" r="30" fill="var(--color-foreground)" />
      <g
        stroke="var(--color-foreground)"
        strokeWidth="54"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M174 218V368" />
        <path d="M294 144V368" />
        <path d="M294 300L362 232" />
        <path d="M294 300L366 368" />
      </g>
    </svg>
  )
}
