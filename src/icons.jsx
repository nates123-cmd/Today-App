// Minimal, line-based icon set tuned to the warm-dark palette.

const Icon = ({ d, w = 16, sw = 1.5, style = {}, ...rest }) => (
  <svg
    width={w}
    height={w}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    {...rest}
  >
    {d}
  </svg>
)

export const IconCheck = (p) => <Icon {...p} d={<path d="M5 12l4 4 10-10" />} />
export const IconClose = (p) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6L6 18" />
      </>
    }
  />
)
export const IconChev = (p) => <Icon {...p} d={<path d="M6 9l6 6 6-6" />} />
export const IconArrowR = (p) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </>
    }
  />
)
export const IconArrowU = (p) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M12 19V5" />
        <path d="M6 11l6-6 6 6" />
      </>
    }
  />
)

export const IconRegen = (p) => (
  <Icon
    {...p}
    sw={1.2}
    d={
      <>
        <path d="M19 9l-2 2-2-2" />
        <path d="M5 15l2-2 2 2" />
        <path d="M19 11A7 7 0 0 0 5 11" />
        <path d="M5 13a7 7 0 0 0 14 0" />
      </>
    }
  />
)

const IconBreath = (p) => (
  <Icon
    {...p}
    w={22}
    sw={1.2}
    d={
      <>
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="12" cy="12" r="7" opacity="0.55" />
        <circle cx="12" cy="12" r="10" opacity="0.25" />
      </>
    }
  />
)
const IconStoic = (p) => (
  <Icon
    {...p}
    w={22}
    sw={1.2}
    d={
      <>
        <path d="M4 19h16" />
        <path d="M6 19V8M18 19V8" />
        <path d="M3 8h18l-3-4H6L3 8z" />
        <path d="M10 19v-5h4v5" />
      </>
    }
  />
)
const IconMorning = (p) => (
  <Icon
    {...p}
    w={22}
    sw={1.2}
    d={
      <>
        <circle cx="12" cy="14" r="3.5" />
        <path d="M12 6v2M5.5 9l1.4 1.4M18.5 9l-1.4 1.4M4 14h2M18 14h2" />
        <path d="M3 19h18" />
      </>
    }
  />
)
const IconMemento = (p) => (
  <Icon
    {...p}
    w={22}
    sw={1.2}
    d={
      <>
        <path d="M12 2.5l9 5.5v7l-9 6-9-6v-7l9-5.5z" />
        <path d="M8 11l4 2 4-2" />
        <path d="M12 13v6" />
      </>
    }
  />
)

export const groundingIcons = {
  'Waking Up': IconBreath,
  'Stoic meditate': IconStoic,
  'Stoic morning': IconMorning,
  'Memento mori': IconMemento,
}

export const IconPlay = (p) => <Icon {...p} d={<path d="M7 4v16l13-8L7 4z" />} />
export const IconPause = (p) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M7 4v16" />
        <path d="M17 4v16" />
      </>
    }
  />
)
export const IconBolt = (p) => <Icon {...p} d={<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />} />
