// Fixed catalogue of every milestone that counts toward the profile's Milestones summary
// (percent complete + "latest achieved"). Streak thresholds are open-ended in the game itself —
// checkStreakMilestones keeps celebrating every 30 days forever — but a percentage needs a
// denominator, so the catalogue stops at 90 days. Reaching further streaks still shows its own
// popup; it just doesn't push this percentage past 100%.
export const MILESTONE_CATALOG = [
  { key: 'ch_first', icon: 'star', nameKey: 'ms_ch_first_name', descKey: 'ms_ch_first_desc' },
  { key: 'ch_perfect', icon: 'star', nameKey: 'ms_perfect_name', descKey: 'ms_perfect_desc' },
  { key: 'ch_medium', icon: 'star', nameKey: 'ms_medium_name', descKey: 'ms_medium_desc' },
  { key: 'ch_hard', icon: 'star', nameKey: 'ms_hard_name', descKey: 'ms_hard_desc' },
  { key: 'br_first', icon: 'brain', nameKey: 'ms_br_first_name', descKey: 'ms_br_first_desc' },
  { key: 'br_sub4', icon: 'brain', nameKey: 'ms_sub4_name', descKey: 'ms_sub4_desc' },
  { key: 'br_age20', icon: 'brain', nameKey: 'ms_age20_name', descKey: 'ms_age20_desc' },
  { key: 'trick_explorer', icon: 'trick', nameKey: 'ms_trickexplorer_name', descKey: 'ms_trickexplorer_desc' },
  { key: 'trick_master', icon: 'trick', nameKey: 'ms_trickmaster_name', descKey: 'ms_trickmaster_desc' },
  { key: 'streak_lit', icon: 'flame', nameKey: 'ms_streaklit_name', descKey: 'ms_streaklit_desc' },
  { key: 'streak_7', icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: 7 } },
  { key: 'streak_14', icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: 14 } },
  { key: 'streak_30', icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: 30 } },
  { key: 'streak_60', icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: 60 } },
  { key: 'streak_90', icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: 90 } },
];

export function isAchieved(milestones, key) {
  return (milestones.achievedLog || []).indexOf(key) !== -1;
}

export function milestonesPercent(milestones) {
  const done = MILESTONE_CATALOG.filter((m) => isAchieved(milestones, m.key)).length;
  return Math.round((done / MILESTONE_CATALOG.length) * 100);
}

// The most recently achieved entry, in the order they were actually unlocked.
export function latestAchievedMilestone(milestones) {
  const log = milestones.achievedLog || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = MILESTONE_CATALOG.filter((m) => m.key === log[i])[0];
    if (entry) return entry;
  }
  return null;
}
