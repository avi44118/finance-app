-- Server-side lookup for categorize.ts's matching chain: exact merchant_key
-- hit first (score 1.0), else the closest pg_trgm-fuzzy hit above the
-- threshold. Living in SQL (not two round-trips from Node) keeps the
-- fuzzy-match cheap by using the gin_trgm index from 0003 directly.
create or replace function find_merchant_category(
  p_profile_id uuid,
  p_merchant_key text,
  p_similarity_threshold real default 0.6
)
returns table (category_id text, match_type text, score real)
language sql
stable
as $$
  with candidates as (
    select category_id, 'exact'::text as match_type, 1.0::real as score
    from merchant_category_rules
    where profile_id = p_profile_id and merchant_key = p_merchant_key
    union all
    select category_id, 'fuzzy'::text as match_type, similarity(merchant_key, p_merchant_key) as score
    from merchant_category_rules
    where profile_id = p_profile_id
      and merchant_key <> p_merchant_key
      and similarity(merchant_key, p_merchant_key) > p_similarity_threshold
  )
  -- exact (score 1.0) always outranks any fuzzy hit
  select category_id, match_type, score
  from candidates
  order by score desc
  limit 1;
$$;
