interface IconProps {
  name: string
  className?: string
}

export function Icon({ name, className }: IconProps) {
  return (
    <i
      className={`ph-bold ph-${name}${className ? ' ' + className : ''}`}
      aria-hidden="true"
    />
  )
}
