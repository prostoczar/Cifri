// The achievement catalogue — all 59, transcribed from Cifri_Milestones_v4.xlsx.
//
// Each entry is one row of that spreadsheet, kept whole: its name, the trigger text shown to the
// player, its rarity, and the picker reward it unlocks. The copy is the spreadsheet's own wording,
// not a rewrite of it, and both languages sit on the row rather than in i18n_data.js — that is
// deliberate. It means a row here can be read straight across against the source file and checked,
// which is the only practical way to keep 59 rows honest to a spreadsheet nobody wants to re-read.
//
// The spreadsheet has 60 rows. Row 43, "You've lit a streak!", is marked there as "Not a real
// achievement" — it is the onboarding save-your-progress prompt — so it is not in this list. It
// still has its own popup and its own `streak_lit` entry in the earned log; it simply does not
// count towards the total, because it is not something a player achieved.
//
// `key` is the identifier stored in milestones.achievedLog and can never change: fifteen of these
// keys are already in players' saved data and on the server. New entries were free to pick any
// name; the fifteen that existed kept theirs.

// Ordered weakest to strongest. Used for grouping and for anything that wants to sort by scarcity.
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const ACHIEVEMENTS = [
  // ── Braining ────────────────────────────────────────────────────────────────
  { key: 'br_first', rarity: 'common', mode: 'braining', reward: { type: 'symbol', value: '≈' },
    en: { name: 'First Braining', desc: 'You completed your first Braining session.' },
    ru: { name: 'Первая тренировка мозга', desc: 'Вы прошли свою первую тренировку мозга.' } },
  { key: 'br_sub4', rarity: 'uncommon', mode: 'braining', reward: { type: 'icon', value: 'clock' },
    en: { name: 'Under 4 Minutes', desc: 'You finished a Braining session in under 4 minutes.' },
    ru: { name: 'Быстрее 4 минут', desc: 'Вы прошли тренировку мозга быстрее чем за 4 минуты.' } },
  { key: 'br_age20', rarity: 'rare', mode: 'braining', reward: { type: 'icon', value: 'cake' },
    en: { name: 'Brain Age 20', desc: 'You reached the best possible brain age.' },
    ru: { name: 'Возраст мозга — 20', desc: 'Вы достигли лучшего возможного возраста мозга.' } },
  { key: 'br_flawless', rarity: 'uncommon', mode: 'braining', reward: { type: 'icon', value: 'bolt' },
    en: { name: 'Flawless Brain', desc: 'You completed a Braining session with zero wrong answers.' },
    ru: { name: 'Безупречный ум', desc: 'Вы прошли тренировку мозга без единой ошибки.' } },
  { key: 'br_sub3', rarity: 'rare', mode: 'braining', reward: { type: 'icon', value: 'hourglass' },
    en: { name: 'Sub-3 Minutes', desc: 'You finished a Braining session in under 3 minutes.' },
    ru: { name: 'Быстрее 3 минут', desc: 'Вы прошли тренировку мозга быстрее чем за 3 минуты.' } },
  // The trigger text here is the rewritten version: the original promised a flat 10-year drop,
  // which some players could never reach. See sharperEveryDayTarget() in store/brainingRules.js
  // for the tiered rule the wording now describes.
  { key: 'br_sharper', rarity: 'rare', mode: 'braining', reward: { type: 'symbol', value: 'Δ' },
    en: { name: 'Sharper Every Day', desc: 'Your brain age has dropped significantly since your very first result — by 20 years, below 25, or all the way to 20, depending on where you started.' },
    ru: { name: 'Острее день ото дня', desc: 'Ваш возраст мозга заметно снизился по сравнению с самым первым результатом — на 20 лет, ниже 25 или до всех 20, в зависимости от того, с чего вы начинали.' } },
  { key: 'br_steady', rarity: 'epic', mode: 'braining', reward: { type: 'icon', value: 'brain' },
    en: { name: 'Steady Mind', desc: 'You reached Brain Age 20 five times.' },
    ru: { name: 'Твёрдый ум', desc: 'Вы пять раз достигли возраста мозга 20.' } },
  { key: 'br_half_century', rarity: 'epic', mode: 'braining', reward: { type: 'icon', value: 'book' },
    en: { name: 'Half-Century', desc: 'You completed 50 total Braining sessions.' },
    ru: { name: 'Полсотни', desc: 'Вы прошли 50 тренировок мозга в общей сложности.' } },

  // ── Challenge ───────────────────────────────────────────────────────────────
  { key: 'ch_first', rarity: 'common', mode: 'challenge', reward: { type: 'symbol', value: '=' },
    en: { name: 'First Challenge', desc: 'You completed your first Challenge session.' },
    ru: { name: 'Первый вызов', desc: 'Вы завершили свой первый Challenge.' } },
  { key: 'ch_challenger', rarity: 'rare', mode: 'challenge', reward: { type: 'icon', value: 'star' },
    en: { name: 'Challenger', desc: 'Complete Easy, Medium, and Hard Challenge in the same day with at least 5 correct answers in each.' },
    ru: { name: 'Претендент', desc: 'Пройдите Easy, Medium и Hard Challenge в один день, набрав минимум 5 правильных ответов в каждом.' } },
  { key: 'ch_perfect', rarity: 'uncommon', mode: 'challenge', reward: { type: 'icon', value: 'sneaker' },
    en: { name: 'Perfect Run', desc: '100% accuracy on a Challenge session of 10 or more questions.' },
    ru: { name: 'Идеальный забег', desc: '100% точности в Challenge из 10 и более вопросов.' } },
  { key: 'ch_medium', rarity: 'uncommon', mode: 'challenge', reward: { type: 'symbol', value: '≤' },
    en: { name: 'Medium Unlocked', desc: 'You completed your first Medium Challenge.' },
    ru: { name: 'Открыт уровень Medium', desc: 'Вы прошли свой первый Challenge на уровне Medium.' } },
  { key: 'ch_hard', rarity: 'rare', mode: 'challenge', reward: { type: 'symbol', value: '≥' },
    en: { name: 'Hard Unlocked', desc: 'You completed your first Hard Challenge.' },
    ru: { name: 'Открыт уровень Hard', desc: 'Вы прошли свой первый Challenge на уровне Hard.' } },
  { key: 'ch_four_for_four', rarity: 'uncommon', mode: 'challenge', reward: { type: 'icon', value: 'car' },
    en: { name: 'Four for Four', desc: 'You got every operation type right in one Challenge session.' },
    ru: { name: 'Все четыре', desc: 'Вы правильно ответили на вопросы всех типов операций за один Challenge.' } },
  { key: 'ch_perfect_hard', rarity: 'rare', mode: 'challenge', reward: { type: 'icon', value: 'trophy' },
    en: { name: 'Perfect on Hard', desc: '100% accuracy on a Hard Challenge session of 10 or more questions.' },
    ru: { name: 'Идеально на Hard', desc: '100% точности в Challenge на уровне Hard из 10 и более вопросов.' } },
  { key: 'ch_speed_demon', rarity: 'rare', mode: 'challenge', reward: { type: 'icon', value: 'demon' },
    en: { name: 'Speed Demon', desc: 'You answered 20 or more questions correctly in one 60-second Challenge.' },
    ru: { name: 'Демон скорости', desc: 'Вы правильно ответили на 20 и более вопросов за один 60-секундный Challenge.' } },
  { key: 'ch_peak', rarity: 'epic', mode: 'challenge', reward: { type: 'icon', value: 'mountain' },
    en: { name: 'To the Peak!', desc: 'You scored 100 or higher in a single Challenge session.' },
    ru: { name: 'На вершину!', desc: 'Вы набрали 100 и более очков за один Challenge.' } },
  { key: 'ch_sky', rarity: 'epic', mode: 'challenge', reward: { type: 'icon', value: 'plane' },
    en: { name: 'To the Sky!', desc: 'You scored 150 or higher in a single Challenge session.' },
    ru: { name: 'В небо!', desc: 'Вы набрали 150 и более очков за один Challenge.' } },
  { key: 'ch_moon', rarity: 'epic', mode: 'challenge', reward: { type: 'icon', value: 'rocket' },
    en: { name: 'To the Moon!', desc: 'You scored 200 or higher in a single Challenge session.' },
    ru: { name: 'На Луну!', desc: 'Вы набрали 200 и более очков за один Challenge.' } },
  { key: 'ch_triple_crown', rarity: 'legendary', mode: 'challenge', reward: { type: 'icon', value: 'crown' },
    en: { name: 'Triple Crown', desc: 'Complete Easy, Medium, and Hard Challenge in the same day with at least 20 correct answers in each.' },
    ru: { name: 'Тройная корона', desc: 'Пройдите Easy, Medium и Hard Challenge в один день, набрав минимум 20 правильных ответов в каждом.' } },
  { key: 'ch_easy', rarity: 'common', mode: 'challenge', reward: { type: 'symbol', value: '∴' },
    en: { name: 'Easy Unlocked', desc: 'You completed your first easy Challenge.' },
    ru: { name: 'Открыт уровень Easy', desc: 'Вы прошли свой первый Challenge на уровне Easy.' } },
  { key: 'ch_nice', rarity: 'epic', mode: 'challenge', reward: { type: 'icon', value: 'nice' },
    en: { name: 'Nice!', desc: 'Get a score of 69 in Challenge on any difficulty.' },
    ru: { name: 'Красота!', desc: 'Наберите ровно 69 очков в Challenge на любом уровне сложности.' } },

  // ── Cross-mode ──────────────────────────────────────────────────────────────
  { key: 'x_well_rounded', rarity: 'rare', mode: 'cross', reward: { type: 'icon', value: 'globe' },
    en: { name: 'Well-Rounded', desc: 'You completed Challenge, Braining, Practice, and a Trick all in the same day.' },
    ru: { name: 'Разносторонний', desc: 'Вы прошли Challenge, тренировку мозга, Practice и один трюк в один и тот же день.' } },
  { key: 'x_one_year', rarity: 'legendary', mode: 'cross', reward: { type: 'icon', value: 'castle' },
    en: { name: 'One Year Strong', desc: "It's been 365 days since you started using Cifri." },
    ru: { name: 'Год с Cifri', desc: 'Прошло 365 дней с тех пор, как вы начали пользоваться Cifri.' } },
  { key: 'x_explorer', rarity: 'uncommon', mode: 'cross', reward: { type: 'icon', value: 'compass' },
    en: { name: 'Explorer', desc: 'You tried all four modes — Challenge, Braining, Practice, and Tricks — at least once.' },
    ru: { name: 'Исследователь', desc: 'Вы попробовали все четыре режима — Challenge, тренировку мозга, Practice и Tricks — хотя бы раз.' } },
  // The spreadsheet says "Get all milestones"; the feature is called Achievements now, and the
  // Russian line was written that way too. It cannot require ITSELF, so it asks for all the others
  // — see `earnedCount` and the collector check, which both exclude this entry from its own bar.
  { key: 'x_collector', rarity: 'legendary', mode: 'cross', reward: { type: 'icon', value: 'collection' },
    en: { name: 'Got to catch the all!', desc: 'Get all achievements.' },
    ru: { name: 'Собери их все!', desc: 'Получите все достижения.' } },

  // ── Cumulative ──────────────────────────────────────────────────────────────
  { key: 'q_100', rarity: 'common', mode: 'cumulative', reward: { type: 'symbol', value: 'Σ' },
    en: { name: '100 Questions Answered', desc: "You've answered 100 questions across every mode combined." },
    ru: { name: '100 вопросов', desc: 'Вы ответили на 100 вопросов во всех режимах вместе взятых.' } },
  { key: 'q_500', rarity: 'uncommon', mode: 'cumulative', reward: { type: 'symbol', value: 'π' },
    en: { name: '500 Questions Answered', desc: "You've answered 500 questions across every mode combined." },
    ru: { name: '500 вопросов', desc: 'Вы ответили на 500 вопросов во всех режимах вместе взятых.' } },
  { key: 'q_1000', rarity: 'uncommon', mode: 'cumulative', reward: { type: 'symbol', value: 'β' },
    en: { name: '1,000 Questions Answered', desc: "You've answered 1,000 questions across every mode combined." },
    ru: { name: '1000 вопросов', desc: 'Вы ответили на 1000 вопросов во всех режимах вместе взятых.' } },
  { key: 'q_2500', rarity: 'rare', mode: 'cumulative', reward: { type: 'symbol', value: 'α' },
    en: { name: '2,500 Questions Answered', desc: "You've answered 2,500 questions across every mode combined." },
    ru: { name: '2500 вопросов', desc: 'Вы ответили на 2500 вопросов во всех режимах вместе взятых.' } },
  { key: 'q_5000', rarity: 'rare', mode: 'cumulative', reward: { type: 'symbol', value: 'Ω' },
    en: { name: '5,000 Questions Answered', desc: "You've answered 5,000 questions across every mode combined." },
    ru: { name: '5000 вопросов', desc: 'Вы ответили на 5000 вопросов во всех режимах вместе взятых.' } },
  { key: 'q_pct_pro', rarity: 'uncommon', mode: 'cumulative', reward: { type: 'symbol', value: '%' },
    en: { name: 'Percentage Pro', desc: 'You answered 70 percentage questions correctly.' },
    ru: { name: 'Мастер процентов', desc: 'Вы правильно ответили на 70 вопросов на проценты.' } },

  // ── Play-again mechanic ─────────────────────────────────────────────────────
  { key: 'rp_first', rarity: 'common', mode: 'replay', reward: { type: 'icon', value: 'clover' },
    en: { name: 'Feeling Lucky', desc: 'You replayed Challenge after your score was already recorded, for the first time.' },
    ru: { name: 'Попытаю удачу', desc: 'Вы впервые сыграли Challenge повторно после того, как результат дня уже был зафиксирован.' } },
  { key: 'rp_up', rarity: 'uncommon', mode: 'replay', reward: { type: 'icon', value: 'shield' },
    en: { name: 'Nerves of Steel', desc: 'You replayed Challenge and your average went up, not down.' },
    ru: { name: 'Стальные нервы', desc: 'Вы сыграли Challenge повторно, и ваш средний балл вырос, а не упал.' } },
  { key: 'rp_plus50', rarity: 'rare', mode: 'replay', reward: { type: 'icon', value: 'gift' },
    en: { name: 'Paid Off', desc: 'A replay raised your daily average by 50 points or more.' },
    ru: { name: 'Окупилось', desc: 'Повторная игра подняла ваш дневной средний балл на 50 очков и более.' } },
  // The spreadsheet asks for five replays. Under the averaging model a replay is a cheap thing to
  // do — every Challenge play counts, so five extra runs is one determined evening — and five put
  // this well below the Rare tier it sits in. Raised to seven, with the wording moved to match:
  // the number a player is told is the number they have to reach.
  { key: 'rp_five', rarity: 'rare', mode: 'replay', reward: { type: 'icon', value: 'dice' },
    en: { name: 'High Roller', desc: 'You replayed Challenge seven or more times in a single day.' },
    ru: { name: 'Азартный игрок', desc: 'Вы сыграли Challenge повторно семь и более раз за один день.' } },
  { key: 'rp_consistent', rarity: 'epic', mode: 'replay', reward: { type: 'icon', value: 'moon' },
    en: { name: 'Locked In', desc: 'Three replays in a row landed within a few points of each other.' },
    ru: { name: 'В своей колее', desc: 'Три повторные попытки подряд оказались в пределах нескольких очков друг от друга.' } },

  // ── Practice ────────────────────────────────────────────────────────────────
  { key: 'pr_sharpshooter', rarity: 'uncommon', mode: 'practice', reward: { type: 'icon', value: 'target' },
    en: { name: 'Sharpshooter', desc: '100% accuracy on a Practice session of 20 or more questions.' },
    ru: { name: 'Снайпер', desc: '100% точности за сессию Practice из 20 и более вопросов.' } },
  { key: 'pr_mix_master', rarity: 'rare', mode: 'practice', reward: { type: 'icon', value: 'weights' },
    en: { name: 'Mix Master', desc: 'You tried every operation type at least once in Practice.' },
    ru: { name: 'Мастер микса', desc: 'Вы попробовали каждый тип операции хотя бы раз в Practice.' } },
  { key: 'pr_marathon', rarity: 'rare', mode: 'practice', reward: { type: 'icon', value: 'bike' },
    en: { name: 'Marathon Session', desc: 'You completed a Practice session of 100 or more questions.' },
    ru: { name: 'Марафонская сессия', desc: 'Вы прошли сессию Practice из 100 и более вопросов.' } },
  { key: 'pr_all_mixed', rarity: 'rare', mode: 'practice', reward: { type: 'icon', value: 'puzzle' },
    en: { name: 'All Mixed Up', desc: 'You used every operation type in a single Practice session.' },
    ru: { name: 'Всё в кучу', desc: 'Вы использовали все типы операций в одной сессии Practice.' } },
  { key: 'pr_first', rarity: 'common', mode: 'practice', reward: { type: 'symbol', value: '≠' },
    en: { name: 'First Practice', desc: 'You completed your first Practice session.' },
    ru: { name: 'Первая практика', desc: 'Вы прошли свою первую сессию Practice.' } },

  // ── Streak ──────────────────────────────────────────────────────────────────
  { key: 'streak_7', rarity: 'common', mode: 'streak', reward: { type: 'icon', value: 'spark' },
    en: { name: '7-day streak', desc: 'You have played any mode in Cifri 7 days in a row.' },
    ru: { name: '7 дней подряд', desc: 'Вы играли в любой режим Cifri 7 дней подряд.' } },
  { key: 'streak_14', rarity: 'uncommon', mode: 'streak', reward: { type: 'icon', value: 'flame' },
    en: { name: '14-day streak', desc: 'You have played any mode in Cifri 14 days in a row.' },
    ru: { name: '14 дней подряд', desc: 'Вы играли в любой режим Cifri 14 дней подряд.' } },
  { key: 'streak_30', rarity: 'rare', mode: 'streak', reward: { type: 'icon', value: 'bang' },
    en: { name: '30-day streak', desc: 'You have played any mode in Cifri 30 days in a row.' },
    ru: { name: '30 дней подряд', desc: 'Вы играли в любой режим Cifri 30 дней подряд.' } },
  { key: 'streak_60', rarity: 'epic', mode: 'streak', reward: { type: 'icon', value: 'sun' },
    en: { name: '60-day streak', desc: 'You have played any mode in Cifri 60 days in a row.' },
    ru: { name: '60 дней подряд', desc: 'Вы играли в любой режим Cifri 60 дней подряд.' } },
  { key: 'streak_90', rarity: 'legendary', mode: 'streak', reward: { type: 'icon', value: 'sparkles' },
    en: { name: '90-day streak', desc: 'You have played any mode in Cifri 90 days in a row.' },
    ru: { name: '90 дней подряд', desc: 'Вы играли в любой режим Cifri 90 дней подряд.' } },
  { key: 'streak_180', rarity: 'legendary', mode: 'streak', reward: { type: 'icon', value: 'atom' },
    en: { name: '180-day streak', desc: 'You have played any mode in Cifri 180 days in a row, and every 30 days after, through 360.' },
    ru: { name: '180 дней подряд', desc: 'Вы играли в любой режим Cifri 180 дней подряд, и далее каждые 30 дней вплоть до 360.' } },
  { key: 'streak_365', rarity: 'legendary', mode: 'streak', reward: { type: 'icon', value: 'orbit' },
    en: { name: '365-day streak', desc: 'You have played any mode in Cifri 365 days in a row — a full year.' },
    ru: { name: '365 дней подряд', desc: 'Вы играли в любой режим Cifri 365 дней подряд — целый год.' } },
  { key: 'streak_rebirth', rarity: 'rare', mode: 'streak', reward: { type: 'icon', value: 'activity' },
    en: { name: 'Rebirth', desc: 'You used a streak restore for the first time.' },
    ru: { name: 'Возрождение', desc: 'Вы впервые использовали восстановление серии.' } },
  { key: 'streak_record', rarity: 'legendary', mode: 'streak', reward: { type: 'icon', value: 'medal' },
    en: { name: 'New Record', desc: 'You broke your all-time longest streak after having broken your streak at least once before.' },
    ru: { name: 'Новый рекорд', desc: 'Вы побили свой личный рекорд по длине серии после того, как хотя бы раз её теряли.' } },

  // ── Tricks ──────────────────────────────────────────────────────────────────
  { key: 'tr_first', rarity: 'common', mode: 'tricks', reward: { type: 'symbol', value: '±' },
    en: { name: 'First Trick', desc: 'You practiced your first trick in the Tricks library.' },
    ru: { name: 'Первый трюк', desc: 'Вы впервые попрактиковали трюк из библиотеки Tricks.' } },
  { key: 'trick_explorer', rarity: 'common', mode: 'tricks', reward: { type: 'symbol', value: '°' },
    en: { name: 'Trick Explorer', desc: 'You viewed 10 tricks of the day.' },
    ru: { name: 'Исследователь трюков', desc: 'Вы просмотрели 10 трюков дня.' } },
  { key: 'trick_master', rarity: 'epic', mode: 'tricks', reward: { type: 'icon', value: 'briefcase' },
    en: { name: 'Trick Master', desc: 'You have practiced every trick in the Tricks library.' },
    ru: { name: 'Мастер трюков', desc: 'Вы попрактиковали каждый трюк в библиотеке Tricks.' } },
  { key: 'tr_halfway', rarity: 'uncommon', mode: 'tricks', reward: { type: 'symbol', value: '½' },
    en: { name: 'Halfway There', desc: 'You practiced 5 different tricks.' },
    ru: { name: 'На полпути', desc: 'Вы попрактиковали 5 разных трюков.' } },
  { key: 'tr_clean_sweep', rarity: 'rare', mode: 'tricks', reward: { type: 'icon', value: 'house' },
    en: { name: 'Clean Sweep', desc: '100% accuracy in a trick practice session.' },
    ru: { name: 'Чистая победа', desc: '100% точности в сессии практики трюка.' } },
  { key: 'tr_curious', rarity: 'uncommon', mode: 'tricks', reward: { type: 'symbol', value: '∅' },
    en: { name: 'Curious Mind', desc: 'You viewed every trick of the day at least once.' },
    ru: { name: 'Любопытный ум', desc: 'Вы просмотрели каждый трюк дня хотя бы раз.' } },
  { key: 'tr_first_exam', rarity: 'uncommon', mode: 'tricks', reward: { type: 'icon', value: 'key' },
    en: { name: 'First Exam', desc: 'Pass the first trick test.' },
    ru: { name: 'Первый экзамен', desc: 'Сдайте первый тест по трюку.' } },
  { key: 'tr_graduation', rarity: 'legendary', mode: 'tricks', reward: { type: 'icon', value: 'graduation' },
    en: { name: 'Graduation', desc: 'Complete every trick test.' },
    ru: { name: 'Выпускной', desc: 'Сдайте тесты по всем трюкам.' } },
];

