// Real-world flavours for each round's city: its name, and the kinds of names its streets get.

export type Flavor = {
  id: string;
  weight: number;
  cities: string[];
  streets: string[];
  suffixes: string[];
  markets?: string[];
};

// ---------------------------------------------------------------- landmarks and easter eggs
//
// Real, well-known places (and a few made-up local favourites) used as the names of this
// round's big buildings, bridges, parks, stadiums, clubs, restaurants... so a city named after
// Lagos has a Unilag campus, a Third Mainland Bridge and a suya spot on the corner. Names are
// picked per city first (e.g. "Yaba"), then from the flavour as a whole (e.g. all of Nigeria).

/** What a name can be given to: big buildings (structure types) and single-tile places. */
export type LandmarkKey =
  | "mall" | "twin" | "museum" | "funfair" | "market" | "arena" | "campus" | "hotel" | "solar" | "airport" | "port" | "military" | "power" | "dam" | "oilrig" | "waterpark"
  | "bridge" | "stadium" | "ferris" | "park" | "plaza" | "hospital" | "police" | "fire" | "clock" | "tower" | "club" | "restaurant" | "station" | "pond";

/**
 * A named place: just a name, or a name plus the names of the rooms inside it (its levels, in
 * order) and of the popular spots around it (a university's lagoon front, its canteen...).
 */
export type Named = string | { name: string; inside?: string[]; around?: Partial<Record<LandmarkKey, string[]>> };
export type Landmarks = Partial<Record<LandmarkKey, Named[]>>;

/** Little decorations with names (shown on hover): a suya spot, a danfo park, a phone box... */
export type EggKind = "grill" | "minibus" | "stall" | "bigbus" | "tricycle" | "mural" | "phonebox" | "cabs" | "cart";
export type EasterEgg = { kind: EggKind; name: string; /** Main colour (buses, cabs, stalls). */ color?: number };

export const nameOf = (n: Named) => (typeof n === "string" ? n : n.name);

export const FLAVORS: Flavor[] = [
  {
    id: "ng",
    weight: 45,
    cities: ["Ikeja", "Lekki", "Yaba", "Surulere", "Victoria Island", "Ikoyi", "Abuja", "Ibadan", "Port Harcourt", "Enugu", "Kano", "Benin City", "Abeokuta", "Jos", "Ilorin", "Owerri"],
    streets: [
      "Adekunle", "Awolowo", "Allen", "Opebi", "Bode Thomas", "Herbert Macaulay", "Adeola Odeku", "Ozumba Mbadiwe",
      "Ahmadu Bello", "Obafemi", "Adeniran Ogunsanya", "Toyin", "Aromire", "Oba Akran", "Isaac John", "Ogunlana",
      "Akin Adesola", "Saka Tinubu", "Ajose Adeogun", "Adetokunbo Ademola", "Kofo Abayomi", "Idowu Taylor", "Akerele",
      "Fola Agoro", "Olowu", "Ladipo", "Ikorodu", "Ojuelegba", "Funsho Williams", "Babs Animashaun", "Coker", "Itire",
      "Muritala Mohammed", "Nnamdi Azikiwe", "Tafawa Balewa", "Okotie-Eboh", "Kudirat Abiola", "Oduduwa", "Emeka Anyaoku",
      "Chief Natufe", "Adebayo", "Olatunji", "Bankole", "Okafor", "Chukwuma", "Ngozi", "Adewale", "Oyinlola",
    ],
    suffixes: ["Street", "Street", "Road", "Avenue", "Close", "Crescent", "Way"],
    markets: ["Balogun Market", "Computer Village", "Tejuosho Market", "Oshodi Market", "Alaba Market", "Mile 12 Market", "Wuse Market", "Oja Oba"],
  },
  {
    id: "us",
    weight: 20,
    cities: ["Chicago", "New York", "Atlanta", "Houston", "Los Angeles", "Seattle", "Miami", "Boston", "Denver", "Austin"],
    streets: [
      "Harvey", "Maple", "Lincoln", "Oak", "Washington", "Madison", "Elm", "Jefferson", "Franklin", "Pine", "Cedar",
      "Grant", "Monroe", "Jackson", "Lake", "Park", "Hill", "Sunset", "Highland", "Walnut", "Chestnut", "Spruce",
      "Willow", "Adams", "Kennedy", "Roosevelt", "Michigan", "Wabash", "Clark", "State", "Dearborn", "Halsted",
      "Ashland", "Western", "Belmont", "Fulton", "Union", "Market", "Broad", "Magnolia",
    ],
    suffixes: ["Street", "Avenue", "Road", "Boulevard", "Drive", "Lane", "Place"],
  },
  {
    id: "uk",
    weight: 12,
    cities: ["London", "Manchester", "Liverpool", "Birmingham", "Leeds", "Edinburgh", "Bristol"],
    streets: [
      "Abbey", "King's", "Baker", "Victoria", "Queen's", "Church", "High", "Mill", "Station", "Albert", "Windsor",
      "Cambridge", "Oxford", "Regent", "Kensington", "Camden", "Brixton", "Peckham", "Portobello", "Carnaby", "Bond",
      "Fleet", "Chancery", "Holborn", "Marylebone", "Hampton", "Chelsea", "Richmond", "Greenwich", "Clapham", "Hackney",
      "Shoreditch", "Islington", "Kingsley", "Elmwood", "Ashby",
    ],
    suffixes: ["Road", "Street", "Lane", "Way", "Gardens", "Terrace", "Row"],
  },
  {
    id: "gh",
    weight: 8,
    cities: ["Accra", "Kumasi", "Tema", "Takoradi"],
    streets: [
      "Nkrumah", "Oxford", "Ring", "Liberation", "Independence", "Castle", "Cantonments", "Osu", "Labone", "Achimota",
      "Spintex", "Danquah", "Aggrey", "Busia", "Kotoka", "Mensah Sarbah", "Kojo Thompson", "Asafoatse", "Nii Okaiman",
      "Adabraka", "Kaneshie", "Dzorwulu", "Airport", "Kanda", "Asylum Down", "Korle Bu", "Makola", "Okponglo",
    ],
    suffixes: ["Street", "Road", "Avenue", "Close", "Link"],
    markets: ["Makola Market", "Kejetia Market", "Kaneshie Market"],
  },
  {
    id: "ke",
    weight: 8,
    cities: ["Nairobi", "Mombasa", "Kisumu", "Nakuru"],
    streets: [
      "Kenyatta", "Moi", "Uhuru", "Ngong", "Kimathi", "Muindi Mbingu", "Koinange", "Biashara", "Tom Mboya",
      "Haile Selassie", "Waiyaki", "Kiambu", "Thika", "Lenana", "Argwings Kodhek", "Mama Ngina", "Wabera", "Kaunda",
      "Banda", "Ronald Ngala", "Luthuli", "Accra", "Latema", "River", "Kilimani", "Lavington", "Riverside", "Muthaiga",
    ],
    suffixes: ["Street", "Road", "Avenue", "Lane", "Way"],
    markets: ["Maasai Market", "Gikomba Market", "City Market"],
  },
  {
    id: "za",
    weight: 7,
    cities: ["Johannesburg", "Cape Town", "Durban", "Pretoria"],
    streets: [
      "Mandela", "Sisulu", "Tambo", "Biko", "Long", "Bree", "Loop", "Commissioner", "Jan Smuts", "Rivonia", "Vilakazi",
      "Main", "Market", "Church", "Kloof", "Victoria", "Oxford", "Corlett", "Louis Botha", "Beyers Naudé", "Jeppe",
      "Fox", "Pritchard", "Juta", "De Korte", "Smit", "Bertha", "Melville",
    ],
    suffixes: ["Street", "Road", "Avenue", "Drive", "Lane"],
  },
];

