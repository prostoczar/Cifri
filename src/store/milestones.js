// Milestone system — ported verbatim from the reference prototype.
import { t } from '../i18n_data.js';

export const MILESTONE_ICONS = {
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  trick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="10" y1="17" x2="14" y2="17"/></svg>',
};

export function milestoneCard(lang, icon, nameKey, descKey, vars) {
  return { icon, nameKey, name: t(lang, nameKey, vars), desc: t(lang, descKey, vars) };
}

// Fixed catalog of every milestone counted toward the profile's percentage-complete summary.
// `check` reads from the milestones slice of app state.
export const MILESTONE_CATALOG = [
  { key: 'ch_first', icon: 'star', nameKey: 'ms_ch_first_name', descKey: 'ms_ch_first_desc', check: (m) => !!m.chFirst },
  { key: 'ch_perfect', icon: 'star', nameKey: 'ms_perfect_name', descKey: 'ms_perfect_desc', check: (m) => !!m.chPerfect },
  { key: 'ch_medium', icon: 'star', nameKey: 'ms_medium_name', descKey: 'ms_medium_desc', check: (m) => !!m.chMedium },
  { key: 'ch_hard', icon: 'star', nameKey: 'ms_hard_name', descKey: 'ms_hard_desc', check: (m) => !!m.chHard },
  { key: 'br_first', icon: 'brain', nameKey: 'ms_br_first_name', descKey: 'ms_br_first_desc', check: (m) => !!m.brFirst },
  { key: 'br_sub4', icon: 'brain', nameKey: 'ms_sub4_name', descKey: 'ms_sub4_desc', check: (m) => !!m.brSub4 },
  { key: 'br_age20', icon: 'brain', nameKey: 'ms_age20_name', descKey: 'ms_age20_desc', check: (m) => !!m.brAge20 },
  { key: 'trick_explorer', icon: 'trick', nameKey: 'ms_trickexplorer_name', descKey: 'ms_trickexplorer_desc', check: (m) => !!m.trickShown },
  { key: 'trick_master', icon: 'trick', nameKey: 'ms_trickmaster_name', descKey: 'ms_trickmaster_desc', check: (m) => !!m.allTricksShown },
  { key: 'streak_lit', icon: 'flame', nameKey: 'ms_streaklit_name', descKey: 'ms_streaklit_desc', check: (m) => !!m.firstStreakLit },
  { key: 'streak_7', icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: 7 }, check: (m) => m.streakShown.indexOf(7) !== -1 },
  { key: 'streak_14', icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: 14 }, check: (m) => m.streakShown.indexOf(14) !== -1 },
  { key: 'streak_30', icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: 30 }, check: (m) => m.streakShown.indexOf(30) !== -1 },
  { key: 'streak_60', icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: 60 }, check: (m) => m.streakShown.indexOf(60) !== -1 },
  { key: 'streak_90', icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: 90 }, check: (m) => m.streakShown.indexOf(90) !== -1 },
];

export function milestonesAchievedCount(milestones) {
  return MILESTONE_CATALOG.filter((m) => m.check(milestones)).length;
}
export function milestonesPercent(milestones) {
  return Math.round((100 * milestonesAchievedCount(milestones)) / MILESTONE_CATALOG.length);
}
export function latestAchievedMilestoneCatalogEntry(milestones) {
  const log = milestones.achievedLog || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const found = MILESTONE_CATALOG.filter((m) => m.key === log[i])[0];
    if (found) return found;
  }
  return null;
}

// Recurring streak thresholds: 7, 14, 30, then every 30 days after (60, 90, 120...)
export function streakMilestoneThreshold(n) {
  if (n === 7 || n === 14 || n === 30) return n;
  if (n > 30 && n % 30 === 0) return n;
  return null;
}
