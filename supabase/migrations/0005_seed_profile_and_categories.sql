-- This app has exactly one profile row, shared by both of you on one phone
-- (see api/_lib/supabase.ts's getProfileId — it fetches whichever single
-- row exists). Creates it if one doesn't already exist yet, then re-runs
-- the category seed from 0005 against it.
insert into profiles (id)
select gen_random_uuid()
where not exists (select 1 from profiles);

insert into settings (profile_id)
select id from profiles
on conflict (profile_id) do nothing;

insert into categories (id, profile_id, label, sort_order, source)
select cat.id, p.id, cat.label, cat.sort_order, 'seed'
from profiles p
cross join (
  values
    ('food', 'Food', 1),
    ('home', 'Home', 2),
    ('personal', 'Personal', 3),
    ('kids', 'Kids', 4),
    ('transportation', 'Transportation', 5),
    ('entertainment', 'Entertainment', 6),
    ('miscellaneous', 'Miscellaneous', 7)
) as cat(id, label, sort_order)
on conflict (profile_id, id) do nothing;