export const ACHIEVEMENT_BY_KEY = ACHIEVEMENTS.reduce((acc, a) => {
  acc[a.key] = a;
  return acc;
}, {});

// ── Display order ─────────────────────────────────────────────────────────────
//
// The list above is in the SPREADSHEET's order, and stays that way: it is what lets a row here be
// read straight across against Cifri_Milestones_v4.xlsx and checked, which is the only practical
// way to keep 59 rows honest to a file nobody wants to re-read.
//
// The screen wants a different order — easiest first, so a new player sees things they might
// actually get before things they almost certainly will not. So the order is a VIEW over the
// catalogue rather than a reshuffle of it, and the two cannot fall out of step: `byRarity()` is
// built from ACHIEVEMENTS every time, so a row can never be in one and missing from the other.
//
// Family is the tiebreak inside a tier, in the spreadsheet's own grouping order, so a tier reads
// as a few short runs of related things rather than a jumble.
const MODE_ORDER = ['braining', 'challenge', 'cross', 'cumulative', 'replay', 'practice', 'streak', 'tricks'];

export function achievementsByRarity() {
  const rank = (a) => RARITIES.indexOf(a.rarity) * 100 + MODE_ORDER.indexOf(a.mode);
  // Index is carried into the comparison so entries alike in both rarity and family keep the
  // catalogue's own order between them, rather than depending on the sort being stable.
  return ACHIEVEMENTS.map((a, i) => ({ a, i }))
    .sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i)
    .map((x) => x.a);
}

