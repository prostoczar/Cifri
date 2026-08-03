import { useI18n } from '../store/useI18n.js';
import { ACHIEVEMENTS, achDesc, achName, achievementsByRarity, earnedCount, isEarned } from '../store/achievements.js';
import { AVATAR_ICONS } from '../store/avatar.js';

// Ported from the reference prototype's legal screen — static Terms / Privacy pages.
export function LegalScreen({ open, which, onClose }) {
  const { t } = useI18n();
  const isPrivacy = which === 'privacy';
  return (
    <div className={'legal-screen' + (open ? ' on' : '')}>
      <div className="ip-hdr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="prof-edit-btn" onClick={onClose}>{t('back')}</button>
        <div className="ip-title">{isPrivacy ? t('legal_privacy_link') : t('legal_terms_link')}</div>
        <span style={{ width: 40 }}></span>
      </div>
      <div
        className="ip-body legal-body"
        style={{ paddingBottom: 40 }}
        dangerouslySetInnerHTML={{ __html: isPrivacy ? t('legal_privacy_body') : t('legal_terms_body') }}
      />
    </div>
  );
}

// Ported from the reference prototype's full achievements list — earned entries in gold with a
// filled icon, unearned in the normal text colour.
//
// Shown easiest-first: Common, Uncommon, Rare, Epic, Legendary, and inside each tier grouped by
// mode. The old order was the spreadsheet's, which put all eight Braining entries at the top
// regardless of difficulty — so the first thing a new player scrolled past was a wall of things
// they had no route to, and the Legendary entries they will probably never see were mixed in with
// the ones they would get that week. See achievementsByRarity() for why this is a view over the
// catalogue rather than a reordering of it.
export function AchievementsListScreen({ open, milestones, onClose }) {
  const { t, lang } = useI18n();
  const ordered = achievementsByRarity();
  return (
    <div className={'legal-screen' + (open ? ' on' : '')}>
      <div className="ip-hdr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="prof-edit-btn" onClick={onClose}>{t('back')}</button>
        <div className="ip-title">{t('prof_sec_achievements')}</div>
        <span style={{ width: 40 }}></span>
      </div>
      <div className="ip-body legal-body" style={{ paddingBottom: 40 }}>
        <div className="ms-list-count">
          {earnedCount(milestones)} / {ACHIEVEMENTS.length}
        </div>
        {/* The disclaimer that used to sit here said most of this list could not be earned yet.
            That was true when the rows were imported ahead of their triggers, and it is not true
            any more — every entry below is reachable — so it is gone rather than left to quietly
            misinform. */}
        {ordered.map((a) => {
          const done = isEarned(milestones, a.key);
          return (
            <div key={a.key} className={'ms-list-item' + (done ? ' achieved' : '')}>
              {a.reward.type === 'symbol' ? (
                <div className="ms-list-icon ms-symbol">{a.reward.value}</div>
              ) : (
                <div className="ms-list-icon" dangerouslySetInnerHTML={{ __html: AVATAR_ICONS[a.reward.value] || '' }} />
              )}
              <div>
                <div className="ms-list-name">
                  {achName(lang, a)}
                  <span className={'ms-rarity r-' + a.rarity}>{t('rarity_' + a.rarity)}</span>
                </div>
                <div className="ms-list-desc">{achDesc(lang, a)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
