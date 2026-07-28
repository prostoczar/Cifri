import { useI18n } from '../store/useI18n.js';
import { MILESTONE_CATALOG, isAchieved } from '../store/milestoneCatalog.js';
import { MILESTONE_ICONS } from '../store/milestones.js';

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

// Ported from the reference prototype's full milestones list — achieved entries in gold with a
// filled icon, unachieved in the normal text colour.
export function MilestonesListScreen({ open, milestones, onClose }) {
  const { t } = useI18n();
  return (
    <div className={'legal-screen' + (open ? ' on' : '')}>
      <div className="ip-hdr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="prof-edit-btn" onClick={onClose}>{t('back')}</button>
        <div className="ip-title">{t('prof_sec_milestones')}</div>
        <span style={{ width: 40 }}></span>
      </div>
      <div className="ip-body legal-body" style={{ paddingBottom: 40 }}>
        {MILESTONE_CATALOG.map((m) => {
          const done = isAchieved(milestones, m.key);
          return (
            <div key={m.key} className={'ms-list-item' + (done ? ' achieved' : '')}>
              <div className="ms-list-icon" dangerouslySetInnerHTML={{ __html: MILESTONE_ICONS[m.icon] || '' }} />
              <div>
                <div className="ms-list-name">{t(m.nameKey, m.vars)}</div>
                <div className="ms-list-desc">{t(m.descKey, m.vars)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
