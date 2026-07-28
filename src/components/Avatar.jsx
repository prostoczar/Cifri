import { AVATAR_ICONS, avatarStyle, avatarContentPx, avatarIconStrokeWidth } from '../store/avatar.js';

// Renders one avatar spec at any diameter — the header button (36px), the profile sheet and
// account rows (44px), and the picker's live preview (96px) all go through this, so they can
// never disagree about colour, shadow or content size.
export default function Avatar({ spec, size, className }) {
  const style = avatarStyle(spec, size);
  const contentPx = avatarContentPx(spec, size);

  if (spec.type === 'icon' && AVATAR_ICONS[spec.value]) {
    const svg = AVATAR_ICONS[spec.value]
      .replace('<svg', `<svg width="${contentPx}" height="${contentPx}" stroke-width="${avatarIconStrokeWidth(contentPx)}"`);
    return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  return (
    <div className={className} style={{ ...style, fontSize: contentPx }}>
      {spec.value || '?'}
    </div>
  );
}
