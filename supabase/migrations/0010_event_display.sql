-- 0010: display fields the events board needs (docs/12).
-- kind drives the template label (fight_night/mirror_cup/rookie_night/
-- gurubashi); venue is a place name, not a zone id — organizers name it;
-- cap bounds registrations.
alter table tournaments
  add column kind text not null default 'fight_night'
    check (kind in ('fight_night','mirror_cup','rookie_night','gurubashi')),
  add column venue text not null default '',
  add column cap int not null default 32 check (cap between 1 and 512);

create index tournaments_board on tournaments(status, starts_at)
  where visibility = 'public';
