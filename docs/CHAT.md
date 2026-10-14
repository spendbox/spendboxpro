# Chat

## Sending your location

In a private chat on the real map, the red pin beside the message box sends where you are
(`sendLocation` in `src/app/play/chat-actions.ts`): the street you're walking on, or else the
building the game has you at (or your home). The message carries the spot in a small tag at the end
(`src/lib/chat-location.ts`) and shows as a card: "Ada's location · Ada House, Yaba" with **Go there**.

The person it's sent to gets:

- a card over the game straight away (Go there, Open chat), unless they're reading that chat;
- a notice (kind `location`, with the spot), which is what their phone shows, and which stays in
  their notices: tapping it goes there.

**Go there** is an ordinary trip: the usual fare from where you are (`travelTo`), then you're there
and the camera flies over. A spot in another city says so.

## How chat works (the first time)

The first time someone starts a chat (taps New chat, or opens a private chat), four short cards
explain it: chatting with anyone, pictures and voice notes, sending your location, and staying safe.
Once only (`nt-chat-guide` on the phone); the ? at the top of the chat shows them again.