export const ABBREV: Record<string, string> = {
  Street: "St",
  Road: "Rd",
  Avenue: "Ave",
  Close: "Cl",
  Crescent: "Cres",
  Way: "Way",
  Boulevard: "Blvd",
  Drive: "Dr",
  Lane: "Ln",
  Place: "Pl",
  Gardens: "Gdns",
  Terrace: "Ter",
  Row: "Row",
  Link: "Link",
};

// ---------------------------------------------------------------- the names themselves

const uni = (name: string, inside: string[], around: Partial<Record<LandmarkKey, string[]>>): Named => ({ name, inside, around });

/** Lagos (Ikeja, Lekki, Yaba, Surulere, Victoria Island, Ikoyi all share these). */
const LAGOS: Landmarks = {
  campus: [
    uni("University of Lagos (Unilag)", ["Unilag Main Library", "Senate Building · Lecture theatre"], {
      park: ["Unilag Lagoon Front"],
      plaza: ["Unilag Main Gate", "Senate Building Square"],
      restaurant: ["Akoka Buka", "Unilag Cafeteria"],
      club: ["Akoka Spot"],
      hospital: ["Unilag Medical Centre"],
      pond: ["Unilag Lagoon"],
    }),
    uni("Yaba College of Technology (Yabatech)", ["Yabatech Library", "Lecture hall"], { plaza: ["Yabatech Gate"], restaurant: ["Yaba Buka"], park: ["Yabatech Green"] }),
    uni("Lagos State University (LASU)", ["LASU Library", "Lecture theatre"], { plaza: ["LASU Gate"], restaurant: ["Ojo Mama Put"] }),
    "Pan-Atlantic University",
  ],
  mall: ["Ikeja City Mall", "The Palms Lekki", "Circle Mall", "Novare Lekki Mall", "Adeniran Ogunsanya Mall"],
  market: ["Balogun Market", "Computer Village", "Tejuosho Market", "Oshodi Market", "Alaba International Market", "Lekki Arts & Crafts Market"],
  hotel: ["Eko Hotel & Suites", "Federal Palace Hotel", "Lagos Continental Hotel", "Sheraton Lagos", "Radisson Blu Ikeja"],
  arena: ["Teslim Balogun Stadium", "National Stadium Surulere", "Mobolaji Johnson Arena (Onikan)", "Indoor Sports Hall Surulere"],
  stadium: ["Teslim Balogun Stadium", "Onikan Stadium", "Agege Stadium"],
  museum: ["National Museum Lagos", "Nike Art Gallery", "National Theatre", "Terra Kulture", "Kalakuta Museum"],
  twin: ["Civic Centre Towers", "Eko Atlantic Twin Towers", "Marina Twin Towers"],
  tower: ["Civic Centre Tower", "NECOM House", "Kingsway Building", "Eko Pearl Towers", "Heritage Place"],
  airport: ["Murtala Muhammed International Airport"],
  port: ["Apapa Port", "Tin Can Island Port", "Lekki Deep Sea Port"],
  military: ["Dodan Barracks", "Ikeja Cantonment", "Bonny Camp"],
  power: ["Egbin Power Station", "Ikeja Power Plant"],
  funfair: ["Funtopia Lekki", "Lekki Leisure Lake", "Bar Beach Funfair"],
  waterpark: ["Lekki Splash Water Park", "Atlantic Splash Park", "Whispering Palms Water Park"],
  bridge: ["Third Mainland Bridge", "Carter Bridge", "Eko Bridge", "Lekki-Ikoyi Link Bridge", "Falomo Bridge"],
  park: ["Freedom Park", "Ndubuisi Kanu Park", "Lekki Conservation Centre", "Muri Okunola Park", "Johnson Jakande Tinubu Park"],
  plaza: ["Tafawa Balewa Square", "Lekki Toll Gate", "Ojuelegba Junction", "Allen Roundabout", "Tinubu Square"],
  hospital: ["Lagos University Teaching Hospital (LUTH)", "Lagos Island General Hospital", "Reddington Hospital", "Lagoon Hospital"],
  police: ["Panti (State CID, Yaba)", "Area F Police Station", "Alagbon Close Police", "Bar Beach Police Station"],
  fire: ["Lagos State Fire Service, Alausa", "Ebute Metta Fire Station", "Lekki Fire Station"],
  clock: ["Tinubu Square Clock", "Oshodi Clock Tower"],
  station: ["Mobolaji Johnson Station", "Iddo Terminus", "Marina Blue Line Station", "Yaba Station"],
  ferris: ["Lekki Sky Wheel", "Funtopia Wheel"],
  club: ["Club Gbedu", "Owambe Lounge", "Afrobeat Republic", "Naija Nights Club"],
  restaurant: ["Jollof Junction", "Buka Hut", "Amala Spot", "Pepper Soup Joint", "Chop Life Kitchen"],
};
const lagos = (extra: Landmarks): Landmarks => {
  const out: Landmarks = { ...LAGOS };
  for (const [k, v] of Object.entries(extra) as [LandmarkKey, Named[]][]) out[k] = [...v, ...(LAGOS[k] ?? [])];
  return out;
};

