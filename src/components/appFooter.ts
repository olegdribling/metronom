// Нижняя панель — .app-footer из каталога. Три иконки: плейлист, play/stop
// (транспорт), настройки. BPM крупно показан в кольце на экране метронома
// (components/beatRing.ts) — здесь его больше не дублируем, один смысл
// (текущий темп) не должен жить в двух местах сразу.
import { h } from '../dom.ts'
import { icon } from '../icons.ts'

export type RouteKind = 'metronome' | 'playlist' | 'beats' | 'settings'

export interface FooterProps {
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
      navButton('playlist', 'music-note', 'Плейлист'),
      navButton('beats', 'drum', 'Биты'),
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
      navButton('settings', 'gear', 'Настройки')
    )
  )
}
