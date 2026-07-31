-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — widen the question_attempts metadata bounds.
--
-- 0003 capped `digits` at 6, which was guesswork. Measuring the real generators
-- afterwards found the Practice tab at its maximum settings (4-digit operands, ÷)
-- legitimately produces questions like "10,813,890 ÷ 3,270" — an 8-digit operand.
--
-- That matters more than it looks. A CHECK constraint does not clamp a value, it
-- rejects the whole INSERT — so the original bound would have thrown away every
-- attempt in any batch containing a large Practice question, silently, forever.
-- Attempt data cannot be reconstructed later, so a bound that is too tight is a
-- data-loss bug rather than a tidiness one.
--
-- These columns are descriptive metadata, not a safety boundary — nothing is
-- protected by keeping them narrow. The bounds are kept only to catch obvious
-- nonsense, and are now set well clear of anything the generators can produce.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.question_attempts drop constraint if exists question_attempts_digits_check;
alter table public.question_attempts drop constraint if exists question_attempts_terms_check;

alter table public.question_attempts
  add constraint question_attempts_digits_check check (digits between 1 and 15);

alter table public.question_attempts
  add constraint question_attempts_terms_check check (terms between 1 and 12);
