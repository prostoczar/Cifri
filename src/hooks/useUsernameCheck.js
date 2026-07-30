import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { isUsernameAvailable } from '../lib/accountApi.js';

// The live "is this name free?" check, shared by onboarding, account creation and edit-account.
//
// Now a real lookup: it calls the is_username_available() database function, which answers with
// a single true/false and can never return anyone's row. The 450ms debounce and the
// Checking…/Available/Taken messages are unchanged from the mocked version — only the answer is
// real. The player's own current name always reads as available (enforced in the database
// function itself, not just here).
export function useUsernameCheck(value, ownUsername) {
  const { t } = useI18n();
  const [avail, setAvail] = useState({ text: '', cls: '' });
  const [ok, setOk] = useState(false);
  // Guards against a slower earlier check overwriting a faster later one.
  const seqRef = useRef(0);

  useEffect(() => {
    const v = (value || '').trim();
    const mySeq = ++seqRef.current;
    if (v.length < 2) {
      setAvail({ text: '', cls: '' });
      setOk(false);
      return;
    }

    // The player's own name needs no round trip.
    if (ownUsername && v.toLowerCase() === ownUsername.toLowerCase()) {
      setAvail({ text: t('username_available'), cls: 'ok' });
      setOk(true);
      return;
    }

    setAvail({ text: t('checking_availability'), cls: 'checking' });
    setOk(false);

    const id = setTimeout(async () => {
      if (mySeq !== seqRef.current) return; // a newer keystroke started a fresher check
      const res = await isUsernameAvailable(v);
      if (mySeq !== seqRef.current) return; // and again, now that the network has had its turn

      if (!res.ok) {
        // Offline or the lookup failed. Claiming "✓ Available" here would be a guess, so say
        // nothing and let the player continue — the unique index in the database is the real
        // gate, and it will reject a duplicate at submit time regardless.
        setAvail({ text: '', cls: '' });
        setOk(true);
        return;
      }
      setAvail({
        text: res.available ? t('username_available') : t('username_taken'),
        cls: res.available ? 'ok' : 'bad',
      });
      setOk(res.available);
    }, 450);

    return () => clearTimeout(id);
  }, [value, ownUsername, t]);

  return { avail, ok };
}
