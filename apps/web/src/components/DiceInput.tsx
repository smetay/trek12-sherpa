type Props = {
  y: number | null
  r: number | null
  onChange: (y: number | null, r: number | null) => void
  labels: { yellow: string; red: string }
}

const YELLOW = [0, 1, 2, 3, 4, 5]
const RED = [1, 2, 3, 4, 5, 6]

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
  tone: 'yellow' | 'red'
}) {
  const on = tone === 'yellow' ? 'bg-yellow-400 text-slate-950' : 'bg-rose-600 text-white'
  const off =
    tone === 'yellow' ? 'bg-yellow-400/15 text-yellow-200' : 'bg-rose-600/15 text-rose-200'
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1 text-xs text-slate-400">{label}</legend>
      <div className="grid grid-cols-6 gap-1.5">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={selected === v}
            onClick={() => onPick(v)}
            className={`h-11 rounded-lg text-lg font-bold tabular-nums transition ${selected === v ? on : off}`}
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
