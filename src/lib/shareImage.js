// Getting a finished PNG out of the app and into somebody else's hands.
//
// Two tiers, and deliberately only two:
//
//   1. THE PHONE PATH. navigator.share() with the image attached opens the operating system's own
//      share sheet — Messages, WhatsApp, Instagram, everything the player already has. This is the
//      feature; everything else is a consolation.
//
//   2. EVERYTHING ELSE. Download the PNG and copy the app's address to the clipboard in the same
//      tap. Mostly desktop.
//
// A THIRD TIER WAS CONSIDERED AND REJECTED: browsers that can share text but not files (some
// desktop builds, Firefox on Android). Routing them through navigator.share would open a share
// sheet containing a bare link and no picture, which reads as broken rather than as degraded, and
// it is a third path to keep working for a case that is not what this feature is for. They get the
// download instead, which at least produces the image.
//
// ── The one genuinely dangerous detail: the tap ───────────────────────────────────────────────
//
// navigator.share() may only be called while the browser still considers a real finger-tap to be
// in progress ("transient activation"). Drawing the card involves awaiting — the webfont, the icon
// decode — and on iOS Safari an await can spend that activation, after which share() rejects with
// NotAllowedError and NOTHING appears. It looks exactly like a dead button.
//
// The fix is not in this file, it is in the caller: ShareButton renders the PNG in the background
// as soon as the screen appears, so by the time anyone taps, `blob` already exists and share() is
// reached with no awaiting in between. This module still handles the case where a fast tapper beat
// the render — it falls through to the download rather than failing silently, which is why
// NotAllowedError is caught by name below.

import { appUrl } from './appUrl.js';

// Whether the phone path is available AT ALL, asked with a real file because that is the only
// honest way to ask: canShare() inspects what it is given, and a browser can support sharing text
// while refusing files. Used by the button to decide what to call itself before anyone taps it.
export function canShareImages() {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([new Blob([''], { type: 'image/png' })], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch (e) {
    // Safari on an older iOS has no File constructor usable this way. Treat as unsupported —
    // being wrong in this direction costs a download instead of a share sheet, and being wrong in
    // the other direction costs a button that does nothing.
    return false;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Appended before clicking: Firefox ignores a click on an anchor that is not in the document.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a later tick — revoking immediately can cancel the download that was just started.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function copyAppLink() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return false;
    await navigator.clipboard.writeText(appUrl());
    return true;
  } catch (e) {
    // Refused permission, or an insecure context. The download still happened, so the tap was not
    // wasted; the toast simply says less.
    return false;
  }
}

/**
 * Share a rendered card, or fall back to saving it.
 *
 * @returns {Promise<{outcome: string, method: string, linkCopied?: boolean}>}
 *   outcome — 'shared'    the share sheet accepted it (as close to "it went out" as any browser
 *                         will admit to)
 *             'dismissed' the player closed the share sheet without sending
 *             'saved'     the PNG was downloaded instead
 *             'failed'    nothing worked
 *   method  — 'web_share' | 'download'
 */
export async function shareImage({ blob, filename, text }) {
  if (!blob) return { outcome: 'failed', method: 'none' };

  if (canShareImages()) {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        // `text`, never `url`. iOS has a long-standing habit of dropping the attached file when a
        // url field is present as well, and the address is printed on the card anyway — so the
        // link travels inside the sentence, where it cannot displace the picture.
        await navigator.share({ files: [file], text });
        return { outcome: 'shared', method: 'web_share' };
      }
    } catch (e) {
      // A cancelled share sheet is not an error, and must not be reported as one — it is a player
      // changing their mind, which is a perfectly ordinary thing to do and interesting to measure.
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
        if (e.name === 'AbortError') return { outcome: 'dismissed', method: 'web_share' };
        // NotAllowedError means the tap was spent before share() was reached (see the header).
        // Falling through to the download leaves the player with something rather than nothing.
      }
    }
  }

  try {
    downloadBlob(blob, filename);
    const linkCopied = await copyAppLink();
    return { outcome: 'saved', method: 'download', linkCopied };
  } catch (e) {
    return { outcome: 'failed', method: 'download' };
  }
}

// A filename a person can find again in their downloads folder, and that says what it is when it
// arrives in a chat. ASCII-folded: a Russian achievement name in a filename survives most of the
// journey and then breaks somewhere unhelpful.
export function shareFilename(slug) {
  const safe = String(slug || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return 'cifri-' + (safe || 'card') + '.png';
}
