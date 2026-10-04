// Нижняя панель — .app-footer из каталога. Иконки: метроном, плейлист,
// play/stop (транспорт, по центру), биты, настройки. BPM крупно показан в кольце на экране
// метронома (components/beatRing.ts) — здесь его больше не дублируем, один
// смысл (текущий темп) не должен жить в двух местах сразу. Над панелью —
// плашка .banner, если синхронизация с аккаунтом остановилась.
import { h } from '../dom.ts'
import { icon } from '../icons.ts'
import { button } from './button.ts'

export type RouteKind = 'metronome' | 'playlist' | 'beats' | 'settings'

export interface FooterProps {
  isPlaying: boolean
  /** Play доступен (engine.canStart): щелчку сэмплы не нужны. */
  canStart: boolean
  activeRoute: RouteKind
  onToggleTransport: () => void
  onNavigate: (route: RouteKind) => void
  notice?: { text: string; actionLabel: string; onAction: () => void }
}

export function appFooter(props: FooterProps): HTMLDivElement {
  const navButton = (route: RouteKind, iconName: string, label: string) =>
    h(
      'button',
      {
        type: 'button',
        className: `icon-btn${props.activeRoute === route ? ' icon-btn--current' : ''}`,
        'aria-label': label,
        'aria-current': props.activeRoute === route,
        onClick: () => props.onNavigate(route),
      },
      icon(iconName)
    )

  return h(
    'div',
    { className: 'app-footer' },
    props.notice
      ? h(
          'div',
          { className: 'banner', role: 'alert' },
          h('span', { className: 'banner__text' }, props.notice.text),
          button(props.notice.actionLabel, { onClick: props.notice.onAction })
        )
      : null,
    h(
      'div',
      { className: 'app-footer__bar' },
      navButton('metronome', 'metronome', 'Метроном'),
      navButton('playlist', 'music-note', 'Плейлист'),
      h(
        'button',
        {
          type: 'button',
          className: 'icon-btn icon-btn--accent icon-btn--transport',
          'aria-label': props.isPlaying ? 'Стоп' : 'Играть',
          // Стоп доступен всегда; Play — когда есть чем играть.
          disabled: !props.isPlaying && !props.canStart,
          onClick: props.onToggleTransport,
        },
        icon(props.isPlaying ? 'stop' : 'play')
      ),
      navButton('beats', 'drum', 'Биты'),
      navButton('settings', 'gear', 'Настройки')
    )
  )
}
