// Names for the city's people: first names and surnames from all over (lots of Nigeria and
// the rest of Africa, plus the wider world), street nicknames, titles and hometowns.
// Mixed together they make hundreds of thousands of different people.

export const FIRST_NAMES: readonly string[] = [
  // Yoruba
  "Adebayo", "Adeola", "Adewale", "Ayomide", "Bimpe", "Bisi", "Bolanle", "Damilola", "Dayo", "Femi", "Folake", "Funke", "Funmi",
  "Gbenga", "Ife", "Kemi", "Kunle", "Lanre", "Lola", "Morayo", "Niyi", "Olumide", "Seun", "Segun", "Sola", "Taiwo", "Kehinde",
  "Tolu", "Tunde", "Wale", "Yemi", "Yetunde", "Bukola", "Biodun", "Toyin", "Jumoke", "Remi", "Shade", "Tobi", "Kayode", "Ronke",
  "Abike", "Akin", "Dele", "Ebun", "Iyabo", "Jide", "Laide", "Moji", "Ope", "Peju", "Sanmi", "Titi", "Yinka", "Bayo", "Deji",
  // Igbo
  "Adaeze", "Amaka", "Chidi", "Chiamaka", "Chinedu", "Chioma", "Ebuka", "Emeka", "Ifeanyi", "Ifeoma", "Ikenna", "Kelechi", "Nkechi",
  "Nnamdi", "Obinna", "Ngozi", "Uche", "Ugochi", "Obiageli", "Chukwudi", "Somto", "Kosi", "Chisom", "Onyeka", "Nneka", "Ada",
  "Ezinne", "Oge", "Chibuzor", "Tochukwu", "Uzoma", "Echezona", "Nwanneka", "Ijeoma", "Chiboy", "Kamsi", "Obiora", "Zikora",
  // Hausa / Fulani / Kanuri
  "Aisha", "Abubakar", "Amina", "Bello", "Fatima", "Garba", "Hadiza", "Halima", "Hauwa", "Ibrahim", "Musa", "Sani", "Usman",
  "Yusuf", "Zainab", "Bilkisu", "Habiba", "Jamilu", "Kabiru", "Lawal", "Maryam", "Nasiru", "Rabi", "Salisu", "Umar", "Zara",
  "Aminu", "Balarabe", "Danjuma", "Hafsat", "Kulu", "Murtala", "Saratu", "Shehu", "Tanko", "Yakubu",
  // Edo, Efik, Ibibio, Ijaw, Tiv, Urhobo, Itsekiri, Igala
  "Osas", "Osaro", "Efosa", "Eki", "Itohan", "Uyi", "Ekaette", "Ekom", "Ini", "Etim", "Ima", "Edidiong", "Ebiere", "Tari",
  "Timi", "Preye", "Tamuno", "Terver", "Msughter", "Doowuese", "Mfon", "Akpan", "Ofure", "Ejiro", "Oghenekaro", "Tega",
  "Onome", "Eyitayo", "Ojonugwa", "Ufedo",
  // Rest of Africa
  "Kwame", "Kofi", "Ama", "Akosua", "Yaw", "Esi", "Kojo", "Abena", "Afia", "Kwabena", "Nana", "Efua", "Wanjiru", "Kamau",
  "Njeri", "Otieno", "Achieng", "Wambui", "Mwangi", "Zawadi", "Baraka", "Imani", "Thabo", "Naledi", "Sipho", "Lerato",
  "Themba", "Zanele", "Mandla", "Nomvula", "Lindiwe", "Bongani", "Fatou", "Moussa", "Awa", "Mamadou", "Aminata", "Ousmane",
  "Seydou", "Mariama", "Abebe", "Tigist", "Selam", "Dawit", "Hana", "Yonas", "Chipo", "Tendai", "Rudo", "Farai", "Tatenda",
  "Kagiso", "Mpho", "Amara", "Nia", "Jabari", "Femi", "Kaya", "Makena", "Ayo", "Nala", "Tumelo", "Chilufya", "Mulenga",
  "Kasongo", "Mbali", "Ngugi", "Wairimu", "Yaa", "Kweku", "Sekou", "Adama", "Ibou", "Rokia", "Habib", "Youssef", "Nadia",
  "Karim", "Leila", "Samir", "Amira", "Omar", "Tariq", "Salma",
  // The wider world
  "Grace", "Daniel", "Mary", "Samuel", "Joy", "David", "Esther", "Michael", "Blessing", "Peter", "Victor", "Ruth", "Faith",
  "Emmanuel", "Precious", "Godwin", "Patience", "Favour", "Gift", "Prince", "Princess", "Mercy", "Goodluck", "Sunday",
  "Monday", "Friday", "Comfort", "Charity", "Promise", "Destiny", "Miracle", "Testimony", "Wisdom", "Kingsley", "Stanley",
  "Bernard", "Beatrice", "Agnes", "Florence", "Lucy", "Henry", "Oliver", "Emma", "Jack", "Sophie", "Harry", "Chloe",
  "Liam", "Mia", "Noah", "Ava", "Leo", "Sofia", "Lina", "Lucas", "Mateo", "Valentina", "Diego", "Camila", "Carlos", "Lucia",
  "Pablo", "Marisol", "Joao", "Ana", "Thiago", "Bruna", "Pierre", "Amelie", "Louis", "Chantal", "Hans", "Greta", "Klaus",
  "Ingrid", "Sven", "Astrid", "Nikolai", "Olga", "Dmitri", "Anya", "Giulia", "Marco", "Francesca", "Luca", "Aarav", "Priya",
  "Rohan", "Ananya", "Vikram", "Meera", "Arjun", "Deepa", "Wei", "Mei", "Jun", "Lin", "Hiro", "Yuki", "Kenji", "Sakura",
  "Min-jun", "Ji-woo", "Seo-yeon", "Tuan", "Linh", "Siti", "Budi", "Putri", "Rizal", "Maria", "Jose", "Imelda", "Kai",
  "Leilani", "Mateus", "Elif", "Emre", "Zeynep", "Mehmet", "Noor", "Rania", "Yara", "Ali", "Hassan", "Reza", "Shirin",
  "Dara", "Aoife", "Sean", "Niamh", "Finn", "Isla", "Malik", "Jamal", "Keisha", "Tyrone", "Shanice", "Marcus", "Andre",
];