const NG_LOCAL: Record<string, Landmarks> = {
  Ikeja: lagos({
    market: ["Computer Village"],
    mall: ["Ikeja City Mall"],
    club: [{ name: "New Afrika Shrine" }],
    plaza: ["Allen Roundabout", "Ikeja Under Bridge"],
    airport: ["Murtala Muhammed International Airport"],
    hospital: ["Lagos State University Teaching Hospital (LASUTH)"],
  }),
  Lekki: lagos({ plaza: ["Lekki Toll Gate"], mall: ["The Palms Lekki", "Circle Mall"], park: ["Lekki Conservation Centre"], bridge: ["Lekki-Ikoyi Link Bridge"], waterpark: ["Lekki Splash Water Park"] }),
  Yaba: lagos({ campus: [LAGOS.campus![0], LAGOS.campus![1]], market: ["Tejuosho Market"], police: ["Panti (State CID, Yaba)"], plaza: ["Sabo Junction"] }),
  Surulere: lagos({ arena: ["National Stadium Surulere", "Teslim Balogun Stadium"], stadium: ["Teslim Balogun Stadium"], plaza: ["Ojuelegba Junction"] }),
  "Victoria Island": lagos({ hotel: ["Eko Hotel & Suites", "Federal Palace Hotel"], plaza: ["Bar Beach Promenade"], twin: ["Eko Atlantic Twin Towers"], park: ["Muri Okunola Park"] }),
  Ikoyi: lagos({ bridge: ["Falomo Bridge", "Lekki-Ikoyi Link Bridge"], park: ["Ikoyi Club Gardens"], club: ["Ikoyi Club 1938"] }),
  Abuja: {
    campus: [uni("University of Abuja", ["University Library", "Lecture theatre"], { plaza: ["Uniabuja Gate"], restaurant: ["Gwagwalada Buka"] }), "Baze University", "Nile University"],
    mall: ["Jabi Lake Mall", "Ceddi Plaza", "Silverbird Entertainment Centre"],
    market: ["Wuse Market", "Garki Market", "Utako Market"],
    hotel: ["Transcorp Hilton Abuja", "Sheraton Abuja", "Fraser Suites Abuja"],
    arena: ["Moshood Abiola National Stadium", "Package B Arena"],
    stadium: ["Old Parade Ground"],
    park: ["Millennium Park", "Jabi Lake Park", "Central Park Abuja"],
    plaza: ["Eagle Square", "Unity Fountain", "Aso Rock Viewpoint", "Three Arms Zone Gate"],
    pond: ["Jabi Lake"],
    tower: ["NNPC Towers", "Abuja World Trade Center", "Federal Secretariat"],
    twin: ["Abuja World Trade Center Towers"],
    museum: ["National Arts Theatre Abuja", "Nike Art Gallery Abuja"],
    airport: ["Nnamdi Azikiwe International Airport"],
    military: ["Mogadishu Barracks", "Guards Brigade Barracks"],
    hospital: ["National Hospital Abuja"],
    station: ["Abuja Metro Central", "Idu Station"],
    dam: ["Usuma Dam"],
    club: ["Club Aso", "FCT Groove Lounge"],
    restaurant: ["Wuse Suya Palace", "Arewa Kitchen"],
  },
  Ibadan: {
    campus: [uni("University of Ibadan (UI)", ["Kenneth Dike Library", "Trenchard Hall"], { park: ["UI Zoo Gardens"], plaza: ["UI Gate"], restaurant: ["Agbowo Buka"] }), "The Polytechnic Ibadan"],
    tower: ["Cocoa House"],
    clock: ["Mapo Hall", "Bower's Tower"],
    market: ["Dugbe Market", "Oja Oba", "Bodija Market"],
    park: ["Agodi Gardens"],
    arena: ["Lekan Salami Stadium (Adamasingba)", "Obafemi Awolowo Stadium"],
    hospital: ["University College Hospital (UCH)"],
    mall: ["Ventura Mall", "Palms Mall Ibadan"],
    restaurant: ["Amala Skye", "Ibadan Ewa Agoyin"],
  },
  "Port Harcourt": {
    campus: [uni("University of Port Harcourt (Uniport)", ["Uniport Library", "Lecture theatre"], { plaza: ["Choba Gate"], restaurant: ["Choba Bole Spot"] }), "Rivers State University"],
    funfair: ["Port Harcourt Pleasure Park"],
    park: ["Port Harcourt Pleasure Park", "Isaac Boro Park"],
    market: ["Mile One Market", "Creek Road Market", "Oil Mill Market"],
    arena: ["Adokiye Amiesimaka Stadium", "Yakubu Gowon Stadium"],
    airport: ["Port Harcourt International Airport"],
    port: ["Onne Port", "Port Harcourt Wharf"],
    oilrig: ["Bonga Oil Field", "Bonny Island Platform"],
    restaurant: ["Bole & Fish Spot", "Garden City Kitchen"],
  },
  Enugu: {
    campus: [uni("University of Nigeria Enugu Campus (UNEC)", ["UNEC Library", "Lecture theatre"], { plaza: ["UNEC Gate"] }), "Enugu State University (ESUT)"],
    market: ["Ogbete Main Market", "New Market Enugu"],
    arena: ["Nnamdi Azikiwe Stadium"],
    mall: ["Polo Park Mall"],
    airport: ["Akanu Ibiam International Airport"],
    park: ["Murtala Mohammed Park"],
    plaza: ["Okpara Square"],
  },
  Kano: {
    campus: [uni("Bayero University Kano (BUK)", ["BUK Library", "Lecture theatre"], { plaza: ["BUK Gate"] })],
    market: ["Kurmi Market", "Kantin Kwari Market", "Sabon Gari Market"],
    arena: ["Sani Abacha Stadium"],
    museum: ["Gidan Makama Museum", "Emir's Palace"],
    airport: ["Mallam Aminu Kano International Airport"],
    plaza: ["Kofar Mata Dye Pits", "Kofar Nasarawa Gate"],
    restaurant: ["Tuwo Spot", "Kilishi Corner"],
  },
  "Benin City": {
    campus: [uni("University of Benin (Uniben)", ["John Harris Library", "Lecture theatre"], { plaza: ["Uniben Main Gate"] })],
    market: ["Oba Market", "New Benin Market"],
    arena: ["Samuel Ogbemudia Stadium"],
    museum: ["Benin National Museum", "Oba's Palace"],
    plaza: ["Ring Road Roundabout", "King's Square"],
  },
  Abeokuta: {
    campus: [uni("Federal University of Agriculture (FUNAAB)", ["FUNAAB Library", "Lecture theatre"], {})],
    park: ["Olumo Rock"],
    plaza: ["Olumo Rock Gate", "Itoku Adire Market Square"],
    market: ["Itoku Market", "Kuto Market"],
    arena: ["MKO Abiola Stadium"],
  },
  Jos: {
    campus: [uni("University of Jos (Unijos)", ["Unijos Library", "Lecture theatre"], { plaza: ["Unijos Gate"] })],
    park: ["Jos Wildlife Park"],
    museum: ["Jos National Museum"],
    market: ["Terminus Market"],
    arena: ["Rwang Pam Stadium"],
  },
  Ilorin: {
    campus: [uni("University of Ilorin (Unilorin)", ["Unilorin Library", "Lecture theatre"], { plaza: ["Unilorin Gate"] })],
    market: ["Oja Oba Ilorin", "Ipata Market"],
    arena: ["Kwara State Stadium"],
  },
  Owerri: {
    campus: [uni("Federal University of Technology Owerri (FUTO)", ["FUTO Library", "Lecture theatre"], { plaza: ["FUTO Gate"] }), "Imo State University"],
    market: ["Ekeonunwa Market", "Relief Market"],
    arena: ["Dan Anyiam Stadium"],
    mall: ["Owerri Mall"],
    park: ["Heroes Square"],
  },
};

