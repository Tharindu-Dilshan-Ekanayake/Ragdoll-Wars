/**
 * Shown while the battle chunk downloads. Plain CSS: it must not depend on anything
 * from that chunk.
 */
export default function LoadingScreen({ label = 'Loading…' }) {
  return (
    <div className="ff-loader">
      <div className="ff-loader__card">
        <div className="ff-loader__title">Ragdoll Wars</div>
        <div className="ff-loader__bar ff-loader__bar--busy">
          <span />
        </div>
        <div className="ff-loader__step">{label}</div>
      </div>
    </div>
  )
}
