interface Props {
  count?: number
}

/**
 * Placeholder cards shown in the gallery while the agent is working and has not
 * returned any artwork yet. Purely decorative — the live region in App announces
 * the wait to screen readers.
 */
export default function SkeletonGrid({ count = 8 }: Props) {
  return (
    <div className="grid grid--skel" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="skel" key={i}>
          <div className="skel__frame" />
          <div className="skel__meta">
            <div className="skel__bar" style={{ width: '72%' }} />
            <div className="skel__bar skel__bar--thin" style={{ width: '46%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
