import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { MOCK_TAKEN_USERNAMES } from '../store/mockAccounts.js';

// The simulated live "is this name free?" check shared by the account-creation and edit-account
// screens (onboarding has its own copy because its markup and classes differ). Mocked against a
// local list with a deliberate delay so the UX feels like a real lookup — no network call.
// The player's own current name always reads as available.
export function useUsernameCheck(value, ownUsername) {
  const { t } = useI18n();
  const [avail, setAvail] = useState({ text: '', cls: '' });
  const [ok, setOk] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const v = (value || '').trim();
    const mySeq = ++seqRef.current;
    if (v.length < 2) {
      setAvail({ text: '', cls: '' });
      setOk(false);
      return;
    }
    setAvail({ text: t('checking_availability'), cls: 'checking' });
    const id = setTimeout(() => {
      if (mySeq !== seqRef.current) return;
      const isOwn = ownUsername && v.toLowerCase() === ownUsername.toLowerCase();
      const taken = !isOwn && MOCK_TAKEN_USERNAMES.indexOf(v.toLowerCase()) !== -1;
      setAvail({ text: taken ? t('username_taken') : t('username_available'), cls: taken ? 'bad' : 'ok' });
      setOk(!taken);
    }, 450);
    return () => clearTimeout(id);
  }, [value, ownUsername, t]);

  return { avail, ok };
}
