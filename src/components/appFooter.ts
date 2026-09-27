// Нижняя панель — .app-footer из каталога. Транспорт (play/stop) и
// переключение между тремя экранами: метроном / плейлист / настройки.
// BPM-слайдер живёт на экране метронома, а не тут — не размазываем один
// смысл (регулировка темпа) по двум местам.
import { h } from '../dom.ts'
import { icon } from '../icons.ts'

export type RouteKind = 'metronome' | 'playlist' | 'settings'

export interface FooterProps {
  bpm: number
  isPlaying: boolean
  samplesLoaded: boolean
  activeRoute: RouteKind
  onToggleTransport: () => void
  onNavigate: (route: RouteKind) => void
}

export function appFooter(props: FooterProps): HTMLElement {
  const navButton = (route: RouteKind, iconName: string, label: string) =>
    h(
      'button',
      {
        type: 'button',
        className: 'icon-btn',
        'aria-label': label,
        'aria-current': props.activeRoute === route,
        style: props.activeRoute === route ? { borderColor: 'var(--color-border-accent)' } : {},
        onClick: () => props.onNavigate(route),
      },
      icon(iconName)
    )

  return h(
    'footer',
    { className: 'app-footer' },
    h(
      'div',
      { className: 'app-footer__bar' },
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px' } },
        h('span', { style: { fontWeight: 'var(--font-weight-black)', fontSize: '1.05rem' } }, String(props.bpm)),
        h('span', { className: 'badge', style: { fontSize: '0.6rem', padding: '0' } }, 'BPM')
      ),
      h(
        'button',
        {
          type: 'button',
          className: `icon-btn icon-btn--accent`,
          style: { width: '56px', height: '56px', fontSize: '1.4rem' },
          'aria-label': props.isPlaying ? 'Стоп' : 'Играть',
          disabled: !props.samplesLoaded,
          onClick: props.onToggleTransport,
        },
        icon(props.isPlaying ? 'stop' : 'play')
      ),
      navButton('playlist', 'music-note', 'Плейлист'),
      navButton('settings', 'gear', 'Настройки')
    )
  )
}