const NG_WIDE: Landmarks = {
  hospital: ["General Hospital", "Federal Medical Centre", "Teaching Hospital"],
  police: ["Divisional Police HQ", "Police Area Command"],
  fire: ["State Fire Service Station", "Federal Fire Service"],
  club: ["Club Gbedu", "Owambe Lounge", "Afrobeat Republic", "Naija Nights Club", "Shayo Lounge"],
  restaurant: ["Jollof Junction", "Buka Hut", "Amala Spot", "Pepper Soup Joint", "Chop Life Kitchen", "Mama Ngozi's Kitchen"],
  waterpark: ["Splash Water Park", "Owambe Splash Park"],
  dam: ["Kainji Dam", "Shiroro Dam", "Jebba Dam"],
  oilrig: ["Bonga Oil Platform", "Agbami Field Rig"],
  power: ["Egbin Power Station", "Afam Power Plant"],
  ferris: ["Sky Wheel"],
  station: ["Central Station"],
};

const US_LOCAL: Record<string, Landmarks> = {
  Chicago: {
    tower: ["Willis Tower", "John Hancock Center", "Trump Tower Chicago", "Aon Center"],
    ferris: ["Navy Pier Centennial Wheel"],
    funfair: ["Navy Pier"],
    park: ["Millennium Park", "Grant Park", "Lincoln Park"],
    plaza: ["Cloud Gate (The Bean)", "Buckingham Fountain", "Daley Plaza"],
    arena: ["Wrigley Field", "Soldier Field", "United Center", "Guaranteed Rate Field"],
    stadium: ["Wrigley Field"],
    campus: [uni("University of Chicago", ["Regenstein Library", "Lecture hall"], { plaza: ["Hyde Park Gate"], restaurant: ["Medici on 57th"] }), "Northwestern University", "Loyola University Chicago"],
    museum: ["Art Institute of Chicago", "Field Museum", "Museum of Science and Industry"],
    station: ["Union Station", "Ogilvie Transportation Center"],
    airport: ["O'Hare International Airport", "Midway Airport"],
    mall: ["Water Tower Place", "The Shops at North Bridge"],
    bridge: ["DuSable Bridge", "Michigan Avenue Bridge"],
    port: ["Navy Pier Harbor"],
    restaurant: ["Lou Malnati's Pizzeria", "Portillo's Hot Dogs", "Deep Dish Corner"],
    club: ["Blue Note Jazz Club", "Windy City Lounge"],
  },
  "New York": {
    tower: ["Empire State Building", "One World Trade Center", "Chrysler Building", "Rockefeller Center"],
    park: ["Central Park", "Bryant Park", "The High Line"],
    plaza: ["Times Square", "Washington Square", "Union Square"],
    bridge: ["Brooklyn Bridge", "Manhattan Bridge", "Williamsburg Bridge"],
    arena: ["Madison Square Garden", "Yankee Stadium", "Barclays Center"],
    campus: [uni("Columbia University", ["Butler Library", "Lecture hall"], { plaza: ["Columbia Gates"] }), "New York University (NYU)"],
    museum: ["Metropolitan Museum of Art", "MoMA", "American Museum of Natural History"],
    station: ["Grand Central Terminal", "Penn Station"],
    airport: ["JFK International Airport", "LaGuardia Airport"],
    ferris: ["Wonder Wheel (Coney Island)"],
    funfair: ["Coney Island Luna Park"],
    market: ["Chelsea Market", "Essex Market"],
    hotel: ["The Plaza Hotel", "The Waldorf Astoria"],
    port: ["Port of New York"],
    restaurant: ["Katz's Deli", "Joe's Pizza", "Bodega Corner"],
    club: ["Apollo Theater Club", "Village Vanguard"],
  },
  Atlanta: {
    tower: ["Bank of America Plaza", "Westin Peachtree Plaza"],
    ferris: ["SkyView Atlanta"],
    park: ["Centennial Olympic Park", "Piedmont Park"],
    arena: ["Mercedes-Benz Stadium", "State Farm Arena"],
    campus: ["Georgia Tech", "Emory University", "Morehouse College"],
    museum: ["Georgia Aquarium", "High Museum of Art"],
    airport: ["Hartsfield-Jackson International Airport"],
    market: ["Ponce City Market", "Krog Street Market"],
  },
  Houston: {
    tower: ["JPMorgan Chase Tower", "Williams Tower"],
    museum: ["Space Center Houston", "Houston Museum of Natural Science"],
    arena: ["Minute Maid Park", "NRG Stadium", "Toyota Center"],
    campus: ["Rice University", "University of Houston"],
    park: ["Discovery Green", "Hermann Park"],
    mall: ["The Galleria"],
    airport: ["George Bush Intercontinental Airport"],
    port: ["Port of Houston"],
    oilrig: ["Gulf Offshore Platform"],
  },
  "Los Angeles": {
    museum: ["Griffith Observatory", "The Getty", "LACMA"],
    ferris: ["Pacific Wheel (Santa Monica Pier)"],
    funfair: ["Santa Monica Pier"],
    campus: ["UCLA", "University of Southern California (USC)"],
    arena: ["Crypto.com Arena", "SoFi Stadium", "Dodger Stadium"],
    station: ["Union Station"],
    airport: ["LAX"],
    mall: ["The Grove", "Westfield Century City"],
    market: ["Grand Central Market"],
    plaza: ["Hollywood Walk of Fame", "Venice Beach Boardwalk"],
    park: ["Griffith Park", "Echo Park"],
    port: ["Port of Los Angeles"],
  },
  Seattle: {
    tower: ["Space Needle", "Columbia Center"],
    market: ["Pike Place Market"],
    ferris: ["Seattle Great Wheel"],
    campus: ["University of Washington"],
    arena: ["Lumen Field", "Climate Pledge Arena", "T-Mobile Park"],
    museum: ["Museum of Pop Culture"],
    airport: ["Seattle-Tacoma International Airport"],
    park: ["Kerry Park", "Gas Works Park"],
    port: ["Port of Seattle"],
  },
  Miami: {
    market: ["Bayside Marketplace"],
    arena: ["Hard Rock Stadium", "Kaseya Center"],
    campus: ["University of Miami"],
    museum: ["Pérez Art Museum Miami"],
    airport: ["Miami International Airport"],
    port: ["PortMiami"],
    park: ["Bayfront Park"],
    plaza: ["Ocean Drive", "Wynwood Walls"],
    mall: ["Brickell City Centre"],
    club: ["Ocean Drive Club"],
  },
  Boston: {
    arena: ["Fenway Park", "TD Garden"],
    campus: [uni("Harvard University", ["Widener Library", "Lecture hall"], { plaza: ["Harvard Yard"] }), "MIT"],
    park: ["Boston Common", "Public Garden"],
    market: ["Faneuil Hall Marketplace", "Quincy Market"],
    museum: ["Museum of Fine Arts"],
    station: ["South Station"],
    airport: ["Logan International Airport"],
    tower: ["Prudential Tower", "John Hancock Tower"],
  },
  Denver: {
    arena: ["Coors Field", "Ball Arena", "Empower Field"],
    campus: ["University of Denver"],
    museum: ["Denver Art Museum"],
    station: ["Union Station"],
    airport: ["Denver International Airport"],
    park: ["City Park", "Red Rocks Park"],
    mall: ["16th Street Mall"],
  },
  Austin: {
    campus: [uni("University of Texas at Austin", ["Perry-Castañeda Library", "Lecture hall"], { plaza: ["UT Tower Lawn"] })],
    clock: ["Texas State Capitol", "UT Tower"],
    park: ["Zilker Park"],
    waterpark: ["Barton Springs Pool"],
    arena: ["Moody Center", "Q2 Stadium"],
    bridge: ["Congress Avenue Bridge"],
    airport: ["Austin-Bergstrom International Airport"],
    club: ["Sixth Street Live"],
  },
};
const US_WIDE: Landmarks = {
  hospital: ["Mercy General Hospital", "St. Mary's Hospital", "County General Hospital"],
  police: ["1st Precinct", "Central Police Precinct"],
  fire: ["Engine Company 7", "Fire Station No. 3", "Ladder Company 12"],
  club: ["Neon Lounge", "Jazz Cellar", "Club Skyline"],
  restaurant: ["Main Street Diner", "Smokehouse BBQ", "Joe's Pizza", "Corner Bistro"],
  waterpark: ["Splash Kingdom", "Wet 'n' Wild"],
  dam: ["Hoover Dam (model)", "City Reservoir Dam"],
  station: ["Union Station"],
  ferris: ["Sky Wheel"],
};