export const SURNAMES: readonly string[] = [
  // Nigeria
  "Adeyemi", "Adebayo", "Afolabi", "Ajayi", "Akande", "Alabi", "Babatunde", "Bakare", "Balogun", "Coker", "Dada", "Fashola",
  "Lawal", "Ogunleye", "Okafor", "Okeke", "Okonkwo", "Okoro", "Oladipo", "Olatunji", "Olawale", "Onyekachi", "Oyelaran",
  "Salami", "Sanni", "Taiwo", "Uba", "Ugwu", "Eze", "Nwosu", "Nwachukwu", "Obi", "Okoye", "Anozie", "Chukwu", "Ibe",
  "Igwe", "Mbah", "Nnaji", "Onuoha", "Abdullahi", "Aliyu", "Bello", "Danladi", "Garba", "Ibrahim", "Lawan", "Mohammed",
  "Musa", "Suleiman", "Umar", "Yahaya", "Zubairu", "Usman", "Idris", "Edet", "Effiong", "Ekpo", "Etuk", "Udoh", "Inyang",
  "Bassey", "Okon", "Ekanem", "Osagie", "Igbinedion", "Omoregie", "Osayande", "Ehigiator", "Tonye", "Briggs", "Dokubo",
  "Ayu", "Tor", "Iorhemba", "Oghene", "Ejiofor", "Ovie", "Omotola", "Oyewole", "Adegoke", "Akinola",
  "Ogundipe", "Oyebanji", "Fagbemi", "Adelakun", "Ilori", "Ojo", "Ige", "Ola", "Kalu", "Ndukwe", "Agu", "Oti",
  // Rest of Africa
  "Mensah", "Owusu", "Boateng", "Asante", "Appiah", "Osei", "Darko", "Addo", "Kariuki", "Otieno", "Mwangi", "Njoroge",
  "Ochieng", "Wanjala", "Dlamini", "Nkosi", "Ndlovu", "Mokoena", "Khumalo", "Zulu", "Diallo", "Ndiaye", "Diop", "Traore",
  "Keita", "Toure", "Kone", "Sow", "Tesfaye", "Bekele", "Haile", "Moyo", "Chikwanha", "Banda", "Phiri", "Mutua", "Kamara",
  "Sesay", "Conteh", "El-Amin", "Haddad", "Mansour", "Benali", "Tshabalala", "Mabaso",
  // The wider world
  "Smith", "Brown", "Taylor", "Walker", "Clarke", "Murphy", "Kelly", "Garcia", "Martinez", "Lopez", "Silva", "Santos",
  "Costa", "Dubois", "Moreau", "Laurent", "Muller", "Schmidt", "Fischer", "Rossi", "Russo", "Bianchi", "Ivanov", "Petrova",
  "Novak", "Kowalski", "Jensen", "Larsen", "Sato", "Tanaka", "Suzuki", "Kim", "Park", "Lee", "Chen", "Wang", "Li", "Zhang",
  "Nguyen", "Tran", "Patel", "Sharma", "Singh", "Gupta", "Khan", "Hussain", "Yilmaz", "Demir", "Haddad", "Cohen", "Levi",
  "O'Brien", "Byrne", "Reyes", "Cruz", "Torres", "Ramos", "Mendoza", "Okafor-Smith", "Johnson", "Williams", "Jackson",
];

