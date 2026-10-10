\set ON_ERROR_STOP on
-- Part 34: the phone gallery. Saving pictures, the gallery belongs to you (newest first), only
-- your own files, the oldest go when it's full, deleting, the hourly limit, and privacy.
\ir ../034_phone_photos.sql
\o /dev/null

create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
create function pg_temp.fails(what text, p_code text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'should fail: %', what;
exception when others then
  if sqlerrm like 'should fail%' then raise; end if;
  if sqlerrm not like p_code || '%' then raise exception 'FAILED: % gave "%" (expected %)', what, sqlerrm, p_code; end if;
  raise notice 'ok %: %', what, sqlerrm;
end $$;

-- Running part 34 again changes nothing.
\ir ../034_phone_photos.sql
\o /dev/null

insert into auth.users (email) values ('snap1@phone.test'), ('snap2@phone.test');

do $$
declare
  u uuid := pg_temp.uid('snap1@phone.test');
  w uuid := pg_temp.uid('snap2@phone.test');
  v jsonb;
  first_id bigint;
begin
  perform pg_temp.check(not has_table_privilege('authenticated', 'public.phone_photos', 'select')
                        and not has_function_privilege('authenticated', 'public.phone_photo_add(uuid,text,text,text,text,int,int)', 'execute')
                        and not has_function_privilege('anon', 'public.phone_photos_list(uuid,int,bigint)', 'execute')
                        and has_function_privilege('service_role', 'public.phone_photo_delete(uuid,bigint)', 'execute'), 'galleries are server-only');

  v := phone_photo_add(u, u || '/1700000000000-abc123.jpg', 'selfie', ' Grand Bank ', 'Lagos Bay', 1080, 1440);
  first_id := (v->'photo'->>'id')::bigint;
  perform pg_temp.check(v->'photo'->>'kind' = 'selfie' and v->'photo'->>'place' = 'Grand Bank' and v->'photo'->>'city' = 'Lagos Bay'
                        and jsonb_array_length(v->'removed') = 0, 'a selfie is saved with where it was taken');
  v := phone_photo_add(u, u || '/1700000000001-def456.jpg', 'weird', null, null, 1080, 1440);
  perform pg_temp.check(v->'photo'->>'kind' = 'photo', 'anything else is a plain photo');
  perform pg_temp.fails('only into your own folder', 'bad_path', format('select phone_photo_add(%L, %L, null, null, null, 1, 1)', u, w || '/1700000000002-x.jpg'));
  perform pg_temp.fails('only pictures', 'bad_path', format('select phone_photo_add(%L, %L, null, null, null, 1, 1)', u, u || '/../x.jpg'));
  perform pg_temp.fails('only players', 'unknown_player', format('select phone_photo_add(%L, %L, null, null, null, 1, 1)', gen_random_uuid(), 'x'));

  perform pg_temp.check((select array_agg(id order by created_at desc, id desc) from phone_photos_list(u)) =
                        (select array_agg(id order by id desc) from phone_photos where user_id = u), 'the gallery shows newest first');
  perform pg_temp.check(not exists (select 1 from phone_photos_list(w)), 'someone else''s gallery is empty');
  perform pg_temp.check(phone_photo_delete(w, first_id) is null and exists (select 1 from phone_photos where id = first_id),
                        'nobody else can delete your pictures');
  perform pg_temp.check(phone_photo_delete(u, first_id) = u || '/1700000000000-abc123.jpg', 'deleting gives back the file to remove');
  perform pg_temp.check(not exists (select 1 from phone_photos where id = first_id), 'and the picture is gone');

  -- Full: the oldest go.
  update game_settings set value = 3 where key = 'phone_gallery_max';
  perform phone_photo_add(u, u || '/1700000000003-a.jpg', 'photo', null, null, 1, 1);
  perform phone_photo_add(u, u || '/1700000000004-b.jpg', 'photo', null, null, 1, 1);
  v := phone_photo_add(u, u || '/1700000000005-c.jpg', 'photo', null, null, 1, 1);
  perform pg_temp.check(v->'removed' = jsonb_build_array(u || '/1700000000001-def456.jpg')
                        and (select count(*) from phone_photos where user_id = u) = 3, 'a full gallery lets the oldest picture go');

  -- Not too many in an hour.
  update game_settings set value = 3 where key = 'phone_photos_per_hour';
  perform pg_temp.fails('only so many an hour', 'too_many', format('select phone_photo_add(%L, %L, null, null, null, 1, 1)', u, u || '/1700000000006-d.jpg'));
  update profiles set frozen = true where id = w;
  perform pg_temp.fails('a paused account can''t save', 'frozen', format('select phone_photo_add(%L, %L, null, null, null, 1, 1)', w, w || '/1700000000007-e.jpg'));
  update profiles set frozen = false where id = w;
end $$;
update game_settings set value = 300 where key = 'phone_gallery_max';
update game_settings set value = 120 where key = 'phone_photos_per_hour';

\o
select 'phone: all checks passed' as result;