const UK_LOCAL: Record<string, Landmarks> = {
  London: {
    clock: ["Big Ben (Elizabeth Tower)"],
    ferris: ["London Eye"],
    bridge: ["Tower Bridge", "London Bridge", "Westminster Bridge", "Millennium Bridge"],
    tower: ["The Shard", "The Gherkin", "The Walkie-Talkie", "BT Tower"],
    park: ["Hyde Park", "Regent's Park", "St James's Park", "Greenwich Park"],
    plaza: ["Trafalgar Square", "Piccadilly Circus", "Leicester Square", "Covent Garden Piazza"],
    arena: ["Wembley Stadium", "The O2", "Emirates Stadium", "Stamford Bridge"],
    museum: ["British Museum", "Tate Modern", "Natural History Museum", "Science Museum"],
    mall: ["Westfield London", "Westfield Stratford City"],
    market: ["Borough Market", "Camden Market", "Portobello Road Market"],
    campus: [uni("Imperial College London", ["Central Library", "Lecture theatre"], { plaza: ["Exhibition Road"] }), uni("University College London (UCL)", ["UCL Main Library", "Lecture theatre"], { plaza: ["Gower Street Quad"] }), "King's College London"],
    airport: ["Heathrow Airport", "London City Airport"],
    station: ["King's Cross", "St Pancras International", "Paddington"],
    hotel: ["The Savoy", "The Ritz London", "The Langham"],
    power: ["Battersea Power Station"],
    dam: ["Thames Barrier"],
    port: ["Port of London (Tilbury)"],
    twin: ["Canary Wharf Towers"],
    military: ["Tower of London", "Wellington Barracks"],
    restaurant: ["Fish & Chips Corner", "Brick Lane Curry House", "The Pie Shop"],
    club: ["Fabric", "Ministry of Sound", "Ronnie Scott's"],
  },
  Manchester: {
    arena: ["Old Trafford", "Etihad Stadium", "AO Arena"],
    campus: ["University of Manchester"],
    museum: ["Manchester Central Library", "Science and Industry Museum"],
    tower: ["Beetham Tower", "Deansgate Square"],
    mall: ["Manchester Arndale", "Trafford Centre"],
    plaza: ["Piccadilly Gardens", "Albert Square"],
    airport: ["Manchester Airport"],
    station: ["Manchester Piccadilly"],
    club: ["The Haçienda"],
  },
  Liverpool: {
    clock: ["Royal Liver Building"],
    arena: ["Anfield", "Goodison Park"],
    port: ["Albert Dock"],
    mall: ["Liverpool ONE"],
    ferris: ["Wheel of Liverpool"],
    campus: ["University of Liverpool"],
    station: ["Lime Street Station"],
    airport: ["John Lennon Airport"],
    club: ["The Cavern Club"],
    plaza: ["Mathew Street"],
  },
  Birmingham: {
    mall: ["Bullring", "Grand Central Birmingham"],
    arena: ["Villa Park", "Utilita Arena", "St Andrew's"],
    museum: ["Library of Birmingham", "Cadbury World"],
    campus: ["University of Birmingham"],
    station: ["Birmingham New Street"],
    plaza: ["Victoria Square", "Centenary Square"],
  },
  Leeds: {
    arena: ["Elland Road", "Headingley Stadium", "First Direct Arena"],
    market: ["Kirkgate Market"],
    campus: ["University of Leeds"],
    museum: ["Royal Armouries Museum"],
    station: ["Leeds Station"],
    tower: ["Bridgewater Place"],
  },
  Edinburgh: {
    military: ["Edinburgh Castle"],
    park: ["Arthur's Seat", "Princes Street Gardens"],
    plaza: ["Royal Mile", "Grassmarket"],
    arena: ["Murrayfield Stadium"],
    campus: ["University of Edinburgh"],
    station: ["Edinburgh Waverley"],
    museum: ["National Museum of Scotland"],
    hotel: ["The Balmoral"],
    clock: ["The Balmoral Clock"],
  },
  Bristol: {
    bridge: ["Clifton Suspension Bridge", "Pero's Bridge"],
    mall: ["Cabot Circus"],
    arena: ["Ashton Gate"],
    campus: ["University of Bristol"],
    station: ["Bristol Temple Meads"],
    port: ["SS Great Britain Dock"],
    museum: ["M Shed", "Bristol Museum & Art Gallery"],
  },
};
const UK_WIDE: Landmarks = {
  hospital: ["Royal Infirmary", "St Thomas' Hospital", "General Hospital"],
  police: ["Police Station", "Constabulary HQ"],
  fire: ["Fire Station", "Fire & Rescue Station"],
  club: ["The Jazz Café", "Basement Club", "Disco Cellar"],
  restaurant: ["Fish & Chips Corner", "The Red Lion Pub", "Curry House", "Full English Café"],
  waterpark: ["Splash Lagoon", "Waterworld"],
  station: ["Central Station"],
  ferris: ["The Big Wheel"],
};

