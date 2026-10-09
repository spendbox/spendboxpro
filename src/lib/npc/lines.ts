// Everyone's lines: the shared grammar the city's people talk with (see grammar.ts for how
// #rules#, [inline|choices] and {facts} work). Characters (personas.ts) and moods override
// any of these with their own versions.

import type { Rules } from "./grammar";

export type Topic =
  | "hunt"
  | "weather"
  | "food"
  | "music"
  | "football"
  | "gossip"
  | "place"
  | "advice"
  | "lore"
  | "money"
  | "love"
  | "work"
  | "tech"
  | "life";

export const TOPICS: readonly Topic[] = ["hunt", "weather", "food", "music", "football", "gossip", "place", "advice", "lore", "money", "love", "work", "tech", "life"];

export const BASE: Rules = {
  // ---------------------------------------------------------------- small words
  exclaim: ["Chai", "Omo", "Haba", "Wow", "Kai", "Ehen", "Mehn", "Gosh", "Na wa o", "Ah ah", "Eish", "Ooh", "Ayy", "Whoa", "Jeez", "Ewo", "Oya", "Hmm", "Ha"],
  hello: ["Hello", "Hi", "Hey", "Ah, hello", "Good [day|evening|afternoon]", "How far", "Wetin dey", "Kedu", "Sannu", "Ẹ n lẹ", "Howdy", "Bonjour", "Hola", "Salaam", "Jambo", "Sawubona", "Akwaaba", "Hello hello", "Yo", "Greetings"],
  intro: [
    "I'm {first}", "name's {first}", "they call me {nick}", "{first} here, {roleLower}", "I'm {first}, the {roleLower}", "{first} is the name",
    "I'm {first}. Some people call me {nick}", "{first}. From {from}, originally", "call me {first}", "I'm {first} and I'm [{age}|not telling you my age]",
  ],
  greet: [
    "#hello#! #intro#. #smalltalk#", "#hello#, #intro#. #opener#", "#exclaim#, a new face! #intro#. #opener#", "#hello#! #opener#",
    "#hello#. #intro#. #mood_line#", "#intro#. #hello#! #smalltalk#",
  ],
  opener: [
    "What brings you to {place}?", "You look like you're on a mission.", "Pull up a chair. Or don't, it's a free city.",
    "Busy night out there, isn't it?", "You're not a hunter, are you? Just asking.", "Nice to see someone new around here.",
    "First time in {place}?", "You picked a good time to come by.", "I was just thinking about #thing#.", "Sit down, sit down. Tell me something.",
  ],
  smalltalk: [
    "#t_weather#", "#t_place#", "#t_hunt#", "I was just thinking about #thing#.", "Everyone is talking about the hunt today.",
    "The #weather_word# today is something else.", "Did you see the #landmark# on your way in?",
  ],
  mood_line: ["I'm in a good mood today.", "Today is a day, isn't it?", "Not bad, not bad at all."],
  thing: [
    "jollof", "the price of fuel", "pigeons", "my landlord", "the bot", "the next hunt", "a nap", "puff-puff", "drones", "my cousin's wedding",
    "the meaning of life", "my phone battery", "the big billboard", "suya", "the hot-air balloons", "football", "the traffic", "my ex",
    "a new hairstyle", "buying a car", "learning the guitar", "zobo", "my old school", "the weather", "the moon", "lottery numbers",
  ],
  friend: [
    "my cousin", "my neighbour", "my barber", "my landlord", "my aunty", "my best friend", "my old classmate", "the gateman", "a guy I know",
    "my brother-in-law", "the suya man", "my hairdresser", "a pigeon (don't ask)", "my mum", "my small sister", "the security guard downstairs",
    "the woman who sells oranges", "my uncle's driver", "my gym partner", "my pastor's nephew", "an okada rider", "my boss",
  ],
  landmark: [
    "big roundabout", "clock tower", "old market", "new bridge", "stadium", "train station", "fountain in the plaza", "giant billboard",
    "Ferris wheel", "water tower", "big mall", "hospital", "police station", "river", "fuel station", "radio mast", "park", "funfair",
  ],
  weather_word: ["sun", "heat", "breeze", "rain", "sky", "humidity", "harmattan haze", "cloud cover", "wind"],
  adj_good: ["sweet", "correct", "solid", "top-notch", "proper", "amazing", "lovely", "mad", "fantastic", "first-class", "golden", "sharp"],
  adj_bad: ["terrible", "wahala", "suspicious", "dodgy", "dreadful", "useless", "too much", "not it", "a disaster", "rough"],
  num: ["two", "three", "four", "five", "six", "seven", "ten", "twelve", "a hundred", "a thousand"],
  time_ago: ["yesterday", "last week", "this morning", "an hour ago", "two minutes ago", "last year", "in 2019", "on Tuesday", "at dawn"],
  animal: ["goat", "pigeon", "cat", "dog", "chicken", "lizard", "parrot", "duck", "cockroach", "tortoise", "monkey", "fish"],
  vehicle: ["danfo", "keke", "okada", "taxi", "train", "balloon", "ferry", "bus", "bicycle", "skateboard"],

  // ---------------------------------------------------------------- reactions
  react_hi: ["#hello#!", "Hello to you too!", "Ah, you again!", "Welcome, welcome."],
  react_ok: ["Okay, okay.", "I hear you.", "Fair enough.", "Ehen.", "True talk.", "Mm-hmm.", "Right.", "Sure, sure.", "I see.", "Interesting."],
  react_more: ["Oh, you want more?", "Alright, listen.", "Where was I…", "Okay, so.", "You like gist, eh?", "Lean in.", "Gather round."],
  react_laugh: ["Hahaha!", "Hehe.", "Ha! Good one.", "You're funny.", "Stop it, my ribs!", "LOL. I said it out loud.", "Hahaha, no!"],
  react_wow: ["#exclaim#!", "Is that so?", "No way!", "Really?", "You don't say!", "For real?"],
  react_doubt: ["Hmm, I'm not sure about that.", "Are you sure?", "If you say so.", "That's what they all say.", "Doubtful. Very doubtful."],
  more_lead: ["And another thing:", "Also,", "Oh, and", "Not only that,", "Plus,", "On top of that,", "By the way,", "Wait, there's more:"],

  // ---------------------------------------------------------------- topics (the NPC talking)
  t_hunt: [
    "The hunters are getting really good lately.", "Somebody just got caught [two streets away|by the #landmark#|near here]. Wild.",
    "If I were a ghost I'd hide by the #landmark#. Too obvious?", "I keep hearing drones over {place}. Busy night.",
    "The bot is somewhere around here, I can feel it.", "Decoys everywhere today. The hunters are confused.",
    "Never trust a quiet street.", "#friend.cap# says the ghosts move when the drones buzz.", "Ghosts have it hard. Hunters have it harder.",
    "I saw a hunter search the same tile twice. Twice!", "They say the best hiding spot is the one nobody thinks of. Deep, right?",
    "I'd be a terrible ghost. I sneeze when I'm nervous.", "Every time a drone flies past, my heart does a little dance.",
    "The prize pool is looking [juicy|fat|sweet] this round.", "Hunters pay to search. Ghosts pay to move. Me? I just watch.",
    "My money is on the ghosts this round.", "My money is on the hunters this round.", "Last round, the bot hid somewhere so silly nobody looked there.",
  ],
  t_weather: [
    "The #weather_word# today is something else.", "It's [hot|warm|steamy] enough to fry plantain on the pavement.",
    "Looks like rain. Or not. The sky is confused.", "I like this breeze. Very [romantic|refreshing|suspicious].",
    "When the rain comes, the hunters slow down. True story.", "Harmattan season makes everyone look like a ghost. All that dust!",
    "The sky was orange this morning. Beautiful.", "I left my umbrella at home, so it will definitely rain.",
    "The weatherman said sunny. The weatherman lies.", "Perfect weather for hiding, if you ask me.",
  ],
  t_food: [
    "I could eat #dish# right now.", "Have you tried the #street_food# by the #landmark#? #adj_good.cap#.",
    "Jollof rice is the answer. What's the question?", "Nothing beats #dish# on a rainy day.", "I had #dish# for breakfast. No regrets.",
    "The suya man by the #landmark# puts too much pepper. I still go every day.", "Puff-puff is not a snack, it's a lifestyle.",
    "If you see #street_food#, buy two. One for you, one for me.", "My mum's #dish# could stop a war.",
    "I'm on a diet. The diet is #dish#.", "Cold #drink# and #street_food#: that's my idea of paradise.",
  ],
  dish: [
    "jollof rice", "fried rice", "egusi soup", "pounded yam", "amala and ewedu", "pepper soup", "ofada rice", "efo riro", "moi-moi",
    "beans and plantain", "afang soup", "banga soup", "tuwo shinkafa", "nkwobi", "ofe nsala", "yam porridge", "spaghetti jollof",
    "fufu and okra", "ugba", "abacha", "edikang ikong", "noodles with egg", "waakye", "kenkey", "injera", "nyama choma", "pizza", "a burger",
    "shawarma", "ramen", "tacos", "fish and chips", "curry",
  ],
  street_food: ["suya", "puff-puff", "boli", "akara", "roasted corn", "meat pie", "chin-chin", "kilishi", "masa", "gala", "plantain chips", "agege bread", "kokoro", "shawarma", "chicken on a stick"],
  drink: ["zobo", "chapman", "kunu", "palm wine", "malt", "tiger nut milk", "coconut water", "fura da nono", "cold water", "lemonade", "tea", "coffee"],
  t_music: [
    "This song is [a banger|a classic|my jam]. Don't argue.", "Afrobeats in the morning, highlife at night. That's balance.",
    "I can't sing, but I sing anyway.", "The DJ on the #landmark# side plays nothing but #genre#.", "I learned the #instrument# in one week. Badly.",
    "Every party needs one song everyone knows. Mine is a #genre# classic.", "If the music is good, the hunt is good.",
    "I made a playlist for hiding. It's very quiet.", "My dance moves have been banned in three clubs.", "#genre.cap# makes my legs move on their own.",
  ],
  genre: ["afrobeats", "amapiano", "highlife", "fuji", "juju", "apala", "gospel", "hip-hop", "afro-pop", "reggae", "jazz", "rock", "K-pop", "makossa", "bongo flava", "gqom", "soukous", "R&B", "classical"],
  instrument: ["talking drum", "guitar", "keyboard", "saxophone", "shekere", "trumpet", "flute", "kora", "violin", "drums"],
  t_football: [
    "Did you watch the match? [What a game!|I can't talk about it.|My heart is still recovering.]",
    "The #team# need a new striker. Badly.", "#team.cap# will win the league. I'm sure. I was sure last year too.",
    "If the Super Eagles play like that again, I'll cry happy tears.", "My cousin was almost a footballer. Almost.",
    "Five-a-side by the #landmark# at six. You in?", "The referee was blind. BLIND.", "Football is not a game, it's a religion with a ball.",
    "I support two teams. That way I'm always happy.", "Penalties should be illegal. Too stressful.",
  ],
  team: ["Surulere United", "Ajegunle Lions", "Enugu Rangers of the Street", "Kano Pillars Juniors", "Lekki Lightning", "Ikeja Eagles", "Yaba Yankees", "Ibadan Thunder", "the Super Eagles", "the Super Falcons", "the Black Stars", "our street team"],
  t_gossip: [
    "Did you hear about #player_name#? [Caught three times in one round!|Hid in a fridge. A whole fridge.|Won big last night.|Searched the same tile ten times.]",
    "#player_name# and #player_name# are not talking anymore. Over a decoy!", "Someone around {place} won so much they bought everyone suya.",
    "I heard #player_name# moves every time a drone appears. Very nervous ghost.", "#friend.cap# told me something, but I promised not to tell. So I won't. Yet.",
    "The receptionist downstairs knows more than they say.", "Somebody's been hiding in the same place for three rounds. Bold.",
    "#player_name# swears the bot winked at them. The bot doesn't have eyes!", "There's a rumour that #rumour#.",
  ],
  player_name: [
    "BigDaddyDrone", "GhostQueen99", "Tobi_the_Hunter", "MamaPutMaster", "SilentSuya", "Lagos_Shadow", "NoCatchMe", "JollofGhost",
    "HideAndSeekBaba", "Captain_Coins", "Ada_From_Enugu", "Kano_Kid", "SneakyChidi", "QuietKemi", "Drone_Whisperer", "PuffPuffPhantom",
    "Mr_Peekaboo", "LadyInvisible", "ZoboZombie", "SuyaSpy", "Okada_Ghost", "OgaHunter", "NeverFound", "PepperSoupPhantom",
  ],
  rumour: [
    "the bot likes hiding near water", "the bot hates the #landmark#", "ghosts love rooftops when it rains", "the hunters split into teams",
    "someone found a secret floor in a tower", "the next round will be huge", "a drone got stuck in a tree", "a pigeon is working for the hunters",
    "the Ferris wheel goes faster at night", "there's a ghost who never moves, ever",
  ],
  t_place: [
    "{place.cap} is the best spot in the city, if you ask me.", "I've been coming to {place} for years.", "The lift in this building has moods.",
    "From {place} you can see half the hunt.", "Someone keeps eating my lunch around here.", "The view from {place} is not bad at all.",
    "They're always fixing something in {place}. Always.", "If these walls could talk, they'd never stop.", "{place.cap} is quiet today. Too quiet.",
    "Best seat in {place}? The one by the window. Fight me.",
  ],
  t_advice: ["#advice#", "#advice_lead# #advice#", "#advice# #advice_tail#", "#advice_lead# #advice# #advice_tail#"],
  advice_lead: [
    "My advice?", "Listen:", "Here's what {friend} told me:", "Take this one for free:", "Write this down:", "One thing I've learned:", "Simple:",
    "From someone who's seen {age} years:", "Old {from} wisdom:", "Free advice, worth every penny:",
  ],
  advice_tail: ["Trust me.", "It works for me.", "That's how I survived {from}.", "You can thank me later.", "Mostly.", "Don't tell anyone I said it.", "Even the bot knows that."],
  advice: [
    "Never trust a quiet street.", "Drink water. That's it. That's the advice.", "Don't spend all your mint in one round.",
    "Move when nobody expects it.", "Always have a plan B. And some puff-puff.", "If a hunter looks too confident, they're bluffing.",
    "Small small. That's how you climb.", "Be nice to the security guard. You'll thank me later.", "The early hunter catches the ghost.",
    "Life is short. Eat the jollof.", "Laugh more. It confuses your enemies.", "Save your mint for a rainy round.",
    "Rest when you're tired, not when you're finished.", "Ask questions. The people who know things love to talk.",
  ],
  t_lore: ["#lore_old#", "#lore_lead# #lore_fact#.", "#lore_lead# #lore_fact#. #lore_after#"],
  lore_lead: ["They say", "Old people say", "Legend has it that", "My grandma swears", "In {from} they tell it like this:", "Nobody believes me, but", "Story, story:", "Long ago,"],
  lore_fact: [
    "the old clock tower stops at midnight when a ghost walks past", "a balloon once floated for a whole year without landing", "the river hums when a hunter is near",
    "the first bot was built from an old radio and a lot of hope", "every pigeon in this city reports to one very old pigeon", "the #landmark# moves one step every hundred rounds",
    "a ghost once hid inside a billboard and became an advert", "the market was here before the city, and the city grew around it", "the wind turbines whisper the names of past winners",
    "a hunter searched every tile in one round and still found nobody", "the Ferris wheel turns backwards on the night of a full moon", "the lake has a door at the bottom",
    "a #animal# once won the hunt by sitting still for an hour", "the city's first street was drawn with a stick of chalk", "the drones dream of flying home to the sea",
  ],
  lore_after: ["Believe it or not.", "I didn't make it up. #friend.cap# did.", "Spooky, eh?", "That's the story.", "Ask anyone old enough.", ""],
  lore_old: [
    "They say the old clock tower stops at midnight when a ghost walks past.", "Long ago, the whole city was one big market. You can still smell it.",
    "My grandma said the river remembers everyone who crosses it.", "There was a hunter once who never missed. Then he met the bot.",
    "Legend says one balloon never lands. It just floats around, watching.", "The first ghost of this city hid so well, they're still hiding.",
    "Every billboard hides a story. Some hide mint.", "The #landmark# was built in one night, they say. Nobody saw who built it.",
    "Old folks say if you hear a talking drum at night, a ghost is moving.", "This city grows a little every round. Nobody knows where the new streets come from.",
    "There's a tale about a tortoise who hid inside a drum and won the whole hunt.",
  ],
  t_money: [
    "Money is good, but have you tried free food?", "I'm saving for #thing#. Slowly.", "Mint comes, mint goes. Mostly goes.",
    "My bank app says 'insufficient funds'. Rude.", "If I had a thousand mint, I'd buy #thing#.", "Prices in this city are climbing faster than the lift.",
    "Spend small, win big. That's my plan.", "I once found mint in a balloon. True story.",
  ],
  t_love: [
    "Love is like the hunt: you search everywhere and find it next to you.", "#friend.cap# is getting married. Again.",
    "I met someone on the Ferris wheel once. We got stuck at the top. Romantic.", "Single and ready to mingle. Mostly ready.",
    "Aunty keeps asking when I'm getting married. I tell her when jollof is free.", "Love is sharing your last puff-puff. That's real love.",
  ],
  t_work: [
    "Work is work. Being {roleLower.a} is not easy.", "I've been {roleLower.a} for [two|five|ten|twenty] years.", "My boss thinks I'm working right now.",
    "Being {roleLower.a} means you see everything.", "Payday is the best day. Then comes rent day.", "One day I'll retire and play the hunt full-time.",
  ],
  t_tech: [
    "My phone is on two percent. Living dangerously.", "The Wi-Fi here is faster than my legs.", "I bought a drone. It flew away. Free bird.",
    "Everyone is on their phone. Even the pigeons, probably.", "The hunters use the drones like video games.", "I updated my phone and now it's slower. Progress!",
  ],
  t_life: [
    "Life is like a danfo: crowded, loud, but it gets you there.", "Some days you're the hunter, some days you're the ghost.",
    "I just want peace, quiet and a cold #drink#.", "Every day is a gift. Some days are socks, but still.", "We move. Small small.",
    "Enjoy the little things. Like air conditioning.", "Growing up is a scam. Nobody warned me.",
  ],

  // ---------------------------------------------------------------- the NPC asking back
  q_hunt: ["Are you hunting or hiding?", "Which do you prefer, ghost or hunter?", "Have you caught anyone yet?", "Where would you hide?"],
  q_weather: ["Do you like the rain?", "Hot or cold, which is worse?", "Did you bring an umbrella?"],
  q_food: ["What's your favourite food?", "Jollof or fried rice? Choose carefully.", "Have you eaten today?", "Suya or shawarma?"],
  q_music: ["What do you listen to?", "Can you dance?", "Who's your favourite singer?", "Do you sing in the shower?"],
  q_football: ["Which team do you support?", "Did you watch the match?", "Can you play?"],
  q_gossip: ["Have you heard anything juicy?", "Do you know #player_name#?", "Can you keep a secret?"],
  q_place: ["Do you come here often?", "What do you think of {place}?", "Have you been to the roof?"],
  q_advice: ["What would you do?", "Do you ever take advice?", "Who gives you advice?"],
  q_lore: ["Do you believe in legends?", "Have you heard that one before?", "Do you know any old stories?"],
  q_money: ["Are you rich yet?", "What would you buy with a thousand mint?", "Saver or spender?"],
  q_love: ["Are you seeing anyone?", "Do you believe in love at first sight?", "Ever been on a date up a Ferris wheel?"],
  q_work: ["What do you do?", "Do you like your job?", "Day shift or night shift?"],
  q_tech: ["iPhone or Android? Careful.", "How's your battery?", "Do you fly drones?"],
  q_life: ["What makes you happy?", "Are you a morning person?", "What's your dream?"],

  // ---------------------------------------------------------------- what the player can say
  ask_more: ["Tell me more", "Wait, really?", "Go on…", "And then?", "No way. Gist me more", "Seriously?", "Keep talking", "Explain!"],
  ask_hunt: ["How's the hunt going?", "Seen any hunters?", "Who's winning, ghosts or hunters?", "Where would you hide?", "Any drones around?"],
  ask_weather: ["Nice weather, eh?", "Is it going to rain?", "Hot today, isn't it?", "What's the sky saying?"],
  ask_food: ["What's good to eat around here?", "Jollof or fried rice?", "I'm hungry. Ideas?", "Best suya in town?", "What did you eat today?"],
  ask_music: ["What are you listening to?", "Who's the best DJ here?", "Can you dance?", "Favourite song?"],
  ask_football: ["Did you watch the match?", "Which team do you support?", "Who wins the league?", "Football talk?"],
  ask_gossip: ["Any gist?", "What's the latest gossip?", "Spill the tea", "Heard anything funny today?"],
  ask_place: ["What's this place like?", "Been here long?", "What's the best spot here?", "Anything interesting here?"],
  ask_advice: ["Any advice for me?", "What should I do with my mint?", "Got any life tips?", "Help me decide something?"],
  ask_lore: ["Tell me a city legend", "Any old stories about this place?", "What's the history here?", "Know any spooky tales?"],
  ask_money: ["How's business?", "Are you rich?", "What would you buy with a million mint?", "Money talk?"],
  ask_love: ["Are you single?", "Any love stories?", "What's love, anyway?", "Got a crush?"],
  ask_work: ["What's your job like?", "Do you like being {roleLower.a}?", "Busy day at work?", "How did you become {roleLower.a}?"],
  ask_tech: ["What phone do you use?", "Seen the drones up close?", "Is the Wi-Fi good here?", "Tech talk?"],
  ask_life: ["What's the meaning of life?", "Are you happy?", "What's your dream?", "Life lessons?"],
  ask_about: ["Tell me about yourself", "Who are you, really?", "Where are you from?", "What's your story?", "Where did you grow up?"],
  ask_hint: ["Heard anything about the ghosts?", "Any gist on where people are hiding?", "Seen any ghosts around?", "Where are the ghosts hiding?", "Any clues for me?", "Know any good hiding spots that are taken?"],
  ask_gift: ["Business is slow today…", "I'm a bit broke, to be honest", "Can you spare a little mint?", "Abeg, help a friend out", "My pocket is crying today"],
  ask_quest: ["Need a hand with anything?", "Got any jobs for me?", "Can I help you with something?", "I'm bored. Give me a mission", "Any errands?"],
  ask_joke: ["Tell me a joke", "Make me laugh", "Say something funny", "Got any jokes?"],
  ask_riddle: ["Give me a riddle", "Test my brain", "Riddle me this. No wait, you go first", "I love riddles. Try me"],
  ask_fortune: ["Read my fortune", "What does my future hold?", "Will I win this round?", "Tell me my destiny"],
  ask_sell: ["What are you selling?", "Show me your goods", "What's the last price?", "Any deals today?"],
  ask_compliment: ["I like your style", "You're funny", "You seem nice", "Love the outfit", "You're the best person here"],
  ask_tease: ["You talk too much", "Are you always like this?", "Hmm, suspicious", "I don't believe you"],
  ask_npc: ["Wait, are you an NPC?", "Are you real?", "Are you a bot?", "Is this all a game?"],
  ask_bye: ["Bye for now!", "Gotta go, see you!", "Later!", "Nice chatting!", "I'll be back", "Let me go and hunt", "I need to go and hide", "Catch you later, {first}"],

  // A few words the player sometimes starts with.
  ask_lead: ["So,", "Hey,", "Okay,", "Quick question:", "{first},", "Tell me,", "Be honest:", "Abeg,", "Wait,", "Oya,", "Hmm,", "Listen,", "{first}, quick one:"],

  // ---------------------------------------------------------------- about them
  about_me: [
    "I'm {first}, {age}, {roleLower}. From {from}. That's the short version.", "Born in {from}, living in {place}, working as {roleLower.a}. Life!",
    "{nick}, that's what they call me. I'm {roleLower.a} by day and a legend by night.", "I'm {age}. Don't tell anyone. I look younger, I know.",
    "I've been {roleLower.a} for a while. Before that, I sold #street_food# in {from}.", "Not much to say: {roleLower}, {age}, loves #thing#.",
    "My mother named me {first}. My friends named me {nick}. My boss calls me 'you there'.",
  ],
  npc_meta: [
    "NPC? I prefer 'Non-Paying Customer'.", "I'm a regular. I'm part of {place}. I'm always here, in a way.", "Real? I'm as real as the jollof in this city.",
    "A bot? Please. The bot is the purple one that hides. I'm just {first}.", "Yes, I'm one of the city's people. We don't play, we watch. And talk.",
    "If I'm not real, who's been eating my lunch?", "I'm an NPC, darling. Neighbourhood Personality Character.", "NPC means Nice Person, Certified.",
    "I'm an NPC, yes. No mint at stake for me, just vibes.", "I'm part of the city, like the #landmark#. Just chattier.",
    "Real enough to know you haven't eaten. #q_food#", "An NPC? Na so. But I'm the most interesting one around {place}.",
  ],
  deflect: [
    "I didn't quite catch that, but #react_ok.lower#", "Hmm. Anyway…", "Interesting. Very interesting. Anyway!", "Say that again in simple English?",
    "You lost me there. Let's talk about something else.", "I'll pretend I understood that.", "Big grammar! Anyway…", "#exclaim#, you've lost me.",
    "Is that a riddle? I'm bad at riddles. Anyway,", "My ears are full of #genre#, say it again later.", "Ehn? Okay. Let me tell you something instead:",
    "You sound like my {friend}. Nobody understands them either.", "I'll think about that. Meanwhile,",
  ],
  echo: ["You said {word}? #react_wow#", "{word.cap}! Now you're talking.", "Ah, {word}. My favourite subject.", "{word.cap}, eh?"],
  bye: [
    "Bye! Come back anytime.", "Take care of yourself out there.", "See you around, {player}!", "Safe journey!", "Go well!", "Later, friend.",
    "Don't get caught!", "May your searches be lucky!", "Bye bye. Mind the drones.", "Ka dimkpa! Stay strong.", "O dabọ!", "Sai anjima!",
  ],
  compliment_back: ["#thanks# #thanks_tail#", "#thanks#", "#exclaim#! #thanks# #thanks_tail#"],
  thanks: [
    "Thank you!", "Aww, stop it. Don't stop.", "I know, I know. But thank you.", "You've made my day!", "Ah, you're too kind.", "Flattery will get you everywhere.",
    "Say it louder, so {place} can hear!", "My mother always said so.", "You have good taste.", "E se! Thank you!", "Daalụ! Thank you!", "Na gode!",
  ],
  thanks_tail: [
    "You're not bad yourself.", "I'm telling everyone you said that.", "Come back tomorrow and say it again.", "Now I'm blushing.", "That's the nicest thing I've heard since {time_ago}.",
    "I'll remember you.", "Keep talking like that.", "",
  ],
  tease_back: ["#tease_core# #tease_tail#", "#tease_core#", "#exclaim#! #tease_core#"],
  tease_core: [
    "Ehn? Who sent you?", "Rude! I like you.", "And you? Look at you.", "I'll pretend I didn't hear that.", "Haha, okay, okay.", "Is that how they greet people in your house?",
    "My {friend} talks to me better than that.", "Wow. Straight for the heart.", "I've been insulted by pigeons with more style.", "Careful, I know where the drones are. I don't, but careful.",
  ],
  tease_tail: ["Anyway.", "I forgive you. Barely.", "Try again tomorrow.", "We move.", "I'm still smiling, see?", ""],
  quirk: ["#exclaim#.", "Anyway.", "Just saying.", "Ehen!", "You know how it is."],

  // ---------------------------------------------------------------- clues
  hint_offer: [
    "Psst. Come closer.", "Okay, listen. I shouldn't say this…", "You want to know something?", "Let me tell you something small.", "Lower your voice.",
    "Let me check my sources…", "Hmm, let me think who told me what…", "Ehen! I heard something.", "Look left. Look right. Okay.",
  ],
  hint_real: [
    "Psst… I heard there are about {count} ghosts around {area}. Don't tell anyone I told you.",
    "Between you and me: about {count} ghosts are hiding around {area}. You didn't hear it from me.",
    "#friend.cap# saw about {count} ghosts sneaking around {area}. That's all I know. Shh!",
    "Word on the street is about {count} ghosts near {area}. Go gently.",
    "I'm only telling you because I like you: around {area}, about {count} ghosts. Mouth shut, okay?",
  ],
  hint_real_one: [
    "Psst… I heard there's a ghost somewhere around {area}. Just one. Don't tell anyone I told you.",
    "Between you and me, someone's hiding around {area}. You didn't hear it from me.",
    "#friend.cap# saw a ghost sneaking around {area}. That's all I know.",
  ],
  hint_again: ["Like I said: about {count} ghosts around {area}. I don't repeat myself. Except now.", "Same gist as before: around {area}. About {count} of them."],
  hint_none: [
    "Hmm. The streets are quiet today. Too quiet. I've got nothing for you.", "I wish I knew! My sources have gone silent.",
    "Nothing solid. When I hear something, you'll be the first. Maybe the second.", "My gist line is dry today, sorry.",
    "I heard things, but nothing I'd bet on. Ask me another time.", "I've told you everything I know for this hunt.",
  ],
  hint_nohunt: ["No hunt on right now, so no gist. Ask me when the drones are up.", "The ghosts aren't out yet. Come back when the hunt starts."],
  hint_dunno: [
    "Me? I know nothing about ghosts. Ask the gossips.", "Ghosts? I just work here.", "If I knew, I'd be hunting, not talking to you.",
    "No idea. I mind my business. Mostly.", "I don't do ghost gist. Too scary.", "Ask someone who talks too much. That's not me. Mostly.",
    "Ghosts? The only thing I've seen today is #street_food#.", "I'm {roleLower.a}, not a detective.", "If you find out, tell me first!",
    "Hmm, #friend# might know. I don't.", "My eyes were on my phone all day. Sorry!",
  ],
  hint_fake: [
    "Trust me, there are like {count} ghosts hiding around {area}. #friend.cap# saw them with their own eyes.",
    "Oh, easy: {area}. About {count} ghosts. I'm never wrong. Ever.", "Go to {area}. I counted {count} ghosts there myself. Probably.",
    "I KNOW for a fact there are {count} ghosts around {area}. Would I lie to you?",
  ],

  // ---------------------------------------------------------------- coins
  gift_offer: ["You know what? You look like you need small something.", "Wait, wait. Hold on.", "Let me do something nice today."],
  gift_yes: [
    "Here, take {mint} mint. Buy yourself something cold.", "{mint} mint for you. Don't spend it all on #street_food#. Or do.",
    "Take {mint} mint. Pay it forward one day.", "Here: {mint} mint. Go and win something with it!",
  ],
  gift_no: ["I'd love to help, but my wallet is crying today. Next time.", "Not today, my friend. Ask me again another round.", "Ah, I just spent my last mint on #street_food#. Sorry!"],
  gift_already: ["I already gave you something this round! Greedy.", "One gift per round, my dear. Come back next round."],
  gift_cap: ["You've collected enough gifts for one day! Come back tomorrow.", "Ah, you've been to everyone today, eh? Tomorrow!"],
  gift_refuse: [
    "Do I look like a bank?", "I'm broke too, my friend.", "Mint? I was about to ask YOU.", "My pocket has holes in it. Sorry.",
    "Ah, payday is far. Very far.", "I spent my last mint on #street_food#. No regrets.", "If I had mint, would I be {roleLower.a}?",
    "Try the generous ones. I'm the other kind.", "My landlord took everything. Everything!",
  ],

  // ---------------------------------------------------------------- side quests
  quest_offer: ["Actually, I need a favour.", "You look capable. Can I ask you something?", "Funny you're here. I need help."],
  quest_yes: ["Here's the job: {brief} Do this for me: {title}.", "{title}! {brief} Come back and tell me how it went.", "I need someone for this: {title}. {brief}"],
  quest_none: ["Nothing right now. Check back later!", "All my errands are done for today. Can you believe it?", "No jobs today. Enjoy your freedom."],
  quest_refuse: [
    "Jobs? I barely have one myself.", "I don't have any errands for you. But thank you!", "Help? I need help with my own life first.",
    "No missions here. Just vibes.", "Ask around {place}. Someone always needs a hand.", "If I think of something, I'll shout.",
  ],

  // ---------------------------------------------------------------- jokes and riddles
  joke_intro: ["Okay, okay, here's one:", "Listen to this:", "You'll like this one:", "My favourite joke:", "Ready?"],
  joke_after: ["Hahaha! I kill myself.", "Get it? GET IT?", "Thank you, thank you, I'm here all week.", "I'll be here all round."],
  riddle_intro: ["Riddle time!", "Let's test that brain:", "Here's a riddle:", "Try this one:"],
  riddle_right: ["#riddle_praise#", "#riddle_praise# It's {answer}, of course.", "#exclaim#! #riddle_praise#"],
  riddle_praise: [
    "Correct! You're sharp.", "Yes! Big brain.", "Ah, you've heard it before. Or you're a genius.", "Right! I'm impressed.", "Spot on!", "Correct! Who taught you?",
    "Yes! You should be on a quiz show.", "Correct. I'm telling {friend} about you.", "Right! That one usually gets people.",
  ],
  riddle_wrong: ["Nope! It's {answer}.", "Close, but no. It's {answer}!", "Hahaha, no. The answer is {answer}.", "#exclaim#, no! {answer.cap}!", "Wrong, but brave. It's {answer}."],
  riddle_giveup: ["It's {answer}! Easy, no?", "The answer is {answer}. Next time!", "{answer.cap}! You'll get the next one.", "Giving up already? It's {answer}."],
  groan_back: ["#groan_core#", "#groan_core# #groan_tail#"],
  groan_core: [
    "Ehn, you don't like jokes? Okay, okay.", "Tough crowd!", "Fine, I'll save it for someone who appreciates art.", "Wow. Not even a smile?",
    "Your loss. It was my best one.", "Okay, no jokes. Serious face.", "Fine, fine. I'll tell it to the pigeons.", "Who hurt you?",
  ],
  groan_tail: ["It had a great ending.", "{friend.cap} laughed for an hour.", "I'll try again next round.", "Next time it'll be a riddle.", ""],

  // ---------------------------------------------------------------- fortunes (anyone can try)
  fortune: [
    "I see… mint in your future. Or buttons. Something green.", "Your lucky number today is {num}. Don't ask why.", "You will meet a tall hunter. Avoid them.",
    "Something you lost will turn up near the #landmark#.", "A drone will pass you by, and you will smile.", "Your future is bright. Bring sunglasses.",
  ],
  sell: [
    "I've got #ware# going for cheap. Very cheap. Almost free. Not free.", "Customer! #ware.cap#, best price in the city.",
    "For you, special price. #ware.cap#, two for one.", "Today only: #ware#. Tomorrow? Also #ware#.",
  ],
  ware: [
    "phone chargers", "sunglasses for ghosts", "lucky charms", "drone repellent (it's water)", "invisible ink", "fresh tomatoes", "ankara fabric",
    "used maps", "lottery tips", "very loud whistles", "hunter's boots", "a slightly broken radio", "plantain chips", "a hiding blanket", "binoculars",
  ],

  // ---------------------------------------------------------------- room chatter
  chatter_place: [
    "Who left the lift door open around {place}?", "Anyone else hear that drone just now?", "I swear the price of moving goes up every time I blink.",
    "Who do you think wins this round?", "This city looks different every time I wake up.", "Did you see the billboard on the corner? Nice ad.",
    "Hello everyone! First time here?", "I keep hearing sirens. Someone's having a bad day.", "Night shift is my favourite. The lights are beautiful.",
    "{place.cap} is busy today!", "Anyone want #street_food#? I'm buying. Kidding.", "Whose phone keeps ringing?",
  ],
  chatter_reply: [
    "{to}, #react_doubt.lower#", "{to}, you always say that!", "Hahaha {to}, stop it.", "{to}, #react_wow.lower#", "Agree with {to}. #t_life#",
    "{to}, don't start again.", "Facts, {to}. Facts.", "{to}, who told you that?", "Ignore {to}, everyone.", "{to} is right for once.",
  ],
};

