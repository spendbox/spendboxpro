// Real-world flavours for each round's city: its name, and the kinds of names its streets get.

export type Flavor = {
  id: string;
  weight: number;
  cities: string[];
  streets: string[];
  suffixes: string[];
  markets?: string[];
};

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