const GH_LOCAL: Record<string, Landmarks> = {
  Accra: {
    plaza: ["Black Star Square", "Independence Arch", "Jamestown Lighthouse", "Oxford Street (Osu)"],
    park: ["Kwame Nkrumah Memorial Park", "Legon Botanical Garden"],
    campus: [uni("University of Ghana (Legon)", ["Balme Library", "Great Hall"], { plaza: ["Legon Main Gate"], restaurant: ["Night Market Legon"], park: ["Legon Botanical Garden"] }), "Ashesi University"],
    market: ["Makola Market", "Kaneshie Market", "Arts Centre Market"],
    airport: ["Kotoka International Airport"],
    mall: ["Accra Mall", "West Hills Mall", "Achimota Retail Centre"],
    hotel: ["Labadi Beach Hotel", "Kempinski Gold Coast", "Movenpick Ambassador"],
    arena: ["Accra Sports Stadium (Ohene Djan)"],
    museum: ["National Museum of Ghana", "W.E.B. Du Bois Centre"],
    hospital: ["Korle Bu Teaching Hospital", "37 Military Hospital"],
    tower: ["World Trade Center Accra", "One Airport Square"],
    military: ["Osu Castle", "Burma Camp"],
    port: ["Jamestown Harbour"],
    club: ["Republic Bar", "Bloombar"],
    restaurant: ["Buka Restaurant", "Auntie Muni's Waakye", "Chop Bar"],
  },
  Kumasi: {
    campus: [uni("KNUST", ["KNUST Library", "Great Hall"], { plaza: ["KNUST Gate"] })],
    market: ["Kejetia Market"],
    arena: ["Baba Yara Sports Stadium"],
    museum: ["Manhyia Palace Museum", "Prempeh II Museum"],
    mall: ["Kumasi City Mall"],
    hospital: ["Komfo Anokye Teaching Hospital"],
    plaza: ["Kejetia Roundabout", "Adum"],
  },
  Tema: { port: ["Tema Harbour"], power: ["Tema Thermal Power Plant"], dam: ["Akosombo Dam"], plaza: ["Tema Motorway Roundabout"], market: ["Tema Community 1 Market"] },
  Takoradi: { port: ["Takoradi Harbour"], oilrig: ["Jubilee Oil Field"], market: ["Takoradi Market Circle"], arena: ["Essipong Stadium"] },
};
const GH_WIDE: Landmarks = {
  hospital: ["Teaching Hospital", "Ridge Hospital"],
  police: ["Police Headquarters", "District Police Station"],
  fire: ["Ghana National Fire Service Station"],
  club: ["Highlife Club", "Azonto Lounge"],
  restaurant: ["Chop Bar", "Waakye Joint", "Kelewele Corner", "Jollof Wars Kitchen"],
  waterpark: ["Splash Park Ghana"],
  dam: ["Akosombo Dam", "Bui Dam"],
  oilrig: ["Jubilee Oil Field"],
};

