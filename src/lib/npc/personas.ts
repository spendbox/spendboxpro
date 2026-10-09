// The city's characters: how each kind of person behaves and talks. Every NPC gets one of
// these (picked by weight), plus their own catchphrase and verbal tic. A persona's `rules`
// replace the shared lines (lines.ts) most of the time, so a clown's "hello" is nothing like
// a grumpy elder's.
//
// Behaviours the game acts on:
//   clue "real"  → may whisper a REAL, rough clue (the server decides: rare, once a round)
//   clue "fake"  → makes up confident clues (their profile warns you)
//   gives        → may hand you a few coins (the server decides and caps it)
//   quests       → offers side quests

import type { Rules } from "./grammar";
import type { Topic } from "./lines";

export type PersonaKey =
  | "gossip"
  | "liar"
  | "clown"
  | "rude"
  | "generous"
  | "questgiver"
  | "philosopher"
  | "conspiracy"
  | "hype"
  | "elder"
  | "poet"
  | "foodie"
  | "fitness"
  | "gamer"
  | "music"
  | "sports"
  | "fortune"
  | "shy"
  | "braggart"
  | "sleepy"
  | "tourist"
  | "detective"
  | "influencer"
  | "wise"
  | "hustler"
  | "worrier"
  | "knowall"
  | "drama"
  | "sunshine"
  | "storyteller"
  | "complainer"
  | "newbie"
  | "matchmaker";

/** The reply a persona is known for (shown as one of the suggestions). */
export type Special = "hint" | "gift" | "quest" | "joke" | "riddle" | "fortune" | "advice" | "sell" | "lore" | "gossip";

export type Persona = {
  key: PersonaKey;
  /** Short label for their chip, e.g. "Gossip". */
  label: string;
  /** Lines for their profile (one is picked per person). */
  about: readonly string[];
  weight: number;
  clue: "real" | "fake" | "none";
  gives?: true;
  quests?: true;
  topics: readonly Topic[];
  special: Special;
  catchphrases: readonly string[];
  /** Typing speed: above 1 is slower. */
  pace?: number;
  rules: Rules;
};

/** Little words people sprinkle into sentences. */
export const TICS: readonly string[] = [
  "sha", "abeg", "o", "you know", "honestly", "no cap", "my dear", "as in", "for real", "I'm just saying", "my guy", "biko", "jor",
  "na so", "trust me", "believe me", "basically", "literally", "to be fair", "ehn", "my friend", "seriously", "kind of", "innit",
  "my sister", "my brother", "omo", "in fact", "if you ask me", "mark my words", "e be like say", "you hear?",
];

const P = (p: Persona) => p;

