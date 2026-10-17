// Lagos's landmarks, where they really are. Sizes are in tiles (100 m); left out, each building
// type has its own. Marked approx: placed from memory, to be checked against the map data.
// To move, rename or remove one, add a correction (corrections.ts) rather than editing here,
// unless the change is permanent and checked.

import type { Landmark } from "../../region.ts";

export const LANDMARKS: Landmark[] = [
  // ---- Lagos Island
  { id: "city-hall", name: "Lagos City Hall", type: "capitol", w: 3, d: 3, at: { lat: 6.4532, lon: 3.3935 }, approx: true },
  { id: "cathedral-church-of-christ", name: "Cathedral Church of Christ, Marina", type: "cathedral", w: 3, d: 3, at: { lat: 6.4506, lon: 3.3898 }, approx: true },
  { id: "holy-cross-cathedral", name: "Holy Cross Cathedral", type: "cathedral", w: 3, d: 3, at: { lat: 6.4527, lon: 3.3972 }, approx: true },
  { id: "central-mosque", name: "Lagos Central Mosque", type: "grandmosque", w: 3, d: 3, at: { lat: 6.4560, lon: 3.3878 }, approx: true },
  { id: "balogun-market", name: "Balogun Market", type: "market", w: 4, d: 4, at: { lat: 6.4592, lon: 3.3846 }, approx: true },
  { id: "tafawa-balewa-square", name: "Tafawa Balewa Square", type: "bigpark", w: 5, d: 5, at: { lat: 6.4488, lon: 3.4005 }, approx: true },
  { id: "freedom-park", name: "Freedom Park", type: "bigpark", w: 2, d: 2, at: { lat: 6.4498, lon: 3.3948 }, approx: true },
  { id: "national-museum", name: "National Museum Lagos", type: "museum", w: 4, d: 4, at: { lat: 6.4440, lon: 3.4065 }, approx: true },
  { id: "onikan-stadium", name: "Mobolaji Johnson Arena (Onikan Stadium)", type: "arena", w: 5, d: 4, at: { lat: 6.4458, lon: 3.4030 }, approx: true },
  { id: "obas-palace", name: "Iga Idunganran (Oba's Palace)", type: "museum", w: 4, d: 3, at: { lat: 6.4612, lon: 3.3852 }, approx: true },
  { id: "breadfruit-church", name: "St Paul's Anglican Church, Breadfruit", type: "worship", at: { lat: 6.4576, lon: 3.3900 }, approx: true },
  { id: "shitta-bey-mosque", name: "Shitta-Bey Mosque", type: "worship", at: { lat: 6.4598, lon: 3.3912 }, approx: true },

  // ---- Victoria Island, Ikoyi, Lekki
  { id: "eko-hotel", name: "Eko Hotel & Suites", type: "hotel", w: 6, d: 5, at: { lat: 6.4265, lon: 3.4310 }, approx: true },
  { id: "federal-palace", name: "Federal Palace Hotel", type: "hotel", w: 5, d: 4, at: { lat: 6.4245, lon: 3.4100 }, approx: true },
  { id: "terra-kulture", name: "Terra Kulture", type: "museum", w: 3, d: 3, at: { lat: 6.4298, lon: 3.4215 }, approx: true },
  { id: "civic-centre", name: "The Civic Centre", type: "capitol", w: 4, d: 3, at: { lat: 6.4380, lon: 3.4190 }, approx: true },
  { id: "landmark-centre", name: "Landmark Centre", type: "megamall", w: 6, d: 4, at: { lat: 6.4228, lon: 3.4455 }, approx: true },
  { id: "ikoyi-club", name: "Ikoyi Club 1938", type: "bigpark", w: 9, d: 7, at: { lat: 6.4555, lon: 3.4300 }, approx: true },
  { id: "the-palms", name: "The Palms Shopping Mall", type: "megamall", w: 6, d: 5, at: { lat: 6.4355, lon: 3.4510 }, approx: true },
  { id: "nike-art-gallery", name: "Nike Art Gallery", type: "museum", w: 3, d: 3, at: { lat: 6.4432, lon: 3.4888 }, approx: true },
  { id: "lekki-conservation-centre", name: "Lekki Conservation Centre", type: "bigpark", w: 10, d: 9, at: { lat: 6.4415, lon: 3.5355 }, approx: true },

  // ---- The mainland
  { id: "national-theatre", name: "National Theatre", type: "museum", w: 6, d: 6, at: { lat: 6.4760, lon: 3.3685 }, approx: true },
  { id: "national-stadium", name: "National Stadium, Surulere", type: "arena", w: 6, d: 6, at: { lat: 6.4985, lon: 3.3650 }, approx: true },
  { id: "teslim-balogun-stadium", name: "Teslim Balogun Stadium", type: "arena", w: 3, d: 3, at: { lat: 6.4990, lon: 3.3585 }, approx: true },
  // The Akoka campus, on the lagoon in the Yaba axis: about 1.1 × 0.9 km of land (the real campus
  // runs on along the lagoon front). Checked against the baked map: all land, no main road.
  { id: "unilag", name: "University of Lagos (Unilag)", type: "campus", w: 11, d: 9, inside: ["Unilag Main Library", "Senate Building · Lecture theatre"], at: { lat: 6.51438, lon: 3.39346 } },
  { id: "yabatech", name: "Yaba College of Technology", type: "campus", w: 7, d: 6, at: { lat: 6.5190, lon: 3.3720 }, approx: true },
  { id: "tejuosho-market", name: "Tejuosho Market", type: "market", w: 4, d: 4, at: { lat: 6.5090, lon: 3.3700 }, approx: true },
  { id: "luth", name: "Lagos University Teaching Hospital (LUTH)", type: "medcentre", w: 8, d: 7, inside: ["Outpatients · Reception", "Wards"], at: { lat: 6.5180, lon: 3.3540 }, approx: true },
  { id: "apapa-port", name: "Apapa Port", type: "port", w: 10, d: 7, at: { lat: 6.4430, lon: 3.3620 }, approx: true },
  { id: "tin-can-port", name: "Tin Can Island Port", type: "port", w: 10, d: 7, at: { lat: 6.4380, lon: 3.3430 }, approx: true },
  { id: "oshodi-market", name: "Oshodi Market", type: "market", w: 5, d: 4, at: { lat: 6.5550, lon: 3.3430 }, approx: true },
  { id: "airport", name: "Murtala Muhammed International Airport", type: "intlairport", w: 24, d: 14, at: { lat: 6.5775, lon: 3.3210 }, approx: true },
  { id: "computer-village", name: "Computer Village", type: "market", w: 6, d: 5, at: { lat: 6.5965, lon: 3.3425 }, approx: true },
  { id: "new-afrika-shrine", name: "New Afrika Shrine", type: "club", at: { lat: 6.6030, lon: 3.3510 }, approx: true },
  { id: "kalakuta-museum", name: "Kalakuta Republic Museum", type: "museum", w: 3, d: 3, at: { lat: 6.5985, lon: 3.3525 }, approx: true },
  { id: "ikeja-city-mall", name: "Ikeja City Mall", type: "megamall", w: 6, d: 5, at: { lat: 6.6130, lon: 3.3580 }, approx: true },

  // ---- The rest of Lagos State (baked 2026-10-15). Positions and sizes from OpenStreetMap; none
  // of them touches the first box (Ikeja to the coast, Festac to Ajah), which is kept as it was.

  // Agege
  { id: "agege-stadium", name: "Agege Stadium", type: "arena", w: 3, d: 3, at: { lat: 6.62372, lon: 3.33006 }, approx: true },

  // Ojo and Badagry, out to the Benin border
  { id: "alaba-market", name: "Alaba International Market", type: "market", w: 8, d: 5, at: { lat: 6.46059, lon: 3.19066 }, approx: true },
  // The Ojo campus runs 1.2 × 2.6 km across the first box's west edge: this is its western strip,
  // by the Lagos–Badagry Expressway (the rest is in the first box, kept as it was).
  { id: "lasu", name: "Lagos State University (LASU)", type: "campus", w: 5, d: 10, at: { lat: 6.4705, lon: 3.1968 } },
  { id: "whispering-palms", name: "Whispering Palms Resort", type: "hotel", w: 3, d: 3, at: { lat: 6.41583, lon: 3.04503 }, approx: true },
  { id: "badagry-market", name: "Badagry Market", type: "market", w: 3, d: 4, at: { lat: 6.41885, lon: 2.87559 }, approx: true },
  { id: "seriki-abass-museum", name: "Seriki Williams Abass Slave Museum", type: "museum", w: 2, d: 2, at: { lat: 6.41193, lon: 2.8841 }, approx: true, osm: "Seriki Williams? Abass" },
  { id: "first-storey-building", name: "First Storey Building in Nigeria", type: "museum", w: 2, d: 2, at: { lat: 6.41213, lon: 2.88659 }, approx: true },
  { id: "badagry-heritage-museum", name: "Badagry Heritage Museum", type: "museum", w: 2, d: 2, at: { lat: 6.41175, lon: 2.88907 }, approx: true },
  { id: "badagry-hospital", name: "Badagry General Hospital", type: "hospital", at: { lat: 6.41458, lon: 2.89728 }, approx: true },
  // On Gberefu Island, across the lagoon from the town: no road, so it's a ferry ride.
  { id: "point-of-no-return", name: "Point of No Return, Gberefu", type: "monument", at: { lat: 6.39416, lon: 2.87942 }, approx: true },

  // Ikorodu
  { id: "lasustech", name: "Lagos State University of Science and Technology (LASUSTECH)", type: "campus", w: 12, d: 10, at: { lat: 6.64059, lon: 3.5275 }, approx: true, osm: "Lagos State Polytechnic|LASUSTECH|Lagos State University of Science" },

  // The Lekki corridor: Sangotedo to Ibeju-Lekki and the Free Zone
  { id: "novare-lekki-mall", name: "Novare Lekki Mall", type: "megamall", w: 3, d: 4, at: { lat: 6.4683, lon: 3.63877 }, approx: true },
  { id: "lufasi-nature-park", name: "Lufasi Nature Park", type: "bigpark", w: 4, d: 10, at: { lat: 6.4639, lon: 3.65473 }, approx: true },
  { id: "pan-atlantic-university", name: "Pan-Atlantic University", type: "campus", w: 10, d: 12, at: { lat: 6.48549, lon: 3.85571 }, approx: true },
  { id: "jara-beach-resort", name: "Jara Beach Resort", type: "hotel", w: 2, d: 2, at: { lat: 6.43853, lon: 3.86429 }, approx: true },
  // The site is 6.5 × 7.4 km; this is its works (drawn as one big plant, like the airport's 2.4 km).
  { id: "dangote-refinery", name: "Dangote Petroleum Refinery", type: "power", w: 18, d: 16, at: { lat: 6.45873, lon: 4.01409 }, approx: true, osm: "Dangote (Petroleum )?Refinery$" },
  // On the open coast: its quays and basin face the sea (south).
  { id: "lekki-deep-sea-port", name: "Lekki Deep Sea Port", type: "port", w: 16, d: 8, at: { lat: 6.42779, lon: 4.00924 }, approx: true, osm: "Lekki Deep Sea ?port" },
  { id: "la-campagne-tropicana", name: "La Campagne Tropicana Beach Resort", type: "hotel", w: 5, d: 5, at: { lat: 6.39495, lon: 4.1881 }, approx: true, osm: "La Campagne Tropicana" },

  // Epe
  { id: "epe-fish-market", name: "Epe Fish Market", type: "market", w: 2, d: 2, at: { lat: 6.58276, lon: 3.99068 }, approx: true },
  { id: "epe-resort", name: "Epe Resort and Spa", type: "hotel", w: 2, d: 2, at: { lat: 6.58757, lon: 3.94716 }, approx: true },

  // ---- Fun parks, water parks and paintball (2026-10-17): Lagos's real ones. The only places
  // with a Ferris wheel or water slides on the real map (made-up funfairs and water parks are left
  // out there), and paintball is played at parks. Apapa Amusement Park, Ikorodu Fun Park and
  // Hakuna Matata from OpenStreetMap; the paintball grounds aren't in its data yet: placed from
  // their listings (approx), so a bake moves them if they turn up. Each checked against the map:
  // open lots, no rooming house or road under it.
  { id: "apapa-amusement-park", name: "Apapa Amusement Park", type: "funfair", w: 4, d: 3, at: { lat: 6.44381, lon: 3.36608 }, approx: true },
  { id: "ikorodu-fun-park", name: "Ikorodu Fun Park", type: "funfair", w: 4, d: 4, at: { lat: 6.63338, lon: 3.53604 }, approx: true },
  { id: "hakuna-matata", name: "Hakuna Matata Theme Park by Eko Hotels", type: "waterpark", at: { lat: 6.4217, lon: 3.41611 }, approx: true },
  { id: "lsp-paintball-landmark", name: "Leisure Sports Paintball, Landmark Beach", type: "bigpark", w: 3, d: 3, at: { lat: 6.4183, lon: 3.4478 }, approx: true, osm: "Leisure Sports Paintball" },
  { id: "lakowe-paintball", name: "Paintball Park, Lakowe", type: "bigpark", w: 4, d: 3, at: { lat: 6.4700, lon: 3.6440 }, approx: true },
  { id: "omu-resort", name: "Omu Resort", type: "bigpark", w: 6, d: 5, at: { lat: 6.4790, lon: 3.7060 }, approx: true },
];
