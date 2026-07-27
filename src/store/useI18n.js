import { useCallback } from 'react';
import { useAppState } from './AppStateContext.jsx';
import { t as tRaw } from '../i18n_data.js';

export function useI18n() {
  const { state } = useAppState();
  const lang = state.settings.lang || 'en';
  const t = useCallback((key, vars) => tRaw(lang, key, vars), [lang]);
  return { t, lang };
}