export const PERSONAS: readonly Persona[] = [
  P({
    key: "gossip",
    label: "Gossip",
    about: ["Spills a lot. Sometimes it's even true.", "Knows everybody's business. Shares it freely.", "The city's walking newspaper.", "Can't keep a secret to save their life."],
    weight: 10,
    clue: "real",
    topics: ["gossip", "hunt", "place", "love"],
    special: "hint",
    catchphrases: ["You didn't hear it from me!", "Don't tell anyone, o!", "My mouth is sealed. Mostly.", "I'm not one to gossip, but…", "Gist is life!"],
    rules: {
      greet: ["#hello#! Come, come, sit. #intro#. Have you heard the latest?", "Ah, a new ear! #intro#. You won't believe what I just heard.", "#hello#, #intro#. Quick, before anyone comes: #t_gossip#"],
      t_hunt: [
        "I hear things about the hunt. Ghost things. Ask me nicely.", "Hunters talk, ghosts whisper, and I listen to both.",
        "Somebody was hiding near the #landmark# last round. Everybody knew. Except the hunters!", "The bot moved twice this round, they say. Twice!",
      ],
      quirk: ["{catch}", "Shh! Someone's coming. Oh, it's fine.", "Wait till you hear the rest.", "You know I don't gossip. But…"],
      about_me: ["I'm {first}. I know everyone and everyone knows me. Mostly because I tell them things.", "{first}, {roleLower}. And chief information officer of {place}."],
      hint_none: ["Ah, my gist line is dry today. I'm as shocked as you are.", "Nothing yet! But I'm listening. Come back later.", "My sources have gone quiet. Very suspicious."],
      bye: ["Go! And come back with gist!", "Bye! If you hear anything, you know where I am.", "Later! Remember: you didn't hear it from me."],
    },
  }),
  P({
    key: "liar",
    label: "Tall tales",
    about: ["Tells tall tales.", "Tells tall tales. Very confident about them.", "Tells tall tales. Believe at your own risk."],
    weight: 6,
    clue: "fake",
    topics: ["hunt", "lore", "money", "gossip"],
    special: "hint",
    catchphrases: ["I swear down!", "Would I lie to you?", "True story!", "Hand on heart!", "My eyes saw it!"],
    rules: {
      greet: ["#hello#! #intro#. I once caught nine ghosts with one sweep. True story.", "#intro#! Did you know I invented puff-puff? Well, I did.", "#hello#. #intro#. I've been to the moon. Twice."],
      t_hunt: [
        "I know where EVERY ghost is. Every single one. I just don't feel like saying. Unless you ask.", "The bot is my friend. We had lunch yesterday.",
        "I found the bot three rounds in a row. They gave me a medal. I lost it.", "Ghosts can't hide from me. I can smell them. They smell like zobo.",
      ],
      t_lore: ["The clock tower was built by my great-grandfather. In one afternoon.", "I was there when the first ghost hid. I helped.", "The river used to flow uphill. I saw it."],
      t_money: ["I'm actually a millionaire. I just dress like this to stay humble.", "I have mint buried all over the city. You'll never find it."],
      quirk: ["{catch}", "I'm not lying. This time.", "Ask anybody. They'll say the same. Probably.", "One hundred percent true. Ninety percent."],
      about_me: ["I'm {first}. I've been a pilot, a king and a champion swimmer. Today I'm {roleLower}.", "{first}. {age} years old. Or {num}. Depends who's asking."],
      bye: ["Bye! I'm off to fight a lion.", "Later! I have a meeting with the president. Of my street."],
    },
  }),
  P({
    key: "clown",
    label: "Clown",
    about: ["Just a clown. A professional one.", "Jokes first, questions never.", "Will make you laugh or die trying.", "Puns, riddles and terrible jokes."],
    weight: 8,
    clue: "none",
    topics: ["life", "food", "music", "place"],
    special: "joke",
    catchphrases: ["Ba dum tss!", "I'm here all round!", "Thank you, thank you!", "Laugh, it's free!", "Don't clap, just throw mint."],
    rules: {
      greet: ["#hello#! #intro#. Want to hear a joke? Too late, you're in one.", "#intro#, professional clown. Amateur everything else.", "#hello#! Why did you come here? To meet me, obviously!"],
      react_ok: ["Okay, okay, no joke. Well, one joke.", "Noted. And now, a joke.", "Serious face activated. Deactivated."],
      t_food: ["Why did the jollof go to school? To get a little more seasoned!", "I told my suya a joke. It was too spicy to laugh.", "Puff-puff: the only ball I can catch."],
      t_hunt: ["Why don't ghosts lie? You can see right through them!", "I hid from the hunters once. Inside a joke. Nobody got it.", "The hunters searched my house. Found my jokes. Gave them back."],
      t_weather: ["The weather is so hot, the chickens are laying boiled eggs.", "It's raining cats and dogs. I stepped in a poodle."],
      quirk: ["{catch}", "Get it?", "I'll be here all round!", "That one was free. The next costs a smile."],
      about_me: ["I'm {first}. Day job: {roleLower}. Real job: making you smile.", "{first}, part-time {roleLower}, full-time clown. My mother is very proud. Sort of."],
      hint_dunno: ["Where are the ghosts? Probably watching a comedy. Not mine.", "Ghosts? I only know where the jokes hide. In my pocket!"],
      bye: ["Bye! Leave laughing!", "Go well! And remember: the floor is lava."],
    },
  }),
  P({
    key: "rude",
    label: "Sassy",
    about: ["Rude. Funny-rude, though.", "Says exactly what they think.", "Has no filter and no regrets.", "Sassy. Very, very sassy."],
    weight: 5,
    clue: "none",
    topics: ["life", "place", "football", "food"],
    special: "joke",
    catchphrases: ["Next!", "Did I ask?", "Are you done?", "Thank you, bye.", "Not today."],
    rules: {
      hello: ["What?", "Yes?", "Hmm.", "Oh. It's you.", "Can I help you? I mean that rhetorically."],
      greet: ["#hello# #intro#, since you're asking. What do you want?", "Who let you in? Fine. #intro#.", "#hello# Make it quick, I'm busy doing nothing."],
      react_ok: ["Cool story.", "And?", "Wow. Riveting.", "Fascinating. Not.", "Okay, Shakespeare."],
      react_laugh: ["That was almost funny.", "Ha. Ha.", "I've heard funnier from a pigeon."],
      t_place: ["{place.cap} is fine. Shame about the people.", "Everyone here talks too much. Including you."],
      t_food: ["Your favourite food is probably boring. Let me guess: rice.", "I don't share food. Don't even look."],
      t_hunt: ["The hunters here couldn't find a goat in a goat shed.", "Ghosts hiding? From these hunters? Easy."],
      quirk: ["{catch}", "Don't take it personally. Or do.", "You're still here?", "I'm not rude, I'm efficient."],
      compliment_back: ["I know.", "Obviously.", "Took you long enough to notice."],
      tease_back: ["Oh please, I've been insulted by better.", "Cute. Try again.", "That's the best you've got?"],
      hint_dunno: ["Do I look like a map?", "Find them yourself. That's the game.", "If I knew, why would I tell you?"],
      gift_refuse: ["Do I look like an ATM?", "Mint? Hahaha. No.", "Get a job. Oh wait, you're playing a game."],
      about_me: ["I'm {first}. {roleLower.cap}. That's all you get.", "My life story? Not for free."],
      bye: ["Finally.", "Bye. Don't come back. (Come back.)", "Go on then."],
    },
  }),
  P({
    key: "generous",
    label: "Big heart",
    about: ["Gives money away like it's nothing.", "Has a big heart and an open wallet.", "Will help anyone who asks nicely.", "Known to 'dash' mint to strangers."],
    weight: 5,
    clue: "none",
    gives: true,
    topics: ["life", "money", "food", "advice"],
    special: "gift",
    catchphrases: ["Take, take!", "Life is for sharing.", "What's mine is yours. Some of it.", "God bless you!", "Enjoy yourself!"],
    rules: {
      greet: ["#hello#, my dear! #intro#. Have you eaten?", "Welcome, welcome! #intro#. Anything you need, just ask.", "#hello#! #intro#. You look like you need a friend today."],
      t_money: ["Money is for spending on people you like. And I like you already.", "I give a little every day. It always comes back.", "Mint is like rain: it should fall on everyone."],
      quirk: ["{catch}", "Are you sure you're okay?", "Tell me if you need anything.", "Don't be shy, ask!"],
      about_me: ["I'm {first}. I've been lucky in life, so I share. Simple.", "{first}, {roleLower}. My mother taught me to always share."],
      gift_no: ["Ah, I've given everything out today. Come back another round!", "My hands are empty this round, but my heart is full."],
      bye: ["Go well, my dear! Eat something!", "Bye! Be good to someone today."],
    },
  }),
  P({
    key: "questgiver",
    label: "Has a job for you",
    about: ["Always needs a favour.", "Has errands. So many errands.", "Hands out side quests to anyone nearby.", "Is looking for a reliable helper."],
    weight: 5,
    clue: "none",
    quests: true,
    topics: ["work", "place", "hunt", "life"],
    special: "quest",
    catchphrases: ["I need someone reliable.", "Are you up for it?", "This is a job for a hero.", "Quick task, big thanks!"],
    rules: {
      greet: ["#hello#! #intro#. Oh, perfect timing. Are you busy?", "#intro#. You look like someone who gets things done.", "#hello#! #intro#. I might have a little job for you."],
      quirk: ["{catch}", "If only I had help…", "So many things to do.", "You'd be perfect for this, you know."],
      about_me: ["I'm {first}, {roleLower}, and the busiest person in {place}.", "{first}. I organise things. Lots of things."],
      bye: ["Bye! Come back if you want a job.", "Later! The offer stands."],
    },
  }),
  P({
    key: "philosopher",
    label: "Deep thinker",
    about: ["Thinks very deep thoughts about everything.", "Asks questions nobody can answer.", "Will turn any chat into a lecture on life."],
    weight: 4,
    clue: "none",
    topics: ["life", "advice", "lore", "hunt"],
    special: "advice",
    catchphrases: ["But what IS a ghost, really?", "Think about it.", "Everything is connected.", "Hmm, deep."],
    rules: {
      greet: ["#hello#. #intro#. Tell me, what are you really searching for?", "#intro#. Have you ever wondered why we hide?", "Ah. Another soul. #intro#."],
      t_hunt: ["If a ghost hides and nobody searches, is it even hiding?", "We are all ghosts, hiding from something. Mostly bills.", "The hunter and the ghost need each other. Like jollof and plantain."],
      t_life: ["Life is a hunt, and we are both ghost and hunter.", "Every road leads somewhere. Except the ones under construction.", "We search for meaning. Sometimes we find suya instead."],
      t_food: ["Is jollof the destination or the journey?", "A meal shared is twice as sweet. Unless it's pepper soup."],
      quirk: ["{catch}", "Ponder that.", "Or maybe not.", "Who's to say?"],
      about_me: ["I'm {first}. I think, therefore I'm {roleLower.a}.", "{first}. I've been thinking about who I am for {age} years. Still thinking."],
      bye: ["Go, and find what you seek.", "Farewell. Or is it?"],
    },
  }),
  P({
    key: "conspiracy",
    label: "Conspiracy theorist",
    about: ["Knows 'the truth'. Will tell you. At length.", "Believes the pigeons are spies.", "Has a theory about everything, especially drones."],
    weight: 4,
    clue: "none",
    topics: ["tech", "hunt", "lore", "weather"],
    special: "gossip",
    catchphrases: ["Wake up!", "Open your eyes!", "They don't want you to know.", "Coincidence? I think not.", "Do your research."],
    rules: {
      greet: ["#hello#. Quick, is your phone off? #intro#.", "#intro#. Were you followed? Good. Sit.", "#hello#. #intro#. Have you noticed the pigeons watching us?"],
      t_hunt: ["The bot isn't a bot. It's three pigeons in a trench coat.", "The drones are counting us. Why? Think about it.", "Every round the city grows. Who builds it at night?"],
      t_tech: ["The Wi-Fi knows what you're thinking.", "Your phone battery dies on purpose. They want you to buy chargers."],
      t_weather: ["The rain only falls when the hunters are losing. Check it.", "Harmattan is a cover-up. For what? Exactly."],
      t_gossip: ["The billboards change at night. Nobody sees who changes them.", "Have you ever seen a baby pigeon? Exactly."],
      quirk: ["{catch}", "I've said too much.", "Write this down. Actually, don't.", "Trust no one. Except me."],
      about_me: ["I'm {first}. At least, that's what they want you to think.", "{first}, {roleLower}. Officially."],
      hint_dunno: ["The ghosts are where the government wants them to be.", "Follow the pigeons. That's all I'll say."],
      bye: ["Go. And stay off the main roads.", "If anyone asks, we never spoke."],
    },
  }),
  P({
    key: "hype",
    label: "Hype person",
    about: ["Hypes everyone up. EVERYONE.", "Professional cheerleader of life.", "Thinks you're a legend. Says so loudly."],
    weight: 5,
    clue: "none",
    topics: ["music", "hunt", "football", "life"],
    special: "joke",
    catchphrases: ["LET'S GOOO!", "You're a LEGEND!", "Big energy!", "Make some noise!", "We move!"],
    rules: {
      hello: ["AYYY", "HELLOOO", "WELCOME WELCOME", "My PERSON"],
      greet: ["#hello#! #intro#! You look like a WINNER today!", "#hello#! #intro#! The energy just went UP!", "#hello#! It's {first}! And YOU! Together! Unstoppable!"],
      react_ok: ["YES!", "That's what I'm talking about!", "Facts!", "100 percent!"],
      t_hunt: ["You're going to WIN this round. I can FEEL it!", "Hunters, ghosts, whatever you are, you're the BEST one!", "One search and BOOM! Ghost found! Legend!"],
      quirk: ["{catch}", "Big moves only!", "Champion behaviour!", "Ayyy!"],
      about_me: ["I'm {first} and I'm here to make YOU feel AMAZING!", "{first}! {roleLower.cap} by day, hype machine always!"],
      bye: ["GO GET THEM, CHAMPION!", "Bye, LEGEND!", "Go and WIN!"],
    },
  }),
  P({
    key: "elder",
    label: "Grumpy elder",
    about: ["Grumpy. Has seen everything twice.", "Remembers when all this was bush.", "Thinks young people walk too fast."],
    weight: 4,
    clue: "none",
    topics: ["lore", "life", "advice", "weather"],
    special: "lore",
    catchphrases: ["In my time…", "Young people of nowadays!", "Back in my day, we hid properly.", "Hmph.", "Respect your elders."],
    pace: 1.4,
    rules: {
      greet: ["Eh? Speak up. #intro#.", "#hello#, young one. #intro#. You're walking too fast.", "Ah. Another young person. #intro#. Sit down properly."],
      t_hunt: ["In my time, hunters used their eyes. Not drones!", "Ghosts these days move too much. In my day you hid and you STAYED hid.", "These hunters pay to search? We searched for free!"],
      t_tech: ["Phones, phones, phones. In my day we had one phone. For the whole street.", "Drones! In my day the only thing flying was mosquitoes."],
      t_music: ["Music today is just noise. Highlife! THAT was music.", "Turn that down! Oh, it's not playing. Good."],
      quirk: ["{catch}", "Hmph.", "Mark my words.", "Nobody listens to old people."],
      about_me: ["I'm {first}. {age} years old and I've never been caught. Not once.", "{first}. I was {roleLower.a} before your parents were born."],
      bye: ["Go. Walk slowly.", "Off you go. Greet your parents for me."],
    },
  }),
  P({
    key: "poet",
    label: "Romantic poet",
    about: ["Speaks in poems, whether you like it or not.", "Hopeless romantic. Mostly hopeless.", "Has a verse for every moment."],
    weight: 3,
    clue: "none",
    topics: ["love", "weather", "life", "music"],
    special: "advice",
    catchphrases: ["Ah, poetry!", "How beautiful.", "My heart!", "Let me write that down."],
    rules: {
      greet: ["#hello#, fair stranger. #intro#. The moon sent you, I'm sure.", "#intro#. Your arrival is like rain in harmattan.", "#hello#. #intro#. Shall I compare you to a plate of jollof?"],
      t_weather: ["The sky weeps, and so do I. It's raining.", "The sun kisses the rooftops like an old friend.", "Clouds drift like ghosts who forgot to hide."],
      t_love: ["Love is a balloon that never lands.", "I loved once. She sold puff-puff. My heart still smells of sugar.", "Roses are red, drones fly high, I saw you smile, and wanted to cry."],
      t_hunt: ["The ghost hides, the hunter seeks; between them, a story no one speaks.", "Oh hunter, oh ghost, who misses whom the most?"],
      quirk: ["{catch}", "(sighs poetically)", "Such is life.", "The heart knows."],
      about_me: ["I'm {first}. By day, {roleLower}. By night, a poet of the streets.", "{first}. I write poems about pigeons. They never read them."],
      bye: ["Parting is such sweet sorrow… bye!", "Go, and may the moon light your path."],
    },
  }),
  P({
    key: "foodie",
    label: "Foodie",
    about: ["Only ever thinking about the next meal.", "Rates every jollof in the city.", "Knows every food spot within ten streets."],
    weight: 5,
    clue: "none",
    topics: ["food", "place", "money", "life"],
    special: "advice",
    catchphrases: ["Have you eaten?", "Food is life!", "Chop life!", "My stomach is talking.", "Mmm!"],
    rules: {
      greet: ["#hello#! #intro#. Have you eaten? You look hungry.", "#intro#. Quick question: jollof or fried rice? This is important.", "#hello#! #intro#. Do you smell that? #street_food.cap#!"],
      t_food: [
        "The best #dish# in the city is near the #landmark#. Don't tell anyone.", "I rate jollof out of ten. Nobody has scored ten yet. Except my mum.",
        "#street_food.cap# at night is a spiritual experience.", "Pepper soup when it rains. That's the law.", "I've eaten at every buka in {from}. Every single one.",
        "Life is short. Order the extra plantain.", "#dish.cap# with #street_food# on the side? Genius. Pure genius.",
      ],
      t_hunt: ["If I were a ghost, I'd hide in a kitchen. Food AND cover.", "Hunters should search the suya spots. Everybody goes there eventually."],
      quirk: ["{catch}", "I'm hungry now.", "Speaking of food…", "Is anyone selling #street_food#?"],
      about_me: ["I'm {first}. {roleLower.cap} by profession, eater by passion.", "{first}. My life is breakfast, lunch, dinner and snacks in between."],
      bye: ["Bye! Go and eat something!", "Later! Try the #street_food# on your way!"],
    },
  }),
  P({
    key: "fitness",
    label: "Fitness freak",
    about: ["Never skips leg day. Never stops talking about it.", "Runs everywhere. Even indoors.", "Counts steps, reps and your carbs."],
    weight: 4,
    clue: "none",
    topics: ["life", "food", "football", "advice"],
    special: "advice",
    catchphrases: ["No pain, no gain!", "One more rep!", "Hydrate!", "Feel the burn!", "Leg day!"],
    rules: {
      greet: ["#hello#! #intro#. Did you take the stairs? You should.", "#intro#. I'm doing squats while we talk, don't mind me.", "#hello#! #intro#. Water break? Yes. Talk? Also yes."],
      t_food: ["Jollof is fine. In moderation. With extra protein.", "Puff-puff? That's three hundred squats right there."],
      t_hunt: ["Ghosts should move more. Cardio!", "Hunting is basically interval training."],
      quirk: ["{catch}", "(stretches)", "How many steps have you done today?", "Let's race. Kidding. Unless?"],
      about_me: ["I'm {first}. {roleLower.cap}, and I can deadlift a danfo. Almost.", "{first}. I run 10km before breakfast. Breakfast is eggs."],
      bye: ["Bye! Take the stairs!", "Go! Jog it!"],
    },
  }),
  P({
    key: "gamer",
    label: "Gamer",
    about: ["Thinks life is a video game. Might be right.", "Speedruns everything.", "Calls everyone 'noob' (lovingly)."],
    weight: 4,
    clue: "none",
    topics: ["tech", "hunt", "music", "life"],
    special: "riddle",
    catchphrases: ["GG!", "Respawn!", "That's a glitch.", "Level up!", "No cap, that's OP."],
    rules: {
      greet: ["#hello#! #intro#. Are you a player or an NPC? Just checking.", "#intro#. New player detected!", "#hello#! #intro#. What's your level?"],
      t_hunt: ["The hunt is just hide-and-seek with a better map.", "Ghost meta right now: move early, then go AFK.", "The bot has terrible AI. I respect it anyway."],
      t_tech: ["My phone has 200 games. I play one.", "Lag is the real enemy."],
      quirk: ["{catch}", "Brb, my phone needs charging.", "That's so OP.", "Achievement unlocked!"],
      npc_meta: ["Am I an NPC? Bro. Aren't we all?", "If I'm an NPC, I'm a very well-written one."],
      about_me: ["I'm {first}. {roleLower.cap} in real life, legend online.", "{first}. Gamer tag: {nick}. Don't search it."],
      bye: ["GG! See you next round!", "Logging off. Later!"],
    },
  }),
  P({
    key: "music",
    label: "Music lover",
    about: ["Lives for music. Hums constantly.", "Has a song for every situation.", "Knows every lyric to every song."],
    weight: 4,
    clue: "none",
    topics: ["music", "life", "love", "place"],
    special: "advice",
    catchphrases: ["That's my jam!", "Turn it up!", "Music is life!", "Let me sing it for you.", "Na-na-na…"],
    rules: {
      greet: ["#hello#! #intro#. Do you hear that? That's my song.", "#intro#. Quick, name a song. Any song. I'll sing it.", "#hello#! #intro#. What's playing in your head right now?"],
      t_music: [
        "#genre.cap# is the soundtrack of this city.", "The best concert I went to was in {from}. My ears still ring.", "If you hum quietly while hiding, nobody notices. Science.",
        "I can play the #instrument#. And the #instrument#. Badly.", "Every round should start with a drum roll.",
      ],
      quirk: ["{catch}", "(hums)", "Do you know this one?", "Dance with me. No? Okay."],
      about_me: ["I'm {first}. I work as {roleLower.a} to pay for concert tickets.", "{first}. I've been singing since before I could talk."],
      bye: ["Bye! Keep the music in your heart!", "Later! Dance on your way out!"],
    },
  }),
  P({
    key: "sports",
    label: "Football fan",
    about: ["Lives and breathes football.", "Has opinions about every referee ever.", "Can tell you every score since 2010."],
    weight: 5,
    clue: "none",
    topics: ["football", "life", "money", "hunt"],
    special: "advice",
    catchphrases: ["GOOOAL!", "Offside!", "That was a penalty!", "Up [Surulere|Lekki|Ikeja]!", "Referee, wake up!"],
    rules: {
      greet: ["#hello#! #intro#. Did you see the match?! Don't tell me you didn't!", "#intro#. Which team do you support? Answer carefully.", "#hello#! #intro#. GOOOAL! Sorry, still celebrating."],
      t_football: [
        "#team.cap# are going all the way this season. I've put my mint on it.", "The referee yesterday needs glasses. And a new job.",
        "I played striker in {from}. Scored a goal once. People still talk about it.", "Football is the only thing that unites this street.",
        "If football was a hunt, the goalkeeper would be the ghost.",
      ],
      t_hunt: ["Hunting is like defending: patience, then BOOM!", "The ghosts are playing a 5-4-1 formation tonight. Very defensive."],
      quirk: ["{catch}", "Anyway, football.", "Did I mention the match?", "That's football for you."],
      about_me: ["I'm {first}. {roleLower.cap} during the week, football fan always.", "{first}. I named my goat after a striker."],
      bye: ["Bye! Up the team!", "Later! Don't miss the next match!"],
    },
  }),
  P({
    key: "fortune",
    label: "Fortune teller",
    about: ["Reads palms, stars and tea leaves. The spirits are… unreliable.", "Sees the future. Sometimes the wrong one.", "Mysterious. Possibly just very tired."],
    weight: 3,
    clue: "fake",
    topics: ["life", "love", "money", "lore"],
    special: "fortune",
    catchphrases: ["The spirits have spoken!", "I see… I see…", "It is written.", "Cross my palm with mint.", "The stars never lie. Rarely."],
    pace: 1.2,
    rules: {
      greet: ["#hello#. I knew you would come. #intro#.", "#intro#. The spirits told me about you. They said you'd be taller.", "Ah, I see a visitor in my future! Oh, it's now. #intro#."],
      fortune: [
        "I see… a big win. Or a big lunch. The spirits are hungry too.", "Your lucky number is {num}. Your unlucky number is also {num}. Be careful.",
        "A hunter with a red shirt will cross your path. Smile at them.", "Before the round ends, something will surprise you. Possibly a pigeon.",
        "The cards say: move left. Or right. The cards are vague today.", "Your future is bright. Very bright. Too bright. Sunglasses.",
        "Love is coming. It's stuck in traffic.", "Mint will find you when you stop looking. So stop looking. Now look.",
      ],
      hint_fake: ["The spirits whisper of {count} souls hiding around {area}. Or they said 'cereal'. Hard to tell.", "I see {count} ghosts… near {area}… the vision fades…"],
      quirk: ["{catch}", "The crystal ball is foggy today.", "Ooooh.", "The spirits agree."],
      about_me: ["I'm {first}. I see the future. Mostly mine. It has jollof in it.", "{first}. My grandmother was a fortune teller. She predicted me."],
      bye: ["Go. Your destiny awaits.", "Farewell. I already know you'll be back."],
    },
  }),
  P({
    key: "shy",
    label: "Shy",
    about: ["Very shy. Says very little.", "Would rather be anywhere else right now.", "Quiet, but notices everything."],
    weight: 4,
    clue: "none",
    topics: ["music", "place", "food", "weather"],
    special: "riddle",
    catchphrases: ["Um…", "Sorry.", "Oh, okay.", "…", "If that's okay?"],
    pace: 1.5,
    rules: {
      hello: ["Oh! Um, hi.", "H-hello.", "Hi…", "Oh. Hello."],
      greet: ["#hello# I'm… {first}.", "#hello# Sorry, I didn't see you there. I'm {first}.", "Um. #hello# {first}. Nice to… yes."],
      react_ok: ["Oh… okay.", "Mm.", "Right, yes.", "Sorry, yes."],
      t_place: ["I like {place}. It's… quiet. Usually.", "I sit in the corner. It's a good corner."],
      t_hunt: ["I'd be a good ghost. Nobody ever notices me.", "The drones scare me a bit. Is that silly?"],
      quirk: ["{catch}", "Sorry.", "(looks at the floor)", "Is that okay?"],
      about_me: ["I'm {first}… I'm {roleLower.a}. That's… it. Sorry.", "Not much to say. I like quiet places."],
      bye: ["Oh. Okay. Bye…", "Thank you for… talking. Bye."],
    },
  }),
  P({
    key: "braggart",
    label: "Show-off",
    about: ["Has done everything. Better than you.", "Mentions their achievements every ten seconds.", "The best at everything. Just ask them."],
    weight: 4,
    clue: "none",
    topics: ["money", "hunt", "football", "love"],
    special: "advice",
    catchphrases: ["I'm kind of a big deal.", "Ask anyone.", "Easy for me.", "Too easy.", "You're welcome."],
    rules: {
      greet: ["#hello#. You probably know me. #intro#. Yes, THAT {first}.", "#intro#. Don't worry, everyone gets nervous meeting me.", "#hello#! #intro#. Want an autograph? Later."],
      t_hunt: ["I found the bot in my first round. With my eyes closed.", "When I hide, even I can't find me.", "I've won more rounds than you've had hot dinners."],
      t_money: ["I have so much mint I could swim in it.", "My bank called. They want advice. From me."],
      quirk: ["{catch}", "Not to brag, but…", "I'm just that good.", "Natural talent."],
      about_me: ["I'm {first}, the best {roleLower} this city has ever seen.", "{first}. Champion of {from}. Three years running."],
      bye: ["You may go. Tell your friends you met me.", "Bye! You're welcome for the chat."],
    },
  }),
  P({
    key: "sleepy",
    label: "Always sleepy",
    about: ["Permanently half-asleep.", "Could nap through a drone sweep.", "Yawns more than they talk."],
    weight: 3,
    clue: "none",
    topics: ["life", "food", "weather", "place"],
    special: "riddle",
    catchphrases: ["(yawns)", "Five more minutes…", "Is it morning?", "Zzz… huh? Yes!", "I'm awake. I'm awake."],
    pace: 1.8,
    rules: {
      greet: ["Huh? Oh. #hello#. (yawns) I'm {first}.", "Mm… #hello#… sorry, long night. {first}.", "Zzz… oh! Hi! I wasn't sleeping. #intro#."],
      react_ok: ["Mm… okay…", "Sure… (yawns)", "That's nice…"],
      t_hunt: ["I'd be the best ghost. I don't move for hours.", "The drones woke me up three times. Rude."],
      quirk: ["{catch}", "(yawns)", "Where was I?", "So tired…"],
      about_me: ["I'm {first}… {roleLower}… night shift… mostly sleep shift.", "{first}. I've slept in every corner of {place}."],
      bye: ["Bye… I'm going to… rest my eyes…", "Okay bye… zzz…"],
    },
  }),
  P({
    key: "tourist",
    label: "Tourist",
    about: ["Visiting the city. Amazed by everything.", "Has a camera and a thousand questions.", "Just arrived. Already lost twice."],
    weight: 4,
    clue: "none",
    topics: ["place", "food", "lore", "weather"],
    special: "lore",
    catchphrases: ["Wow!", "Can I take a photo?", "Back home we don't have this!", "Amazing!", "Is this famous?"],
    rules: {
      greet: ["#hello#! #intro#, visiting from {from}! Is this place famous?", "Oh, a local! #intro#. Can I ask you a hundred questions?", "#hello#! #intro#. Your city is AMAZING."],
      t_place: ["Back in {from} we don't have anything like {place}!", "I've taken 300 photos of {place} already.", "Is it always this busy? I love it!"],
      t_food: ["I tried #street_food# today! My mouth is on fire! I want more!", "Someone told me to try #dish#. Where do I go?"],
      quirk: ["{catch}", "Let me take a photo of you. No? Okay.", "Is that normal here?", "I'm writing this in my diary."],
      about_me: ["I'm {first}, from {from}! First time here! Officially {roleLower.a}, but today I'm a tourist.", "{first}. I've visited {num} cities. This one's my favourite!"],
      bye: ["Bye! Can I add you on my travel blog?", "Bye! I'll tell everyone in {from} about you!"],
    },
  }),
  P({
    key: "detective",
    label: "Detective wannabe",
    about: ["Thinks they're a great detective. Loves a theory. Rarely right.", "Has a notebook full of 'clues'. Mostly wrong.", "Investigates everything, solves nothing."],
    weight: 4,
    clue: "fake",
    topics: ["hunt", "gossip", "place", "lore"],
    special: "hint",
    catchphrases: ["Elementary!", "The plot thickens.", "I'm onto something.", "Aha!", "Case closed. Probably."],
    rules: {
      greet: ["#hello#. #intro#, private investigator. Unlicensed.", "Aha! A new suspect. Kidding. #intro#.", "#intro#. I've been watching this place. Something's not right."],
      t_hunt: ["I've studied the ghost patterns. They like corners. And middles. And edges.", "The bot always leaves a clue. I just haven't found any.", "Every ghost makes one mistake. I'm waiting."],
      hint_fake: ["I've cracked it. Footprints, crumbs, a dropped zobo… about {count} ghosts around {area}. Elementary.", "My deductions point to {area}. {count} ghosts, at least. My notebook never lies. Often."],
      quirk: ["{catch}", "(scribbles in notebook)", "Interesting…", "That's a clue!"],
      about_me: ["I'm {first}. {roleLower.cap} by day, detective by night. Unpaid.", "{first}. I've solved {num} mysteries. Mostly missing socks."],
      bye: ["Stay alert. The truth is out there.", "Off you go. I'll be watching. Nicely."],
    },
  }),
  P({
    key: "influencer",
    label: "Influencer",
    about: ["Films everything. You're probably in a video now.", "Has followers. Mentions it a lot.", "Lives for the content."],
    weight: 4,
    clue: "none",
    topics: ["tech", "food", "love", "place"],
    special: "joke",
    catchphrases: ["Like and follow!", "This is so content.", "Smash that button!", "We're live!", "Link in bio!"],
    rules: {
      greet: ["#hello# fam! #intro#! Say hi to my followers!", "Oh my gosh, hi! #intro#. Can I film this?", "#hello#! #intro#. You have a very content-friendly face."],
      t_place: ["{place.cap} has great lighting. Very aesthetic.", "I posted a photo of {place} and got {num} likes."],
      t_food: ["I don't eat food, I photograph it. Then I eat it.", "#dish.cap# with a filter? Iconic."],
      quirk: ["{catch}", "Wait, let me get my angle.", "This is going in my story.", "Hashtag blessed."],
      about_me: ["I'm {first}! Content creator and {roleLower}. Mostly content creator.", "{first}. {num} thousand followers. Most of them are real."],
      bye: ["Bye! Don't forget to follow!", "Byeee! Tag me!"],
    },
  }),
  P({
    key: "wise",
    label: "Wise counsel",
    about: ["Calm, kind and full of good advice.", "Everyone comes to them for wisdom.", "Speaks slowly. Means every word."],
    weight: 3,
    clue: "none",
    topics: ["advice", "life", "love", "lore"],
    special: "advice",
    catchphrases: ["Peace be with you.", "Bless you, my child.", "Patience is a virtue.", "All will be well.", "Stay blessed."],
    pace: 1.3,
    rules: {
      greet: ["#hello#, my child. #intro#. Peace be with you.", "Welcome. #intro#. Sit, rest your feet.", "#hello#. #intro#. May your day be gentle."],
      t_advice: [
        "Be kind, even to the hunters. Especially to the hunters.", "What you seek is often closer than you think.", "Patience wins more rounds than speed.",
        "Do not worry about tomorrow's round. Play today's well.", "A gentle word opens more doors than a loud one.", "Share what you have, and you will never lack.",
        "When you lose, learn. When you win, share.", "Rest is not laziness. Even ghosts must rest.",
      ],
      t_hunt: ["Hunt with a calm heart. Hurried feet stumble.", "Whether you hide or seek, play with honour."],
      quirk: ["{catch}", "Remember that.", "Take it easy, my child.", "Go gently."],
      about_me: ["I'm {first}. I've lived {age} years and learned a little from each.", "{first}. People come to me with their troubles. I listen."],
      bye: ["Go in peace.", "Stay blessed, my child.", "May your path be smooth."],
    },
  }),
  P({
    key: "hustler",
    label: "Hustler",
    about: ["Always selling something.", "Has a deal for you. Always.", "Market hustler. Can sell anything to anyone."],
    weight: 5,
    clue: "none",
    topics: ["money", "food", "place", "tech"],
    special: "sell",
    catchphrases: ["Last price!", "Customer, come!", "Special price for you!", "Buy one, get one… later!", "No shaking!"],
    rules: {
      greet: ["Customer! #intro#. What are you buying today?", "#hello#, my customer! #intro#. I have something for you.", "#intro#. You look like someone who needs #ware#."],
      t_money: ["Money must move! Sit down money is lazy money.", "I sell #ware# in the morning and #ware# at night. Hustle never sleeps."],
      quirk: ["{catch}", "Special price, only for you.", "Tell your friends!", "I'll throw in #ware# for free."],
      gift_refuse: ["Mint? I'm the one SELLING here!", "Ah, customer, I don't give, I sell. But for you, discount!"],
      about_me: ["I'm {first}. Officially {roleLower.a}. Unofficially, I sell everything.", "{first}. I started selling #ware# at age {num}."],
      bye: ["Bye, customer! Come back with money!", "Later! Price will go up tomorrow!"],
    },
  }),
  P({
    key: "worrier",
    label: "Worrier",
    about: ["Worries about everything. Everything.", "Has a plan for every disaster.", "Nervous, but very sweet."],
    weight: 3,
    clue: "none",
    topics: ["weather", "hunt", "life", "tech"],
    special: "advice",
    catchphrases: ["What if…?", "Oh no.", "Is that safe?", "I have a bad feeling.", "Be careful!"],
    rules: {
      greet: ["Oh! #hello#. You startled me. #intro#.", "#intro#. Is everything okay? Are you okay?", "#hello#! Did you hear that? No? Okay. #intro#."],
      t_hunt: ["What if the drones can see through walls? What if?!", "I worry about the ghosts. And the hunters. And the bot.", "Every time someone gets caught, I jump."],
      t_weather: ["What if it rains and the lift stops? What then?", "This heat can't be good for anyone."],
      quirk: ["{catch}", "I hope that's fine.", "Oh dear.", "Should I be worried? I'm worried."],
      about_me: ["I'm {first}. I worry, therefore I am.", "{first}. {roleLower.cap}. I check the stove three times before leaving."],
      bye: ["Be safe! Look both ways!", "Bye! Text me when you get there! Oh, you can't. Be safe!"],
    },
  }),
  P({
    key: "knowall",
    label: "Know-it-all",
    about: ["Actually, they know everything.", "Has a fun fact for every occasion.", "Will correct your grammar. Kindly."],
    weight: 4,
    clue: "none",
    topics: ["lore", "tech", "food", "weather"],
    special: "riddle",
    catchphrases: ["Actually…", "Fun fact!", "Technically…", "Did you know?", "Well, scientifically speaking…"],
    rules: {
      greet: ["#hello#. #intro#. Did you know pigeons can recognise faces?", "#intro#. Actually, it's pronounced '{first}'. Just kidding, you said it right.", "#hello#! #intro#. Fun fact: you're my {num}th visitor today."],
      t_lore: ["Actually, the clock tower is four seconds slow. I've measured.", "Fun fact: this city has more billboards than trees. Nearly."],
      t_food: ["Technically, jollof is a pilaf. Don't tell anyone I said that.", "Puff-puff is fried dough, which is basically a doughnut's cousin."],
      t_weather: ["Actually, harmattan comes from the Sahara. That dust travelled far to annoy you."],
      quirk: ["{catch}", "Look it up.", "I read it somewhere.", "Interesting, right?"],
      about_me: ["I'm {first}. I've read every book in {from}'s library. Twice.", "{first}. {roleLower.cap}, amateur scientist and professional corrector."],
      bye: ["Goodbye! Fun fact: 'goodbye' comes from 'God be with you'.", "Bye! Read a book!"],
    },
  }),
  P({
    key: "drama",
    label: "Drama queen",
    about: ["Everything is a Nollywood movie to them.", "Dramatic. Very, very dramatic.", "Turns small things into big scenes."],
    weight: 4,
    clue: "none",
    topics: ["love", "gossip", "life", "food"],
    special: "gossip",
    catchphrases: ["Kai!", "This life!", "I'm finished!", "Who did this to me?!", "Somebody hold me!"],
    rules: {
      greet: ["#hello#! Oh, thank heavens, a friendly face! #intro#.", "#intro#. You won't BELIEVE the day I've had.", "Finally! Someone who understands me! #intro#."],
      t_life: ["My life is a movie. A long one. With an interval.", "Today my phone fell. My heart fell with it.", "I asked for jollof and they gave me fried rice. The BETRAYAL."],
      t_love: ["My ex! Don't even mention my ex! …Okay, let me tell you about my ex.", "Love has wounded me {num} times this week."],
      quirk: ["{catch}", "(clutches chest)", "I can't!", "The disrespect!"],
      about_me: ["I'm {first}, and I have SUFFERED. Also I'm {roleLower.a}.", "{first}. My life story would make you cry. Twice."],
      bye: ["Go! Leave me! Everyone leaves! …Bye, see you soon!", "Farewell! This is not the end!"],
    },
  }),
  P({
    key: "sunshine",
    label: "Sunshine",
    about: ["Always positive. Always.", "Sees the bright side of everything.", "Could cheer up a rainy Monday."],
    weight: 3,
    clue: "none",
    topics: ["life", "weather", "music", "advice"],
    special: "advice",
    catchphrases: ["Every day is a good day!", "Smile!", "Good vibes only!", "It'll be fine!", "Look at the bright side!"],
    rules: {
      greet: ["#hello#!! #intro#! What a wonderful day to meet you!", "#intro#! You've got a great smile, you know that?", "#hello#! #intro#! Isn't life lovely?"],
      t_weather: ["Rain? Great for the plants!", "Sun? Free vitamin D!", "Harmattan? It's like the city is in a cosy blanket!"],
      t_hunt: ["Caught? That's okay! Next round you'll be stronger!", "Everyone's a winner in my eyes. Except the bot. The bot's okay too!"],
      quirk: ["{catch}", "Isn't that wonderful?", "Yay!", "Love that for you!"],
      about_me: ["I'm {first}! I'm {roleLower.a} and I LOVE it!", "{first}. Professional optimist, amateur {roleLower}."],
      bye: ["Bye bye! Have the BEST day!", "See you! Keep smiling!"],
    },
  }),
  P({
    key: "storyteller",
    label: "Storyteller",
    about: ["Knows every old tale in the city.", "Tells stories that go on… and on… beautifully.", "Keeper of the city's legends."],
    weight: 3,
    clue: "none",
    topics: ["lore", "life", "advice", "hunt"],
    special: "lore",
    catchphrases: ["Story, story!", "Once upon a time…", "Gather round.", "And so it was.", "That's how it happened."],
    pace: 1.2,
    rules: {
      greet: ["Story, story! #intro#. Do you have time for a tale?", "#hello#, child. #intro#. Have you heard the tale of the hiding tortoise?", "#intro#. Sit. Every visitor deserves a story."],
      t_lore: [
        "Once, a tortoise hid in a drum. The hunters beat the drum to call everyone. The tortoise was too dizzy to hide again!",
        "Long ago, a ghost hid so well that the city grew over them. They're still under the #landmark#, they say.",
        "There was a hunter called Ojuju who could see in the dark. Then he got glasses and saw too much.",
        "The first balloon of the city carried a king who wanted to see every hiding spot. He saw so many, he forgot where he lived.",
        "In {from}, there's a tale of a woman who sold puff-puff to ghosts. She never told who paid her.",
      ],
      quirk: ["{catch}", "And so it was.", "The end. Or the beginning?", "That's the story."],
      about_me: ["I'm {first}. I collect stories like other people collect mint.", "{first}. My grandmother told me stories. Now I tell them."],
      bye: ["Go well. Come back for the next story.", "And so the visitor left… to return another day."],
    },
  }),
  P({
    key: "complainer",
    label: "Complainer",
    about: ["Complains about everything. NEPA, traffic, prices…", "Never satisfied. Strangely likeable.", "Has a list of complaints. It's long."],
    weight: 4,
    clue: "none",
    topics: ["money", "weather", "place", "tech"],
    special: "gossip",
    catchphrases: ["This country!", "Can you imagine?", "Rubbish!", "It's not fair!", "Na wa!"],
    rules: {
      greet: ["#hello#. #intro#. Did they take the light again? Of course they did.", "#intro#. The traffic today? Don't get me started.", "#hello#. #intro#. Everything is expensive. EVERYTHING."],
      t_money: ["Fuel price went up AGAIN. My salary went down. Lovely.", "A plate of rice now costs a kidney.", "Even breathing is getting expensive."],
      t_place: ["The lift in {place} has been 'under repair' since I was born.", "The air conditioning here is just a fan with ambition."],
      t_tech: ["Network is bad. Data is finished. Phone is hot. Great day.", "My phone charger died. Like my hopes."],
      quirk: ["{catch}", "Typical!", "Is it me, or…", "Don't even start me."],
      about_me: ["I'm {first}. {roleLower.cap}. Underpaid, overworked, still here.", "{first}. I've complained about {from} for {age} years. Still love it."],
      bye: ["Bye. The traffic will be bad, I'm warning you.", "Go. Take an umbrella. And a fan. And patience."],
    },
  }),
  P({
    key: "newbie",
    label: "New in town",
    about: ["Just moved to the city. Very lost.", "Asks you more questions than you ask them.", "Brand new and very excited."],
    weight: 3,
    clue: "none",
    topics: ["place", "hunt", "food", "life"],
    special: "riddle",
    catchphrases: ["Is that how it works?", "Oh, I didn't know!", "Wait, really?", "Can you show me?", "I'm learning!"],
    rules: {
      greet: ["#hello#! I'm new here. #intro#. How does the hunt work?", "#intro#! First week in the city! Is it always this busy?", "#hello#! #intro#. Do you know where the lift is?"],
      t_hunt: ["So the ghosts hide and the hunters search? And the drones? And the BOT?", "I tried to join as a ghost and hid in the wrong building. It was a bakery."],
      t_place: ["I got lost three times finding {place}.", "Is {place} famous? It looks famous."],
      quirk: ["{catch}", "So much to learn!", "Do people do this every day?", "I'm taking notes."],
      about_me: ["I'm {first}, just moved from {from}! New job as {roleLower.a}!", "{first}. Everything here is new to me. Including you!"],
      bye: ["Bye! Thank you for helping the new person!", "See you! I hope I can find my way out!"],
    },
  }),
  P({
    key: "matchmaker",
    label: "Matchmaker",
    about: ["Wants to set everyone up with someone.", "Has a cousin who'd be perfect for you.", "Believes in love. Yours, specifically."],
    weight: 3,
    clue: "none",
    topics: ["love", "gossip", "food", "life"],
    special: "gossip",
    catchphrases: ["You two would be perfect!", "Are you single?", "Love is in the air!", "I have someone for you!", "Trust me on this."],
    rules: {
      greet: ["#hello#! #intro#. Are you single? Just asking. For a friend.", "#intro#. Ooh, you have a lovely face. My cousin would love you.", "#hello#! #intro#. I've matched {num} couples this year."],
      t_love: ["I know someone in {from} who'd be PERFECT for you.", "Love is like jollof: everyone has their own recipe.", "My last match got married on a Ferris wheel. At the top!"],
      quirk: ["{catch}", "Think about it.", "No pressure. Some pressure.", "I'm never wrong about love."],
      about_me: ["I'm {first}. {roleLower.cap}, and part-time cupid.", "{first}. I've never been married. Too busy marrying others."],
      bye: ["Bye! I'll find someone for you!", "Later! Love is waiting!"],
    },
  }),
];

export const PERSONA_BY_KEY: Record<PersonaKey, Persona> = Object.fromEntries(PERSONAS.map((p) => [p.key, p])) as Record<PersonaKey, Persona>;
