// Impostor's word boards (docs/PARTY_GAMES.md): a category and twelve words. Everyone sees the
// board; all but the impostor are told which word it is. Keep every board exactly twelve words,
// close enough to each other that a vague clue could fit several.

export type Board = { category: string; icon: string; words: string[] };

export const BOARDS: Board[] = [
  { category: "Naija food", icon: "🍲", words: ["Jollof", "Suya", "Puff-puff", "Egusi", "Amala", "Moi moi", "Akara", "Pounded yam", "Chin chin", "Pepper soup", "Dodo", "Ofada"] },
  { category: "Around Lagos", icon: "🌆", words: ["Third Mainland", "Lekki", "Balogun", "Ikeja", "Danfo", "Okada", "Keke", "Traffic", "Beach", "Island", "Bridge", "Market"] },
  { category: "At the owambe", icon: "🎉", words: ["Aso ebi", "Gele", "Small chops", "DJ", "Spraying", "MC", "Cake", "Souvenir", "Dance floor", "Cooler", "Band", "Auntie"] },
  { category: "Jobs", icon: "💼", words: ["Doctor", "Teacher", "Pilot", "Lawyer", "Chef", "Tailor", "Barber", "Mechanic", "Banker", "Farmer", "Nurse", "Driver"] },
  { category: "Animals", icon: "🦁", words: ["Lion", "Goat", "Snake", "Eagle", "Crocodile", "Tortoise", "Elephant", "Monkey", "Chicken", "Shark", "Owl", "Cow"] },
  { category: "In the kitchen", icon: "🍳", words: ["Pot", "Spoon", "Blender", "Fridge", "Knife", "Gas", "Mortar", "Plate", "Kettle", "Sieve", "Grater", "Oven"] },
  { category: "Sports", icon: "⚽", words: ["Football", "Boxing", "Tennis", "Swimming", "Basketball", "Wrestling", "Running", "Golf", "Volleyball", "Chess", "Cycling", "Table tennis"] },
  { category: "Getting around", icon: "🚌", words: ["Bus", "Train", "Plane", "Boat", "Bicycle", "Taxi", "Helicopter", "Lorry", "Canoe", "Motorbike", "Ferry", "Skateboard"] },
  { category: "School days", icon: "🎒", words: ["Exam", "Uniform", "Assembly", "Prefect", "Cane", "Library", "Homework", "Break time", "Chalk", "Hostel", "Report card", "Lab"] },
  { category: "Weather and sky", icon: "⛅", words: ["Rain", "Harmattan", "Thunder", "Rainbow", "Sun", "Moon", "Storm", "Fog", "Stars", "Wind", "Heat", "Cloud"] },
  { category: "At home", icon: "🏠", words: ["Sofa", "Generator", "Ceiling fan", "Mirror", "Curtain", "Bed", "Remote", "Wardrobe", "Doorbell", "Rug", "Lamp", "Bucket"] },
  { category: "Money moves", icon: "💸", words: ["Salary", "Loan", "Ajo", "Bitcoin", "Shares", "Landed property", "Side hustle", "Savings", "Tax", "Bonus", "Debt", "Lottery"] },
  { category: "Love life", icon: "💘", words: ["First date", "Crush", "Ex", "Wedding", "Ring", "Breakup", "Valentine", "Love letter", "Situationship", "Honeymoon", "Flowers", "Proposal"] },
  { category: "On your phone", icon: "📱", words: ["Selfie", "Voice note", "Status", "Data", "Charger", "Ringtone", "Wallpaper", "Group chat", "Screenshot", "Emoji", "Airtime", "Alarm"] },
];

export const BOARD_SIZE = 12;
