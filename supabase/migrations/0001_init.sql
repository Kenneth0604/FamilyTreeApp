-- ============================================================================
-- FamilyTreeApp — 初始化 Schema
-- 在 Supabase Dashboard → SQL Editor 直接執行整份檔案(可重複執行)。
--
-- 資料模型:
--   families        家族群組
--   family_codes    每個家族兩種邀請碼:invite_code 加入後可編輯、view_code 加入後只能查看(只有 editor 讀得到)
--   family_members  「某個登入帳號在某個家族中的身分」(role editor / viewer、self / viewpoint / 進階模式)
--   people          家族樹上的每一個人(大多數沒有帳號;nicknames 小名、tags 自訂標籤、birth_order 排行、stats 遊戲式屬性分數、power 戰力 / 家庭地位)
--   person_entries  生平紀事:每人多筆履歷式條列(職業 / 學歷 / 事蹟 / 健康疾病 / 居住地 / 榮譽 / 其他),含起迄時間
--   pets            寵物(名字、品種、主人、評分)
--   households      小家庭:一群人的 id 陣列 + 名稱 / 顏色,樹狀圖用虛線圈起來
--   families.kind   normal / merged;合併家族樹見檔案後半「合併家族樹」段(family_merge_sources / family_links / family_link_invites)
--   parent_child    親子邊(有方向)
--   spouses         配偶 / 伴侶邊(無方向;married / widowed / partner 未婚伴侶 / divorced / ex_partner 前伴侶)
-- 兄弟姊妹、叔伯、堂表…全部由前端的稱謂引擎以最短路徑推算,不另外儲存。
--
-- RLS:所有表都以「family_id 是否在該使用者所屬的 family_members 中」判斷讀取;寫入另需 role = editor。
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 資料表
-- ----------------------------------------------------------------------------
create table if not exists public.families (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  created_at   timestamptz not null default now()
);

-- 邀請碼獨立成表,RLS 只讓 editor 讀(viewer 若讀得到編輯邀請碼就能自行升級)
drop function if exists public.family_codes(uuid); -- 舊版曾用同名 RPC
create table if not exists public.family_codes (
  family_id    uuid primary key references public.families(id) on delete cascade,
  invite_code  text not null unique,   -- 加入後可編輯
  view_code    text not null unique    -- 加入後只能查看
);

create table if not exists public.family_members (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null references public.families(id) on delete cascade,
  auth_user_id         uuid not null references auth.users(id) on delete cascade,
  display_name         text not null,
  role                 text not null default 'editor' check (role in ('editor', 'viewer')),
  self_person_id       uuid,            -- FK 在 people 建好後補上
  viewpoint_person_id  uuid,
  advanced_terms       boolean not null default false,
  joined_at            timestamptz not null default now(),
  unique (family_id, auth_user_id)
);
alter table public.family_members add column if not exists role text not null default 'editor';
alter table public.family_members drop constraint if exists family_members_role_check;
alter table public.family_members add constraint family_members_role_check check (role in ('editor', 'viewer'));