const KE_LOCAL: Record<string, Landmarks> = {
  Nairobi: {
    tower: ["KICC", "Britam Tower", "UAP Old Mutual Tower"],
    park: ["Uhuru Park", "Central Park Nairobi", "Arboretum", "Karura Forest"],
    plaza: ["Kenyatta Avenue", "Jeevanjee Gardens", "Archives Square"],
    campus: [uni("University of Nairobi", ["Jomo Kenyatta Library", "Taifa Hall"], { plaza: ["UoN Main Gate"], restaurant: ["Mess Canteen"] }), "Strathmore University", "Kenyatta University"],
    arena: ["Nyayo National Stadium", "Kasarani Stadium"],
    museum: ["Nairobi National Museum", "Karen Blixen Museum"],
    mall: ["Two Rivers Mall", "Village Market", "Sarit Centre", "The Junction Mall"],
    ferris: ["Two Rivers Eye"],
    airport: ["Jomo Kenyatta International Airport"],
    station: ["Nairobi Railway Station", "Nairobi Terminus (SGR)"],
    hospital: ["Kenyatta National Hospital", "Nairobi Hospital"],
    market: ["Maasai Market", "Gikomba Market", "City Market"],
    hotel: ["Hilton Nairobi", "The Norfolk Hotel"],
    restaurant: ["Carnivore Restaurant", "Mama Oliech Restaurant", "Nyama Choma Joint"],
    club: ["Kenyatta Avenue Club", "Westlands Groove"],
  },
  Mombasa: {
    military: ["Fort Jesus"],
    museum: ["Fort Jesus Museum"],
    plaza: ["Mombasa Tusks", "Mama Ngina Waterfront"],
    bridge: ["Nyali Bridge", "Makupa Causeway"],
    port: ["Kilindini Harbour", "Likoni Ferry"],
    airport: ["Moi International Airport"],
    campus: ["Technical University of Mombasa"],
    park: ["Haller Park"],
    waterpark: ["Wild Waters Mombasa"],
  },
  Kisumu: { park: ["Kisumu Impala Sanctuary"], campus: ["Maseno University"], port: ["Kisumu Port"], market: ["Kibuye Market"], arena: ["Moi Stadium Kisumu"] },
  Nakuru: { pond: ["Lake Nakuru"], campus: ["Egerton University"], arena: ["Afraha Stadium"], park: ["Menengai Crater"] },
};
const KE_WIDE: Landmarks = {
  hospital: ["County Referral Hospital"],
  police: ["Central Police Station"],
  fire: ["County Fire Station"],
  club: ["Gengetone Club", "Benga Lounge"],
  restaurant: ["Nyama Choma Joint", "Mama Mboga Kitchen", "Chapati Corner"],
  waterpark: ["Splash Waterworld"],
  dam: ["Masinga Dam", "Gitaru Dam"],
};

const ZA_LOCAL: Record<string, Landmarks> = {
  Johannesburg: {
    tower: ["Carlton Centre", "Hillbrow Tower", "Ponte City"],
    arena: ["FNB Stadium (Soccer City)", "Ellis Park Stadium"],
    campus: [uni("Wits University", ["Wits Library", "Great Hall"], { plaza: ["Wits Gate"] }), "University of Johannesburg"],
    museum: ["Apartheid Museum", "Constitution Hill"],
    mall: ["Sandton City", "Mall of Africa", "Rosebank Mall"],
    funfair: ["Gold Reef City"],
    bridge: ["Nelson Mandela Bridge"],
    station: ["Park Station"],
    airport: ["O.R. Tambo International Airport"],
    plaza: ["Mandela Square", "Vilakazi Street", "Maboneng Precinct"],
    park: ["Zoo Lake", "Joubert Park"],
    hospital: ["Chris Hani Baragwanath Hospital"],
  },
  "Cape Town": {
    park: ["Table Mountain", "Company's Garden", "Kirstenbosch Gardens"],
    port: ["V&A Waterfront"],
    mall: ["V&A Waterfront Mall", "Canal Walk"],
    ferris: ["Cape Wheel"],
    arena: ["Cape Town Stadium", "Newlands Stadium"],
    campus: [uni("University of Cape Town (UCT)", ["Jagger Library", "Jameson Hall"], { plaza: ["Jammie Plaza"] })],
    museum: ["Zeitz MOCAA", "Iziko South African Museum"],
    plaza: ["Greenmarket Square", "Bo-Kaap", "Long Street"],
    airport: ["Cape Town International Airport"],
    hospital: ["Groote Schuur Hospital"],
    military: ["Castle of Good Hope"],
  },
  Durban: {
    arena: ["Moses Mabhida Stadium", "Kings Park Stadium"],
    waterpark: ["uShaka Marine World"],
    port: ["Durban Harbour"],
    campus: ["University of KwaZulu-Natal"],
    mall: ["Gateway Theatre of Shopping"],
    plaza: ["Golden Mile", "Victoria Street Market"],
    airport: ["King Shaka International Airport"],
  },
  Pretoria: {
    museum: ["Union Buildings", "Voortrekker Monument", "Ditsong Museum"],
    arena: ["Loftus Versfeld Stadium"],
    campus: ["University of Pretoria (Tuks)"],
    mall: ["Menlyn Park"],
    plaza: ["Church Square"],
    station: ["Pretoria Station"],
    park: ["Freedom Park", "Pretoria Botanical Garden"],
  },
};
const ZA_WIDE: Landmarks = {
  hospital: ["Provincial Hospital", "Netcare Hospital"],
  police: ["SAPS Police Station"],
  fire: ["Fire & Rescue Station"],
  club: ["Amapiano Lounge", "Kwaito Club", "Gqom Basement"],
  restaurant: ["Shisa Nyama", "Bunny Chow Corner", "Braai Spot", "Kota King"],
  waterpark: ["Splash Water World"],
  dam: ["Gariep Dam", "Vaal Dam"],
};

