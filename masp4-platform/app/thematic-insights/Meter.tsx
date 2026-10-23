/** Evidence meter: three dots, filled by the theme's evidence rating. */
import { RATING_DOTS, RATING_LABEL, type EvidenceRating } from '@/lib/themes'
import styles from './themes.module.css'

export default function Meter({ rating }: { rating: EvidenceRating }) {
  const n = RATING_DOTS[rating]
  return (
    <span className={styles.meter} title={RATING_LABEL[rating]}>
      <span aria-hidden="true">{'●'.repeat(n)}<span className={styles.dotOff}>{'●'.repeat(3 - n)}</span></span>
      {RATING_LABEL[rating]}
    </span>
  )
}
