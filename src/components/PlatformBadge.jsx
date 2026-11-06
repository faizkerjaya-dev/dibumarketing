// Lencana platform dengan warna rasmi (TT, IG, FB, TH…).
import { platformStyle } from '../lib/social';

export default function PlatformBadge({ platform, size = 20, title }) {
  const st = platformStyle(platform);
  return (
    <span
      className="pbadge"
      title={title || platform}
      aria-label={platform}
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.44), borderRadius: Math.round(size * 0.27),
        background: st.bg, color: st.ink, boxShadow: `inset 0 0 0 1.5px ${st.ring}`, textShadow: st.shadow,
      }}
    >
      {st.code}
    </span>
  );
}