/** Named landmarks per flavour: { wide: for every city, local: per city name }. */
export const LANDMARKS: Record<string, { wide: Landmarks; local: Record<string, Landmarks> }> = {
  ng: { wide: NG_WIDE, local: NG_LOCAL },
  us: { wide: US_WIDE, local: US_LOCAL },
  uk: { wide: UK_WIDE, local: UK_LOCAL },
  gh: { wide: GH_WIDE, local: GH_LOCAL },
  ke: { wide: KE_WIDE, local: KE_LOCAL },
  za: { wide: ZA_WIDE, local: ZA_LOCAL },
};

/** Little named decorations round the city, per flavour (and a few per city). */
export const EASTER_EGGS: Record<string, { wide: EasterEgg[]; local?: Record<string, EasterEgg[]> }> = {
  ng: {
    wide: [
      { kind: "grill", name: "Mallam's Suya Spot" },
      { kind: "minibus", name: "Danfo Bus Park", color: 0xffc727 },
      { kind: "stall", name: "Mama Put", color: 0xe03131 },
      { kind: "bigbus", name: "Old Molue Bus", color: 0xffc727 },
      { kind: "tricycle", name: "Lone Yellow Keke", color: 0xffd43b },
      { kind: "mural", name: "Fela Kuti Mural" },
      { kind: "stall", name: "Agege Bread Seller", color: 0x2f9e44 },
      { kind: "grill", name: "Boli & Fish Corner" },
    ],
    local: {
      Ikeja: [{ kind: "mural", name: "Afrobeat Mural (by the Shrine)" }, { kind: "cart", name: "Computer Village Phone Kiosk", color: 0x1971c2 }],
      Yaba: [{ kind: "mural", name: "Yaba Tech Hub Mural" }],
      Surulere: [{ kind: "minibus", name: "Ojuelegba Danfo Park", color: 0xffc727 }],
      Abuja: [{ kind: "grill", name: "Wuse Suya Spot" }, { kind: "tricycle", name: "Area 1 Keke Stand", color: 0x2f9e44 }],
    },
  },
  gh: {
    wide: [
      { kind: "minibus", name: "Trotro Station", color: 0xf1f3f5 },
      { kind: "grill", name: "Kelewele Stand" },
      { kind: "stall", name: "Waakye Joint", color: 0x2f9e44 },
      { kind: "tricycle", name: "Aboboyaa Tricycle", color: 0xe03131 },
      { kind: "mural", name: "Black Star Mural" },
    ],
  },
  ke: {
    wide: [
      { kind: "minibus", name: "Matatu Stage", color: 0x7048e8 },
      { kind: "grill", name: "Nyama Choma Grill" },
      { kind: "stall", name: "Mama Mboga Stand", color: 0x2f9e44 },
      { kind: "tricycle", name: "Tuk-Tuk Stand", color: 0xffd43b },
      { kind: "mural", name: "Wangari Maathai Mural" },
    ],
  },
  za: {
    wide: [
      { kind: "minibus", name: "Minibus Taxi Rank", color: 0xf1f3f5 },
      { kind: "grill", name: "Shisa Nyama Braai" },
      { kind: "stall", name: "Bunny Chow Stand", color: 0xf08c00 },
      { kind: "mural", name: "Madiba Mural" },
      { kind: "cart", name: "Spaza Shop", color: 0xe03131 },
    ],
  },
  us: {
    wide: [
      { kind: "cart", name: "Hot Dog Cart", color: 0xe03131 },
      { kind: "bigbus", name: "Food Truck", color: 0xf08c00 },
      { kind: "cabs", name: "Yellow Cab Rank", color: 0xffc727 },
      { kind: "mural", name: "Street Art Mural" },
      { kind: "grill", name: "BBQ Smoker" },
    ],
    local: { "New York": [{ kind: "cart", name: "Halal Cart", color: 0xf1f3f5 }], Chicago: [{ kind: "cart", name: "Chicago Dog Stand", color: 0x2f9e44 }] },
  },
  uk: {
    wide: [
      { kind: "phonebox", name: "Red Phone Box" },
      { kind: "bigbus", name: "Red Double-Decker", color: 0xe03131 },
      { kind: "cabs", name: "Black Cab Rank", color: 0x212529 },
      { kind: "mural", name: "Banksy-style Mural" },
      { kind: "cart", name: "Fish & Chips Van", color: 0x1971c2 },
    ],
  },
};

/** Club and restaurant names when nothing more local fits. */
export const CLUB_NAMES = ["Club Neon", "The Groove Room", "Bassline", "Velvet Lounge", "Afterglow"];
export const RESTAURANT_NAMES = ["The Corner Kitchen", "Spice Garden", "Grill House", "Harbour Bistro", "Sunset Diner"];

/**
 * Names that fit a key in a city: the city's own first, then the flavour's. Empty when there
 * are none (the caller makes a plain name up).
 */
export function landmarkChoices(flavorId: string, city: string, key: LandmarkKey): { local: Named[]; wide: Named[] } {
  const set = LANDMARKS[flavorId];
  return { local: set?.local[city]?.[key] ?? [], wide: set?.wide[key] ?? [] };
}

/** The easter eggs a city can have (its own first). */
export function eggChoices(flavorId: string, city: string): EasterEgg[] {
  const set = EASTER_EGGS[flavorId];
  if (!set) return [];
  return [...(set.local?.[city] ?? []), ...set.wide];
}
