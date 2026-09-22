type Props = {
  y: number | null
  r: number | null
  onChange: (y: number | null, r: number | null) => void
  labels: { yellow: string; red: string }
}

const YELLOW = [0, 1, 2, 3, 4, 5]
const RED = [1, 2, 3, 4, 5, 6]

type Tone = 'yellow' | 'red'

const FACE_ON: Record<Tone, string> = {
  yellow: 'bg-accent text-accent-ink border-accent',
  red: 'bg-die-red text-white border-die-red',
}

function Row({
  label,
  values,
  selected,
  onPick,
  tone,
}: {
  label: string
  values: number[]
  selected: number | null
  onPick: (v: number) => void
  tone: Tone
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1 text-sm text-muted">{label}</legend>
      <div className="grid grid-cols-6 gap-1.5">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={selected === v}
            onClick={() => onPick(v)}
            className={`h-12 rounded-lg border-2 text-xl font-bold ${
              selected === v ? FACE_ON[tone] : 'border-line bg-surface text-ink'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function DiceInput({ y, r, onChange, labels }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Row
        label={labels.yellow}
        values={YELLOW}
        selected={y}
        onPick={(v) => onChange(v, r)}
        tone="yellow"
      />
      <Row label={labels.red} values={RED} selected={r} onPick={(v) => onChange(y, v)} tone="red" />
    </div>
  )
}

/** Collapsed dice once both are entered: two die faces and a button to enter new ones. */
export function DiceChip({
  y,
  r,
  label,
  change,
  onChange,
}: {
  y: number
  r: number
  label: string
  change: string
  onChange: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">{label}</span>
      <span className="grid size-10 place-items-center rounded-lg bg-accent text-xl font-bold text-accent-ink">
        {y}
      </span>
      <span className="grid size-10 place-items-center rounded-lg bg-die-red text-xl font-bold text-white">
        {r}
      </span>
      <button
        type="button"
        onClick={onChange}
        className="ml-1 h-10 rounded-lg border border-line px-3 text-sm font-medium"
      >
        {change}
      </button>
    </div>
  )
}
