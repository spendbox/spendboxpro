-- Newtown, part 71: private messages remember when they were read (docs/PEOPLE.md). The sender
-- sees "Opened" (like Snapchat), and a message you've read stops counting on every device and on
-- the phone's badge. Before this is run, the game remembers what you read on each phone instead.
--
-- Safe to run more than once.

alter table public.chat_messages add column if not exists read_at timestamptz;
create index if not exists chat_unread_idx on public.chat_messages (recipient_id, sender_id) where recipient_id is not null and read_at is null;
