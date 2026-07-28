import { useI18n } from '../store/useI18n.js';

const OPS = [
  { key: 'addition', labelKey: 'op_add' },
  { key: 'subtraction', labelKey: 'op_sub' },
  { key: 'multiplication', labelKey: 'op_mul' },
  { key: 'division', labelKey: 'op_div' },
  { key: 'percentage', labelKey: 'op_pct' },
];
const DIGITS = [
  { key: 1, labelKey: 'digits_single' },
  { key: 2, labelKey: 'digits_double' },
  { key: 3, labelKey: 'digits_triple' },
  { key: 4, labelKey: 'digits_quad' },
];
const TERMS = [
  { key: 2, labelKey: 'terms_2' },
  { key: 3, labelKey: 'terms_3' },
  { key: 4, labelKey: 'terms_4' },
];

// Ported from the reference prototype's Practice tab markup + setMode()/adjT()/adjC() and the
// chip-toggle handler. `cfg` is held above this component so it survives tab switches, exactly
// as the reference's DOM state does (it is likewise not persisted across reloads).
export default function PracticeScreen({ cfg, onChange, onStart }) {
  const { t } = useI18n();

  // Every update derives from the previous config rather than the one captured at render, so two
  // taps landing in the same frame can't discard the first.
  // A group can never be emptied — the reference blocks deselecting the last active chip.
  function toggleIn(listKey, value) {
    onChange((prev) => {
      const list = prev[listKey];
      const on = list.indexOf(value) !== -1;
      if (on && list.length === 1) return prev;
      return { ...prev, [listKey]: on ? list.filter((v) => v !== value) : [...list, value] };
    });
  }

  const adjT = (d) => onChange((prev) => ({ ...prev, timeMin: Math.min(5, Math.max(1, prev.timeMin + d)) }));
  const adjC = (d) => onChange((prev) => ({ ...prev, count: Math.min(100, Math.max(10, prev.count + d)) }));

  const chip = (listKey, item) => (
    <div
      key={item.key}
      className={'chip' + (cfg[listKey].indexOf(item.key) !== -1 ? ' on' : '')}
      onClick={() => toggleIn(listKey, item.key)}
    >
      {t(item.labelKey)}
    </div>
  );

  return (
    <>
      <div className="pscr">
        <div className="sh">{t('prac_operations')}</div>
        <div className="ssub" style={{ padding: '0 0 4px' }}>{t('prac_operations_sub')}</div>
        <div className="sr">
          <div className="chips">{OPS.map((o) => chip('ops', o))}</div>
        </div>

        <div className="sh">{t('prac_digits')}</div>
        <div className="ssub" style={{ padding: '0 0 4px' }}>{t('prac_digits_sub')}</div>
        <div className="sr">
          <div className="chips">{DIGITS.map((d) => chip('digits', d))}</div>
        </div>

        <div className="sh">{t('prac_terms')}</div>
        <div className="ssub" style={{ padding: '0 0 4px' }}>{t('prac_terms_sub')}</div>
        <div className="sr">
          <div className="chips">{TERMS.map((tm) => chip('terms', tm))}</div>
        </div>

        <div className="sinl" style={{ alignItems: 'flex-start', padding: '10px 0 4px' }}>
          <div style={{ flex: 1 }}>
            <div className="sh" style={{ padding: '0 0 2px' }}>{t('prac_negatives')}</div>
            <div className="ssub">{t('prac_negatives_sub')}</div>
          </div>
          <label className="tog" style={{ marginTop: 2 }}>
            <input type="checkbox" checked={cfg.neg} onChange={(e) => onChange((prev) => ({ ...prev, neg: e.target.checked }))} />
            <span className="tsl"></span>
          </label>
        </div>

        <div className="sinl" style={{ alignItems: 'flex-start', padding: '10px 0 4px' }}>
          <div style={{ flex: 1 }}>
            <div className="sh" style={{ padding: '0 0 2px' }}>{t('prac_decimals')}</div>
            <div className="ssub">{t('prac_decimals_sub')}</div>
          </div>
          <label className="tog" style={{ marginTop: 2 }}>
            <input type="checkbox" checked={cfg.dec} onChange={(e) => onChange((prev) => ({ ...prev, dec: e.target.checked }))} />
            <span className="tsl"></span>
          </label>
        </div>

        <div className="sh">{t('prac_mode')}</div>
        <div className="ssub" style={{ padding: '0 0 6px' }}>{t('prac_mode_sub')}</div>
        <div className="msel">
          <button className={'mb' + (cfg.mode === 'time' ? ' on' : '')} onClick={() => onChange((prev) => ({ ...prev, mode: 'time' }))}>{t('prac_time_limit')}</button>
          <button className={'mb' + (cfg.mode === 'count' ? ' on' : '')} onClick={() => onChange((prev) => ({ ...prev, mode: 'count' }))}>{t('prac_exercise_limit')}</button>
          <button className={'mb' + (cfg.mode === 'unlimited' ? ' on' : '')} onClick={() => onChange((prev) => ({ ...prev, mode: 'unlimited' }))}>{t('prac_unlimited')}</button>
        </div>

        <div className={'msub' + (cfg.mode === 'time' ? ' on' : '')}>
          <div className="scrow">
            <span style={{ fontSize: 'calc(12px * var(--fs-mult))', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{t('prac_duration')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="scbtn" onClick={() => adjT(-1)}>-</button>
              <span style={{ minWidth: 52, textAlign: 'center' }}>{cfg.timeMin} min</span>
              <button className="scbtn" onClick={() => adjT(1)}>+</button>
            </div>
          </div>
        </div>

        <div className={'msub' + (cfg.mode === 'count' ? ' on' : '')}>
          <div className="scrow">
            <span style={{ fontSize: 'calc(12px * var(--fs-mult))', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{t('prac_exercises')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="scbtn" onClick={() => adjC(-10)}>-</button>
              <span style={{ minWidth: 52, textAlign: 'center' }}>{cfg.count}</span>
              <button className="scbtn" onClick={() => adjC(10)}>+</button>
            </div>
          </div>
        </div>

        <div className={'msub' + (cfg.mode === 'unlimited' ? ' on' : '')}>
          <div className="ssub" style={{ padding: '8px 0' }}>{t('prac_unlimited_sub')}</div>
        </div>
      </div>
      <div className="sprac">
        <button onClick={onStart}>{t('prac_start')}</button>
      </div>
    </>
  );
}