create table if not exists public.people (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  gender       text not null default 'unspecified' check (gender in ('male', 'female', 'unspecified')),
  -- 允許 'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD' 或 null
  birth_date   text check (birth_date is null or birth_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  is_deceased  boolean not null default false,
  avatar_url   text,
  note         text not null default '',
  created_by   uuid references public.family_members(id) on delete set null,
  updated_by   uuid references public.family_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 逝世日期(格式同 birth_date):有生日 + 逝世日就顯示「享壽 N 歲」,壽命也算進戰力
alter table public.people add column if not exists death_date text;
alter table public.people drop constraint if exists people_death_date_check;
alter table public.people add constraint people_death_date_check check (death_date is null or death_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$');
-- 冠夫姓:例如本名 陳美玲、冠夫姓 王 → 顯示「王陳美玲」;name 一律存本名
alter table public.people add column if not exists married_surname text;
alter table public.people drop constraint if exists people_married_surname_check;
alter table public.people add constraint people_married_surname_check check (married_surname is null or length(married_surname) <= 10);
-- 不確定日期時可只填大概歲數:'85'、'80-90'、'80多'(前端解析,這裡只限長度)
alter table public.people add column if not exists death_age text;
alter table public.people drop constraint if exists people_death_age_check;
alter table public.people add constraint people_death_age_check check (death_age is null or length(death_age) <= 20);

alter table public.family_members
  drop constraint if exists family_members_self_person_id_fkey,
  drop constraint if exists family_members_viewpoint_person_id_fkey;
alter table public.family_members
  add constraint family_members_self_person_id_fkey
    foreign key (self_person_id) references public.people(id) on delete set null,
  add constraint family_members_viewpoint_person_id_fkey
    foreign key (viewpoint_person_id) references public.people(id) on delete set null;

create table if not exists public.parent_child (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  parent_id   uuid not null references public.people(id) on delete cascade,
  child_id    uuid not null references public.people(id) on delete cascade,
  created_by  uuid references public.family_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (parent_id, child_id),
  check (parent_id <> child_id)
);

create table if not exists public.spouses (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  person_a_id  uuid not null references public.people(id) on delete cascade,
  person_b_id  uuid not null references public.people(id) on delete cascade,
  status       text not null default 'married' check (status in ('married', 'widowed', 'partner', 'divorced', 'ex_partner')),
  created_by   uuid references public.family_members(id) on delete set null,
  updated_by   uuid references public.family_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (person_a_id <> person_b_id)
);
-- 既有資料庫補上新的關係狀態(partner 未婚伴侶 / ex_partner 前伴侶)
alter table public.spouses drop constraint if exists spouses_status_check;
alter table public.spouses add constraint spouses_status_check check (status in ('married', 'widowed', 'partner', 'divorced', 'ex_partner'));
-- 同一對人只能有一筆配偶紀錄(不論 a / b 順序)
create unique index if not exists spouses_pair_unique
  on public.spouses (least(person_a_id, person_b_id), greatest(person_a_id, person_b_id));

-- 小名 / 別名(可多個),顯示在姓名旁
alter table public.people add column if not exists nicknames text[] not null default '{}';
-- 自訂標籤(例如 ADHD、左撇子)
alter table public.people add column if not exists tags text[] not null default '{}';
-- 遊戲角色式屬性:{ 屬性 id: 0..10 },沒評的不放
alter table public.people add column if not exists stats jsonb not null default '{}'::jsonb;
-- 政治立場:blue / green / white,null = 不標示
alter table public.people add column if not exists politics text check (politics is null or politics in ('blue', 'green', 'white'));
-- 兄弟姊妹排行(1 = 老大);不知道實際年齡時用來判斷長幼
alter table public.people add column if not exists birth_order smallint check (birth_order is null or birth_order between 1 and 99);
-- 戰力(家庭地位)0..10,預設 5;數字越大樹狀圖卡片越大
alter table public.people add column if not exists power smallint not null default 5 check (power between 0 and 10);

-- 生平紀事:履歷式條列。每人依類別(職業 / 學歷 / 事蹟 / 居住地 / 榮譽 / 其他)列出多筆,每筆可填起迄時間
create table if not exists public.person_entries (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  person_id   uuid not null references public.people(id) on delete cascade,
  category    text not null check (category in ('career', 'education', 'event', 'health', 'residence', 'award', 'other')),
  title       text not null check (length(trim(title)) > 0),
  detail      text not null default '',
  -- 與 birth_date 相同:'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD' 或 null
  start_date  text check (start_date is null or start_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  end_date    text check (end_date is null or end_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  ongoing     boolean not null default false,   -- 至今
  sort_order  int not null default 0,
  created_by  uuid references public.family_members(id) on delete set null,
  updated_by  uuid references public.family_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 既有資料庫補上新的類別(health 健康 / 疾病)
alter table public.person_entries drop constraint if exists person_entries_category_check;
alter table public.person_entries add constraint person_entries_category_check check (category in ('career', 'education', 'event', 'health', 'residence', 'award', 'other'));
create index if not exists person_entries_family_idx on public.person_entries(family_id);
create index if not exists person_entries_person_idx on public.person_entries(person_id);

-- 寵物:名字、品種、主人(可不指定)、生日、照片、遊戲式評分
create table if not exists public.pets (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  owner_person_id  uuid references public.people(id) on delete set null,
  name             text not null check (length(trim(name)) > 0),
  species          text not null default 'other' check (species in ('dog', 'cat', 'rabbit', 'bird', 'fish', 'hamster', 'turtle', 'reptile', 'other')),
  breed            text not null default '',
  gender           text not null default 'unspecified' check (gender in ('male', 'female', 'unspecified')),
  birth_date       text check (birth_date is null or birth_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  is_deceased      boolean not null default false,
  avatar_url       text,
  note             text not null default '',
  stats            jsonb not null default '{}'::jsonb,
  created_by       uuid references public.family_members(id) on delete set null,
  updated_by       uuid references public.family_members(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists pets_family_idx on public.pets(family_id);
create index if not exists pets_owner_idx  on public.pets(owner_person_id);

-- 小家庭:圈選一群同住 / 同一戶的人,樹狀圖用虛線框起來
create table if not exists public.households (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  color        text not null default 'primary',
  person_ids   uuid[] not null default '{}',
  created_by   uuid references public.family_members(id) on delete set null,
  updated_by   uuid references public.family_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists households_family_idx on public.households(family_id);

create index if not exists people_family_idx        on public.people(family_id);
create index if not exists parent_child_family_idx  on public.parent_child(family_id);
create index if not exists parent_child_child_idx   on public.parent_child(child_id);
create index if not exists spouses_family_idx       on public.spouses(family_id);
create index if not exists family_members_user_idx  on public.family_members(auth_user_id);

-- ----------------------------------------------------------------------------
-- updated_at 觸發器
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists people_touch on public.people;
create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();

drop trigger if exists spouses_touch on public.spouses;
create trigger spouses_touch before update on public.spouses
  for each row execute function public.touch_updated_at();

drop trigger if exists person_entries_touch on public.person_entries;
create trigger person_entries_touch before update on public.person_entries
  for each row execute function public.touch_updated_at();

drop trigger if exists pets_touch on public.pets;
create trigger pets_touch before update on public.pets
  for each row execute function public.touch_updated_at();

drop trigger if exists households_touch on public.households;
create trigger households_touch before update on public.households
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 權限輔助函式(security definer 以避免 family_members 的 RLS 自我遞迴)
-- ----------------------------------------------------------------------------
create or replace function public.is_family_member(p_family_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = p_family_id and m.auth_user_id = auth.uid()
  );
$$;
grant execute on function public.is_family_member(uuid) to authenticated;

-- 可編輯的成員(role = editor);viewer 只能讀
create or replace function public.is_family_editor(p_family_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = p_family_id and m.auth_user_id = auth.uid() and m.role = 'editor'
  );
$$;
grant execute on function public.is_family_editor(uuid) to authenticated;

-- 6 碼邀請碼(去掉容易混淆的 0/O/1/I)
create or replace function public.gen_invite_code()
returns text language plpgsql volatile as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out   text := '';
  i     int;
begin
  for i in 1..6 loop
    out := out || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return out;
end $$;

-- 產生一個兩種邀請碼都沒用過的新碼
create or replace function public.gen_unique_family_code()
returns text language plpgsql volatile as $$
declare
  code text;
begin
  loop
    code := public.gen_invite_code();
    exit when not exists (select 1 from public.family_codes where invite_code = code or view_code = code);
  end loop;
  return code;
end $$;

-- 舊版把邀請碼放在 families 欄位:搬進 family_codes 後移除欄位
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'families' and column_name = 'invite_code') then
    insert into public.family_codes (family_id, invite_code, view_code)
      select id, invite_code, public.gen_unique_family_code() from public.families
      on conflict (family_id) do nothing;
    alter table public.families drop column invite_code;
  end if;
  alter table public.families drop column if exists view_code;
end $$;
-- 尚無邀請碼的家族補上
insert into public.family_codes (family_id, invite_code, view_code)
  select id, public.gen_unique_family_code(), public.gen_unique_family_code() from public.families
  on conflict (family_id) do nothing;
-- 舊版曾把 families 的欄位讀取權限收掉,還原成整表可讀(RLS 仍限制只有成員看得到)
grant select on public.families to anon, authenticated;

-- ----------------------------------------------------------------------------
-- RPC:建立家族 / 用邀請碼加入 / 重新產生邀請碼
-- ----------------------------------------------------------------------------
create or replace function public.create_family(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  fid  uuid;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception '請輸入家族名稱'; end if;
  insert into public.families (name) values (trim(p_name)) returning id into fid;
  insert into public.family_codes (family_id, invite_code, view_code)
    values (fid, public.gen_unique_family_code(), public.gen_unique_family_code());
  insert into public.family_members (family_id, auth_user_id, display_name, role)
    values (fid, auth.uid(), coalesce(nullif(trim(p_display_name), ''), '成員'), 'editor');
  return fid;
end $$;
grant execute on function public.create_family(text, text) to authenticated;

-- 一個入口吃兩種邀請碼:編輯邀請碼 → editor(原本是 viewer 的會升級);查看邀請碼 → viewer(已是成員的不會被降級)
drop function if exists public.join_family(text, text);          -- 參數改名,create or replace 不允許
drop function if exists public.join_family_as_viewer(text, text); -- 舊版
create or replace function public.join_family(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c    text := upper(trim(p_code));
  fid  uuid;
  nm   text := coalesce(nullif(trim(p_display_name), ''), '成員');
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select family_id into fid from public.family_codes where invite_code = c;
  if fid is not null then
    insert into public.family_members (family_id, auth_user_id, display_name, role)
      values (fid, auth.uid(), nm, 'editor')
      on conflict (family_id, auth_user_id) do update set role = 'editor';
    return fid;
  end if;
  select family_id into fid from public.family_codes where view_code = c;
  if fid is not null then
    insert into public.family_members (family_id, auth_user_id, display_name, role)
      values (fid, auth.uid(), nm, 'viewer')
      on conflict (family_id, auth_user_id) do nothing;
    return fid;
  end if;
  raise exception '找不到這個邀請碼';
end $$;
grant execute on function public.join_family(text, text) to authenticated;

create or replace function public.regenerate_invite_code(p_family_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  if not public.is_family_editor(p_family_id) then raise exception '只有可編輯的成員才能重新產生邀請碼'; end if;
  code := public.gen_unique_family_code();
  update public.family_codes set invite_code = code where family_id = p_family_id;
  return code;
end $$;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;

create or replace function public.regenerate_view_code(p_family_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  if not public.is_family_editor(p_family_id) then raise exception '只有可編輯的成員才能重新產生邀請碼'; end if;
  code := public.gen_unique_family_code();
  update public.family_codes set view_code = code where family_id = p_family_id;
  return code;
end $$;
grant execute on function public.regenerate_view_code(uuid) to authenticated;

-- ============================================================================
-- 合併家族樹
-- 兩個獨立家族用「連結碼」把各自一個人連起來(配偶或親子),系統建立一個 kind = 'merged' 的新家族。
-- 合併樹底下沒有任何 people / parent_child / spouses 資料列:讀取時由 get_merged_tree 把兩個來源家族的資料
-- 加上橋接關係一次拼好回傳;兩邊所有成員都是合併樹的 viewer(唯讀),要編輯回原本的家族。
-- 解除合併只刪掉合併樹這一列(cascade 清掉 family_merge_sources / family_links / 它的 family_members),
-- 來源家族完全不受影響。
-- 合併樹可以再合併:合併樹 ⊕ 一般家族 → 把該家族加進這棵合併樹的來源;合併樹 ⊕ 合併樹 → 把對方的來源與橋接
-- 全部併進「輸入碼的那一棵」,對方那棵刪掉。所以合併樹永遠是「扁平的多來源」,沒有巢狀。
-- 刻意不動 is_family_member / is_family_editor 與既有 RLS:跨家族讀取全部收斂在 get_merged_tree 這一個 security definer 函式;
-- 合併樹的「可管理」(產生連結碼、再合併、確認同一人、解除)= 任一來源家族的 editor,見 can_manage_family。
-- ============================================================================
alter table public.families add column if not exists kind text not null default 'normal';
alter table public.families drop constraint if exists families_kind_check;
alter table public.families add constraint families_kind_check check (kind in ('normal', 'merged'));

-- 一個合併家族由哪些來源家族組成(兩個以上;再合併就是往這裡加來源)
create table if not exists public.family_merge_sources (
  merged_family_id  uuid not null references public.families(id) on delete cascade,
  source_family_id  uuid not null references public.families(id) on delete cascade,
  primary key (merged_family_id, source_family_id),
  check (merged_family_id <> source_family_id)
);
-- 注意:來源家族整個被刪除時 cascade 只會刪掉這裡的一列,合併樹會剩單邊(app 目前沒有刪除家族的功能)

-- 橋接關係:person_a 永遠是產生連結碼那一方的人,person_b 是輸入連結碼那一方的人
create table if not exists public.family_links (
  id                uuid primary key default gen_random_uuid(),
  merged_family_id  uuid not null references public.families(id) on delete cascade,
  person_a_id       uuid not null references public.people(id) on delete cascade,
  person_b_id       uuid not null references public.people(id) on delete cascade,
  relation          text not null check (relation in ('spouse', 'parent_child')),
  status            text check (status is null or status in ('married', 'widowed', 'partner', 'divorced', 'ex_partner')), -- relation = spouse 時填
  parent_side       text check (parent_side is null or parent_side in ('a', 'b')),                                         -- relation = parent_child 時填:誰是父母
  created_by        uuid references public.family_members(id) on delete set null,
  created_at        timestamptz not null default now(),
  check (person_a_id <> person_b_id)
);
create index if not exists family_links_merged_idx on public.family_links(merged_family_id);
-- same_person:兩邊其實是同一個人(合併樹讀取時把 b 併進 a);not_same_person:確認過不是,同名提示不要再跳
alter table public.family_links drop constraint if exists family_links_relation_check;
alter table public.family_links add constraint family_links_relation_check check (relation in ('spouse', 'parent_child', 'same_person', 'not_same_person'));

-- 連結碼(一次性):記錄「我這邊哪個人、要建立什麼關係」,等對方輸入碼來合併
create table if not exists public.family_link_invites (
  code        text primary key,
  family_id   uuid not null references public.families(id) on delete cascade,
  person_id   uuid not null references public.people(id) on delete cascade,
  relation    text not null check (relation in ('spouse', 'parent_child')),
  status      text check (status is null or status in ('married', 'widowed', 'partner', 'divorced', 'ex_partner')),
  is_parent   boolean, -- relation = parent_child 時填:true = 我提供的這個人是父母,false = 是小孩
  created_by  uuid references public.family_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz -- null = 尚未使用;合併或撤銷後填上
);
create index if not exists family_link_invites_family_idx on public.family_link_invites(family_id);

-- 誰能管理一個家族的合併事務:一般家族 = 它的 editor;合併樹 = 任一來源家族的 editor(合併樹本身的成員都只是 viewer)
create or replace function public.can_manage_family(p_family_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when (select kind from public.families where id = p_family_id) = 'merged'
      then exists (select 1 from public.family_merge_sources s where s.merged_family_id = p_family_id and public.is_family_editor(s.source_family_id))
    else public.is_family_editor(p_family_id)
  end
$$;
grant execute on function public.can_manage_family(uuid) to authenticated;

-- 一個家族實際涵蓋的資料來源:一般家族是自己;合併樹是它登記的來源家族
create or replace function public.family_source_ids(p_family_id uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select case
    when (select kind from public.families where id = p_family_id) = 'merged'
      then coalesce((select array_agg(source_family_id) from public.family_merge_sources where merged_family_id = p_family_id), '{}'::uuid[])
    else array[p_family_id]
  end
$$;
grant execute on function public.family_source_ids(uuid) to authenticated;

-- 連結碼不能跟任何邀請碼或其他連結碼撞號
create or replace function public.gen_unique_link_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  c text; -- 不叫 code:會跟 family_link_invites.code 欄位撞名(plpgsql 預設 variable_conflict = error)
begin
  loop
    c := public.gen_invite_code();
    exit when not exists (select 1 from public.family_codes where invite_code = c or view_code = c)
         and not exists (select 1 from public.family_link_invites i where i.code = c);
  end loop;
  return c;
end $$;
revoke execute on function public.gen_unique_link_code() from anon, authenticated;

create or replace function public.create_family_link_code(p_family_id uuid, p_person_id uuid, p_relation text, p_status text default null, p_is_parent boolean default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  new_code text;
  mid      uuid;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if not public.can_manage_family(p_family_id) then raise exception '只有可編輯的成員才能產生連結碼'; end if;
  -- 合併樹也能產生:人可以是任一來源家族的人
  if not exists (select 1 from public.people where id = p_person_id and family_id = any(public.family_source_ids(p_family_id))) then raise exception '這個人不在你的家族裡'; end if;
  if p_relation not in ('spouse', 'parent_child') then raise exception '關係類型錯誤'; end if;
  if p_relation = 'spouse' and coalesce(p_status, '') not in ('married', 'widowed', 'partner', 'divorced', 'ex_partner') then raise exception '請選擇配偶關係狀態'; end if;
  if p_relation = 'parent_child' and p_is_parent is null then raise exception '請指定這個人是父母還是小孩'; end if;
  select id into mid from public.family_members where family_id = p_family_id and auth_user_id = auth.uid();
  new_code := public.gen_unique_link_code();
  insert into public.family_link_invites (code, family_id, person_id, relation, status, is_parent, created_by)
    values (new_code, p_family_id, p_person_id, p_relation,
            case when p_relation = 'spouse' then p_status end,
            case when p_relation = 'parent_child' then p_is_parent end,
            mid);
  return new_code;
end $$;
grant execute on function public.create_family_link_code(uuid, uuid, text, text, boolean) to authenticated;

-- 合併前先看看這個碼對面是誰、什麼關係(碼本身就是秘密,拿到碼的人看到一個名字是合理的)
create or replace function public.peek_family_link_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select jsonb_build_object('family_id', f.id, 'family_name', f.name, 'person_name', p.name, 'person_gender', p.gender,
                            'relation', i.relation, 'status', i.status, 'is_parent', i.is_parent)
    into result
    from public.family_link_invites i
    join public.families f on f.id = i.family_id
    join public.people p on p.id = i.person_id
   where i.code = upper(trim(p_code)) and i.used_at is null;
  if result is null then raise exception '找不到這個連結碼或已經被使用過'; end if;
  return result;
end $$;
grant execute on function public.peek_family_link_code(text) to authenticated;

-- 合併:
--   一般 ⊕ 一般     → 建一棵新的合併樹(兩個來源)
--   合併樹 ⊕ 一般   → 把一般家族加進合併樹的來源(不管哪一邊拿碼)
--   合併樹 ⊕ 合併樹 → 把「產生碼那一棵」的來源與橋接全部併進「輸入碼這一棵」,再刪掉前者
-- 回傳結果所在的合併樹 id(可能就是 p_family_id 本身)
create or replace function public.merge_family_with_code(p_code text, p_family_id uuid, p_person_id uuid, p_merged_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv        public.family_link_invites%rowtype;
  other_name text;
  my_name    text;
  a_kind     text;
  b_kind     text;
  a_src      uuid[];
  b_src      uuid[];
  target     uuid;
  absorbed   uuid;
  my_member  uuid;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if not public.can_manage_family(p_family_id) then raise exception '只有可編輯的成員才能合併家族'; end if;
  select kind into b_kind from public.families where id = p_family_id;
  b_src := public.family_source_ids(p_family_id);
  if not exists (select 1 from public.people where id = p_person_id and family_id = any(b_src)) then raise exception '這個人不在你的家族裡'; end if;

  select * into inv from public.family_link_invites where code = upper(trim(p_code)) and used_at is null;
  if inv.code is null then raise exception '找不到這個連結碼或已經被使用過'; end if;
  if inv.family_id = p_family_id then raise exception '不能跟自己的家族合併'; end if;
  select kind into a_kind from public.families where id = inv.family_id;
  a_src := public.family_source_ids(inv.family_id);
  if not exists (select 1 from public.people where id = inv.person_id and family_id = any(a_src)) then raise exception '對方指定的人已不在他們的家族裡'; end if;
  if a_src && b_src then raise exception '這兩邊已經合併在一起了(有共同的來源家族)'; end if;
  if a_kind = 'normal' and b_kind = 'normal' and exists (
    select 1 from public.family_merge_sources s1
    join public.family_merge_sources s2 on s2.merged_family_id = s1.merged_family_id
    where s1.source_family_id = inv.family_id and s2.source_family_id = p_family_id
  ) then raise exception '這兩個家族已經合併過了'; end if;

  select name into other_name from public.families where id = inv.family_id;
  select name into my_name from public.families where id = p_family_id;
  if a_kind = 'normal' and b_kind = 'normal' then
    insert into public.families (name, kind)
      values (coalesce(nullif(trim(p_merged_name), ''), other_name || ' × ' || my_name), 'merged')
      returning id into target;
    insert into public.family_merge_sources (merged_family_id, source_family_id) values (target, inv.family_id), (target, p_family_id);
  elsif b_kind = 'merged' then
    -- 我這棵合併樹吃下對方(一般家族,或另一棵合併樹的所有來源)
    target := p_family_id;
    insert into public.family_merge_sources (merged_family_id, source_family_id) select target, unnest(a_src) on conflict do nothing;
    if a_kind = 'merged' then absorbed := inv.family_id; end if;
    if nullif(trim(p_merged_name), '') is not null then update public.families set name = trim(p_merged_name) where id = target; end if;
  else
    -- 對方是合併樹、我是一般家族:把我加進對方那棵
    target := inv.family_id;
    insert into public.family_merge_sources (merged_family_id, source_family_id) values (target, p_family_id) on conflict do nothing;
    if nullif(trim(p_merged_name), '') is not null then update public.families set name = trim(p_merged_name) where id = target; end if;
  end if;

  -- 被吃掉的合併樹:橋接與同一人標記搬過來,然後整棵刪掉(它的成員會在下面重新加進 target)
  if absorbed is not null then
    insert into public.family_links (merged_family_id, person_a_id, person_b_id, relation, status, parent_side, created_by)
      select target, l.person_a_id, l.person_b_id, l.relation, l.status, l.parent_side, null
        from public.family_links l where l.merged_family_id = absorbed;
    delete from public.families where id = absorbed;
  end if;

  select id into my_member from public.family_members where family_id = p_family_id and auth_user_id = auth.uid();
  insert into public.family_links (merged_family_id, person_a_id, person_b_id, relation, status, parent_side, created_by)
    values (target, inv.person_id, p_person_id, inv.relation, inv.status,
            case when inv.relation = 'parent_child' then (case when inv.is_parent then 'a' else 'b' end) end,
            my_member);

  -- 所有來源家族目前的成員都成為合併樹的 viewer(已在裡面的不動);viewpoint 留空讓他們在合併樹重選
  insert into public.family_members (family_id, auth_user_id, display_name, role, self_person_id)
    select target, m.auth_user_id, m.display_name, 'viewer', m.self_person_id
      from public.family_members m
     where m.family_id = any(a_src || b_src)
    on conflict (family_id, auth_user_id) do nothing;

  update public.family_link_invites set used_at = now() where code = inv.code;
  return target;
end $$;
grant execute on function public.merge_family_with_code(text, uuid, uuid, text) to authenticated;

create or replace function public.revoke_family_link_code(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
begin
  select family_id into fid from public.family_link_invites where code = upper(trim(p_code)) and used_at is null;
  if fid is null then raise exception '找不到這個連結碼或已經被使用過'; end if;
  if not public.can_manage_family(fid) then raise exception '只有可編輯的成員才能撤銷連結碼'; end if;
  update public.family_link_invites set used_at = now() where code = upper(trim(p_code));
end $$;
grant execute on function public.revoke_family_link_code(text) to authenticated;

create or replace function public.remove_family_merge(p_merged_family_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if (select kind from public.families where id = p_merged_family_id) is distinct from 'merged' then raise exception '這不是合併家族樹'; end if;
  if not exists (select 1 from public.family_merge_sources s where s.merged_family_id = p_merged_family_id and public.is_family_editor(s.source_family_id))
    then raise exception '只有來源家族的可編輯成員才能解除合併'; end if;
  delete from public.families where id = p_merged_family_id; -- cascade:merge_sources / links / 合併樹的 family_members
end $$;
grant execute on function public.remove_family_merge(uuid) to authenticated;

-- 標記兩個(不同)來源家族裡的兩個人是同一人(p_same = true)或確認不是(false,之後不再提示)。
-- 正規化成 person_a 屬於排序較前的來源、person_b 屬於較後的來源;前端讀取時把 b 併進 a(可以串接:c 併進 b、b 併進 a)。
-- 一個人只能被併進一個人;也不能繞成圈。
create or replace function public.link_same_person(p_merged_family_id uuid, p_person_a_id uuid, p_person_b_id uuid, p_same boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  src       uuid[];
  fa        uuid;
  fb        uuid;
  a         uuid;
  b         uuid;
  my_member uuid;
  lid       uuid;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if (select kind from public.families where id = p_merged_family_id) is distinct from 'merged' then raise exception '這不是合併家族樹'; end if;
  if not public.can_manage_family(p_merged_family_id) then raise exception '只有來源家族的可編輯成員才能確認同一人'; end if;
  select array_agg(s.source_family_id order by f.created_at, f.id) into src
    from public.family_merge_sources s join public.families f on f.id = s.source_family_id
   where s.merged_family_id = p_merged_family_id;
  select family_id into fa from public.people where id = p_person_a_id;
  select family_id into fb from public.people where id = p_person_b_id;
  if fa is null or fb is null or fa = fb or not (fa = any(src)) or not (fb = any(src)) then
    raise exception '兩個人必須分別來自這棵合併樹的不同來源家族';
  end if;
  if array_position(src, fa) < array_position(src, fb) then a := p_person_a_id; b := p_person_b_id; else a := p_person_b_id; b := p_person_a_id; end if;

  delete from public.family_links
   where merged_family_id = p_merged_family_id and relation in ('same_person', 'not_same_person')
     and ((person_a_id = a and person_b_id = b) or (person_a_id = b and person_b_id = a));
  if p_same then
    if exists (select 1 from public.family_links where merged_family_id = p_merged_family_id and relation = 'same_person' and person_b_id = b)
      then raise exception '其中一人已經被併進另一個人,請先取消那筆'; end if;
    -- 從 a 沿「被併進誰」一路走,不能走回 b,否則繞成一圈
    if exists (
      with recursive chain as (
        select a as id
        union
        select l.person_a_id from public.family_links l join chain c on l.person_b_id = c.id
         where l.merged_family_id = p_merged_family_id and l.relation = 'same_person'
      ) select 1 from chain where id = b
    ) then raise exception '這樣會繞成一圈(對方已經直接或間接被併進這個人)'; end if;
  end if;

  select id into my_member from public.family_members where auth_user_id = auth.uid() and family_id = any(src) limit 1;
  insert into public.family_links (merged_family_id, person_a_id, person_b_id, relation, created_by)
    values (p_merged_family_id, a, b, case when p_same then 'same_person' else 'not_same_person' end, my_member)
    returning id into lid;
  return lid;
end $$;
grant execute on function public.link_same_person(uuid, uuid, uuid, boolean) to authenticated;

create or replace function public.unlink_same_person(p_link_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select merged_family_id into mid from public.family_links where id = p_link_id and relation in ('same_person', 'not_same_person');
  if mid is null then raise exception '找不到這筆標記'; end if;
  if not public.can_manage_family(mid) then raise exception '只有來源家族的可編輯成員才能取消標記'; end if;
  delete from public.family_links where id = p_link_id;
end $$;
grant execute on function public.unlink_same_person(uuid) to authenticated;

-- 合併樹的全部資料一次拼好:所有來源家族的人物 / 關係 / 紀事 / 寵物 / 小家庭 + 橋接關係(含同一人標記)。
-- 唯一的跨家族讀取入口;只回傳 family_merge_sources 裡登記的來源。
create or replace function public.get_merged_tree(p_merged_family_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  src uuid[];
begin
  if not public.is_family_member(p_merged_family_id) then raise exception '你不是這個家族的成員'; end if;
  select array_agg(source_family_id) into src from public.family_merge_sources where merged_family_id = p_merged_family_id;
  if src is null then raise exception '這不是合併家族樹'; end if;
  return jsonb_build_object(
    'source_families', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.created_at, f.id) from public.families f where f.id = any(src)), '[]'::jsonb),
    'people',          coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.people x where x.family_id = any(src)), '[]'::jsonb),
    'parent_child',    coalesce((select jsonb_agg(to_jsonb(x)) from public.parent_child x where x.family_id = any(src)), '[]'::jsonb),
    'spouses',         coalesce((select jsonb_agg(to_jsonb(x)) from public.spouses x where x.family_id = any(src)), '[]'::jsonb),
    'entries',         coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.person_entries x where x.family_id = any(src)), '[]'::jsonb),
    'pets',            coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.pets x where x.family_id = any(src)), '[]'::jsonb),
    'households',      coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.households x where x.family_id = any(src)), '[]'::jsonb),
    'links',           coalesce((select jsonb_agg(to_jsonb(x)) from public.family_links x where x.merged_family_id = p_merged_family_id), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_merged_tree(uuid) to authenticated;

-- 合併之後才加入來源家族的人,也自動成為合併樹的 viewer。
-- security definer:family_members 沒有 insert policy,trigger 以呼叫者身分執行會被 RLS 擋。
-- 對合併樹自己那筆再觸發時,合併樹 id 不是任何來源 → 不會遞迴。
create or replace function public.family_members_propagate_merge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.family_members (family_id, auth_user_id, display_name, role, self_person_id)
    select s.merged_family_id, new.auth_user_id, new.display_name, 'viewer', new.self_person_id
      from public.family_merge_sources s
     where s.source_family_id = new.family_id
    on conflict (family_id, auth_user_id) do nothing;
  return new;
end $$;
drop trigger if exists family_members_propagate_merge on public.family_members;
create trigger family_members_propagate_merge after insert on public.family_members
  for each row execute function public.family_members_propagate_merge();

alter table public.family_merge_sources enable row level security;
alter table public.family_links         enable row level security;
alter table public.family_link_invites  enable row level security;
drop policy if exists "merge_sources member select" on public.family_merge_sources;
create policy "merge_sources member select" on public.family_merge_sources for select to authenticated
  using (public.is_family_member(source_family_id) or public.is_family_member(merged_family_id));
drop policy if exists "family_links member select" on public.family_links;
create policy "family_links member select" on public.family_links for select to authenticated
  using (public.is_family_member(merged_family_id));
drop policy if exists "link_invites editor select" on public.family_link_invites;
create policy "link_invites editor select" on public.family_link_invites for select to authenticated
  using (public.can_manage_family(family_id)); -- 合併樹產生的連結碼:來源家族的 editor 看得到
-- 以上三張表的寫入一律經由 RPC

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.families       enable row level security;
alter table public.family_codes   enable row level security;
alter table public.family_members enable row level security;
alter table public.people         enable row level security;
alter table public.parent_child   enable row level security;
alter table public.spouses        enable row level security;
alter table public.person_entries enable row level security;
alter table public.pets           enable row level security;
alter table public.households     enable row level security;

drop policy if exists "families member select" on public.families;
drop policy if exists "families member update" on public.families;
create policy "families member select" on public.families for select to authenticated
  using (public.is_family_member(id));
create policy "families member update" on public.families for update to authenticated
  using (public.is_family_editor(id)) with check (public.is_family_editor(id));
-- insert 一律經由 RPC(security definer)

-- 兩種邀請碼只有 editor 看得到;寫入一律經由 RPC
drop policy if exists "family_codes editor select" on public.family_codes;
create policy "family_codes editor select" on public.family_codes for select to authenticated
  using (public.is_family_editor(family_id));

drop policy if exists "members select" on public.family_members;
drop policy if exists "members update own" on public.family_members;
drop policy if exists "members delete own" on public.family_members;
create policy "members select" on public.family_members for select to authenticated
  using (auth_user_id = auth.uid() or public.is_family_member(family_id));
create policy "members update own" on public.family_members for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy "members delete own" on public.family_members for delete to authenticated
  using (auth_user_id = auth.uid());
-- insert 一律經由 create_family / join_family

-- 家族樹資料:所有成員可讀,只有 editor 可寫
do $$
declare t text;
begin
  foreach t in array array['people', 'parent_child', 'spouses', 'person_entries', 'pets', 'households'] loop
    execute format('drop policy if exists %I on public.%I', t || ' member all', t);
    execute format('drop policy if exists %I on public.%I', t || ' member select', t);
    execute format('drop policy if exists %I on public.%I', t || ' editor insert', t);
    execute format('drop policy if exists %I on public.%I', t || ' editor update', t);
    execute format('drop policy if exists %I on public.%I', t || ' editor delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_family_member(family_id))', t || ' member select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_family_editor(family_id))', t || ' editor insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_family_editor(family_id)) with check (public.is_family_editor(family_id))', t || ' editor update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_family_editor(family_id))', t || ' editor delete', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Storage:大頭照(公開讀取;路徑第一段為 family_id,只有該家族的 editor 可上傳 / 刪除)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true;

drop policy if exists "avatars public read"   on storage.objects;
drop policy if exists "avatars member insert" on storage.objects;
drop policy if exists "avatars member update" on storage.objects;
drop policy if exists "avatars member delete" on storage.objects;
create policy "avatars public read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_family_editor(((storage.foldername(name))[1])::uuid));
create policy "avatars member update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_family_editor(((storage.foldername(name))[1])::uuid));
create policy "avatars member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_family_editor(((storage.foldername(name))[1])::uuid));

-- ----------------------------------------------------------------------------
-- Keep-alive:免費方案 7 天無活動會暫停專案。
-- GitHub Actions(.github/workflows/keep-alive.yml)每 3 天以 anon key 呼叫 rpc/keep_alive。
-- ----------------------------------------------------------------------------
create table if not exists public.heartbeats (
  id         int primary key default 1 check (id = 1),
  last_ping  timestamptz not null default now(),
  source     text
);
insert into public.heartbeats (id) values (1) on conflict (id) do nothing;
alter table public.heartbeats enable row level security;

create or replace function public.keep_alive(p_source text default 'github-actions')
returns timestamptz language sql security definer set search_path = public as $$
  update public.heartbeats set last_ping = now(), source = p_source where id = 1 returning last_ping;
$$;
grant execute on function public.keep_alive(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Realtime:把資料表加進 supabase_realtime publication
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['families', 'family_codes', 'family_members', 'people', 'parent_child', 'spouses', 'person_entries', 'pets', 'households', 'family_links', 'family_link_invites'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- 已加入
    end;
  end loop;
end $$;