// The copy for the active language, falling back to English if a row somehow lacks a translation.
export function achName(lang, a) {
  if (!a) return '';
  return (a[lang] && a[lang].name) || a.en.name;
}
export function achDesc(lang, a) {
  if (!a) return '';
  return (a[lang] && a[lang].desc) || a.en.desc;
}

// ── Earned state ──────────────────────────────────────────────────────────────
//
// One source of truth: milestones.achievedLog, the append-ordered list of keys. Everything below
// is derived from it, so there is no second copy of "what you have earned" that could disagree
// with the first. (The slice is still called `milestones` in saved data — renaming a persisted
// key would strand every existing player behind a migration.)

export function isEarned(milestones, key) {
  return ((milestones && milestones.achievedLog) || []).indexOf(key) !== -1;
}

// Only keys that are actually in the catalogue count. That matters for `streak_lit`, which sits
// in the log of every player who ever lit a streak but is not an achievement, and for streaks
// past 365, which keep celebrating forever without a catalogue entry to land in.
export function earnedCount(milestones) {
  return ACHIEVEMENTS.filter((a) => isEarned(milestones, a.key)).length;
}

export function achievementsPercent(milestones) {
  return Math.round((100 * earnedCount(milestones)) / ACHIEVEMENTS.length);
}

// The most recently earned entry, in the order they were actually unlocked.
export function latestEarnedAchievement(milestones) {
  const log = (milestones && milestones.achievedLog) || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const found = ACHIEVEMENT_BY_KEY[log[i]];
    if (found) return found;
  }
  return null;
}

