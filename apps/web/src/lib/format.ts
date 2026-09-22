import type { Lang } from './i18n.ts'

const locale = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : 'en-GB')

export function num(x: number, lang: Lang, digits = 1): string {
  return x.toLocaleString(locale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** "−1,2" for a loss of 1.2 points; "0" when it rounds to nothing. */
export function lossText(loss: number, lang: Lang): string {
  return loss < 0.05 ? '0' : `−${num(loss, lang)}`
}

export function pct(p: number): string {
  return `${Math.round(p * 100)} %`
}
