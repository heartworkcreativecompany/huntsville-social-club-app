-- Clear questionnaire completion flags that only satisfied the Phase 1 test scaffold.

update public.profiles
set compatibility_completed_at = null
where compatibility_completed_at is not null
  and (
    compatibility_questionnaire is null
    or coalesce((compatibility_questionnaire->>'version')::int, 0) < 2
  );