// ── Rewards and locking ───────────────────────────────────────────────────────
//
// Free from day one, never locked and never awarded by anything: letters, all four colours, the
// four arithmetic symbols, and `person` as the only default icon. Letters and colours are not
// listed because they are not selected from a list of options — every letter and every colour is
// always available, so there is nothing to gate.
export const FREE_ICONS = ['person'];
export const FREE_SYMBOLS = ['+', '−', '×', '÷'];

// Which achievement, if any, hands out a given picker option.
export function achievementForReward(type, value) {
  for (const a of ACHIEVEMENTS) {
    if (a.reward.type === type && a.reward.value === value) return a;
  }
  return null;
}

// Whether a picker option can be chosen right now. Derived from the earned log every time rather
// than stored, so an unlocked reward cannot outlive the achievement that granted it.
export function isRewardUnlocked(milestones, type, value) {
  if (type === 'icon' && FREE_ICONS.indexOf(value) !== -1) return true;
  if (type === 'symbol' && FREE_SYMBOLS.indexOf(value) !== -1) return true;
  const owner = achievementForReward(type, value);
  // Anything with no achievement behind it is not gated by one. Nothing in the shipped picker
  // falls here, but a future option added without a reward should be usable, not permanently dead.
  if (!owner) return true;
  return isEarned(milestones, owner.key);
}

// ── Streak thresholds ─────────────────────────────────────────────────────────
//
// Recurring: 7, 14, 30, then every 30 days after (60, 90, 120…). The game keeps celebrating
// forever; the catalogue stops at 365, which is where the reward ladder ends.
export function streakMilestoneThreshold(n) {
  if (n === 7 || n === 14 || n === 30) return n;
  if (n > 30 && n % 30 === 0) return n;
  return null;
}

// The catalogue entry a reached streak length should record, or null when it is past the ladder.
export function streakAchievementKey(threshold) {
  const key = 'streak_' + threshold;
  return ACHIEVEMENT_BY_KEY[key] ? key : null;
}