/** Street nicknames ("aka …"). */
export const NICKNAMES: readonly string[] = [
  "Pepper", "Shakara", "Gbedu", "Sisi Eko", "Ajebo", "Bobo Lagos", "Jollof King", "Jollof Queen", "Akara Queen", "Suya Lord",
  "Kpakpando", "Omo Ologo", "Small Pikin", "Big Tee", "Baba Nla", "Sharp Guy", "Correct Person", "Mr Fix-It", "Madam Gist",
  "Gist Master", "Lord of the Lift", "Captain Vibes", "DJ Pepper Soup", "Tiger", "Lion Heart", "Eagle Eye",
  "Mr Calculator", "Mama Put", "Professor", "The Oracle", "Chairman", "Odogwu", "Ebube", "Oga Boss", "Baby Face", "Blessed",
  "Big Bros", "Small Madam", "Fine Boy", "Fine Girl", "Mr Money", "Mint Collector", "Night Owl", "Early Bird", "Flash",
  "Speedometer", "Slowly-Slowly", "Kerosene", "Generator", "NEPA", "Danfo", "Keke", "Okada", "Agege", "Puff-Puff",
  "Chin-Chin", "Zobo", "Kunu", "Kilishi", "Garri", "Moi-Moi", "Plantain", "Dodo", "Pepper Soup", "Egusi", "Ofada",
  "Amala", "Tuwo", "Fura", "Shawarma", "Kokoro", "Boli", "Twinkle", "Sparkle", "Thunder", "Lightning",
  "Rainbow", "Sunshine", "Moonlight", "Big Daddy", "Big Mummy", "Aunty Sweet", "Uncle Wise", "Cool Breeze",
  "Lagos Big Boy", "Abuja Chic", "Kano Prince", "Enugu Coal", "Ibadan Original", "PH Pikin", "Jos Cold", "Calabar Kitchen",
  "Accra Smooth", "Nairobi Runner", "Joburg Groove", "Dakar Breeze", "Cairo Sun", "Mr Wahala", "No Wahala", "Calm Down",
  "Soft Life", "Hard Guy", "Mr Gentle", "Detective", "Inspector", "Shadow", "Ghostbuster", "Ghost Whisperer", "Drone Boy",
  "Map Reader", "Radar", "Compass", "Satellite", "Antenna", "Wi-Fi", "Bluetooth", "Battery Low", "Full Charge",
  "Mr Network", "Data Bundle", "Airtime", "Recharge Card", "POS", "Change Collector", "Bargain Hunter", "Last Price",
];

/** Titles that go in front of a first name ("Coach Amaka", "Chief Tunde"). Kept gender-neutral. */
export const TITLES: readonly string[] = [
  "Dr", "Prof", "Coach", "Chief", "Captain", "Engineer", "Barrister", "Oga", "Big", "Lil", "Young", "Comrade", "DJ",
  "Officer", "Nurse", "Professor", "Saint",
];

/** Where people say they're from. */
export const HOMETOWNS: readonly string[] = [
  "Lagos", "Ibadan", "Abeokuta", "Ogbomoso", "Ilorin", "Oshogbo", "Akure", "Ado-Ekiti", "Ife", "Ijebu-Ode", "Benin City",
  "Warri", "Asaba", "Onitsha", "Enugu", "Owerri", "Aba", "Umuahia", "Awka", "Nsukka", "Port Harcourt", "Yenagoa",
  "Calabar", "Uyo", "Makurdi", "Jos", "Lokoja", "Abuja", "Kaduna", "Zaria", "Kano", "Katsina", "Sokoto", "Maiduguri",
  "Bauchi", "Gombe", "Yola", "Minna", "Bida", "Okene", "Badagry", "Epe", "Ikorodu", "Agege", "Surulere", "Ajegunle",
  "Accra", "Kumasi", "Tamale", "Nairobi", "Mombasa", "Kisumu", "Kampala", "Dar es Salaam", "Kigali", "Addis Ababa",
  "Johannesburg", "Cape Town", "Durban", "Soweto", "Harare", "Lusaka", "Lilongwe", "Dakar", "Bamako", "Abidjan", "Lome",
  "Cotonou", "Freetown", "Monrovia", "Douala", "Yaounde", "Kinshasa", "Luanda", "Cairo", "Casablanca", "Tunis",
  "London", "Manchester", "Houston", "Atlanta", "New York", "Toronto", "Paris", "Berlin", "Rome", "Madrid", "Lisbon",
  "Rio", "Sao Paulo", "Mexico City", "Mumbai", "Delhi", "Dubai", "Istanbul", "Beijing", "Tokyo", "Seoul", "Manila",
  "Jakarta", "Sydney", "a village you've never heard of", "the next street", "upstairs", "nowhere in particular",
];