/** Moods: rules that colour what someone says while they're in that mood. */
export type Mood = "cheerful" | "grumpy" | "sleepy" | "excited" | "chatty" | "suspicious" | "hungry" | "dreamy" | "stressed" | "playful";
export const MOODS: readonly Mood[] = ["cheerful", "grumpy", "sleepy", "excited", "chatty", "suspicious", "hungry", "dreamy", "stressed", "playful"];

export const MOOD_RULES: Record<Mood, Rules> = {
  cheerful: {
    mood_line: ["What a lovely day!", "I'm feeling great today, don't spoil it.", "Everything is sweet today.", "Smile! It's free."],
    react_ok: ["Lovely!", "Beautiful.", "Yes yes yes."],
  },
  grumpy: {
    mood_line: ["Don't mind me, I woke up on the wrong side of the bed.", "Today is not my day.", "Everything is annoying me today. Not you. Yet."],
    react_ok: ["Hmph.", "Whatever.", "Fine.", "If you say so."],
    hello: ["What?", "Yes?", "Hmm. Hello.", "Hi. I suppose."],
  },
  sleepy: {
    mood_line: ["(yawns) Sorry, long night.", "I could sleep standing up right now.", "Is it bedtime yet? It feels like bedtime."],
    react_ok: ["Mm… okay.", "Sure… (yawns)", "Mhm."],
  },
  excited: {
    mood_line: ["I'm SO excited today! Don't ask why, I don't know!", "Something big is coming, I can feel it!", "Today is the day!"],
    react_wow: ["WHAT?!", "NO WAY!", "Are you SERIOUS?"],
  },
  chatty: {
    mood_line: ["Ah, someone to talk to! Finally!", "Sit, sit. I have SO much to tell you.", "I've been waiting for someone to gist with all day."],
    more_lead: ["And ANOTHER thing:", "Oh, and listen to this:", "Wait, I'm not done:"],
  },
  suspicious: {
    mood_line: ["Who sent you?", "You look like a hunter. Are you a hunter?", "I'm watching you. Nicely."],
    react_doubt: ["Hmm. Suspicious.", "That's exactly what a hunter would say.", "I don't trust that answer."],
  },
  hungry: {
    mood_line: ["I'm so hungry I could eat a whole pot of jollof.", "Is that #street_food# I smell?", "Talk fast, I need to find food."],
    thing: ["food", "jollof", "suya", "puff-puff", "lunch", "dinner"],
  },
  dreamy: {
    mood_line: ["I was just daydreaming about #thing#.", "Isn't the sky beautiful today?", "I feel like writing a song."],
  },
  stressed: {
    mood_line: ["Don't mind me, my boss is on my neck.", "Too many things to do today!", "My phone hasn't stopped ringing."],
    react_ok: ["Okay, okay, fine.", "Sure. Quickly.", "Yes, yes."],
  },
  playful: {
    mood_line: ["Want to hear something funny?", "Guess what I'm thinking. Wrong!", "I'm in a silly mood today."],
    react_laugh: ["Hahaha! You get me.", "HAHA, stop!", "Okay, you're officially funny."],
  },
};
