// Lagos's landmarks, where they really are. Sizes are in tiles (100 m); left out, each building
// type has its own. Marked approx: placed from memory, to be checked against the map data.
// To move, rename or remove one, add a correction (corrections.ts) rather than editing here,
// unless the change is permanent and checked.

import type { Landmark } from "../../region.ts";

export const LANDMARKS: Landmark[] = [
  // ---- Lagos Island
  { id: "city-hall", name: "Lagos City Hall", type: "capitol", w: 2, d: 2, at: { lat: 6.4532, lon: 3.3935 }, approx: true },
  { id: "cathedral-church-of-christ", name: "Cathedral Church of Christ, Marina", type: "cathedral", w: 2, d: 2, at: { lat: 6.4506, lon: 3.3898 }, approx: true },
  { id: "holy-cross-cathedral", name: "Holy Cross Cathedral", type: "cathedral", w: 2, d: 2, at: { lat: 6.4527, lon: 3.3972 }, approx: true },
  { id: "central-mosque", name: "Lagos Central Mosque", type: "grandmosque", w: 2, d: 2, at: { lat: 6.4560, lon: 3.3878 }, approx: true },
  { id: "balogun-market", name: "Balogun Market", type: "market", w: 3, d: 2, at: { lat: 6.4592, lon: 3.3846 }, approx: true },
  { id: "tafawa-balewa-square", name: "Tafawa Balewa Square", type: "bigpark", w: 4, d: 4, at: { lat: 6.4488, lon: 3.4005 }, approx: true },
  { id: "freedom-park", name: "Freedom Park", type: "bigpark", w: 2, d: 2, at: { lat: 6.4498, lon: 3.3948 }, approx: true },
  { id: "national-museum", name: "National Museum Lagos", type: "museum", at: { lat: 6.4440, lon: 3.4065 }, approx: true },
  { id: "onikan-stadium", name: "Mobolaji Johnson Arena (Onikan Stadium)", type: "arena", w: 3, d: 3, at: { lat: 6.4458, lon: 3.4030 }, approx: true },
  { id: "obas-palace", name: "Iga Idunganran (Oba's Palace)", type: "museum", at: { lat: 6.4612, lon: 3.3852 }, approx: true },
  { id: "breadfruit-church", name: "St Paul's Anglican Church, Breadfruit", type: "worship", at: { lat: 6.4576, lon: 3.3900 }, approx: true },
  { id: "shitta-bey-mosque", name: "Shitta-Bey Mosque", type: "worship", at: { lat: 6.4598, lon: 3.3912 }, approx: true },

  // ---- Victoria Island, Ikoyi, Lekki
  { id: "eko-hotel", name: "Eko Hotel & Suites", type: "hotel", at: { lat: 6.4265, lon: 3.4310 }, approx: true },
  { id: "federal-palace", name: "Federal Palace Hotel", type: "hotel", at: { lat: 6.4245, lon: 3.4100 }, approx: true },
  { id: "terra-kulture", name: "Terra Kulture", type: "museum", at: { lat: 6.4298, lon: 3.4215 }, approx: true },
  { id: "civic-centre", name: "The Civic Centre", type: "capitol", w: 2, d: 2, at: { lat: 6.4380, lon: 3.4190 }, approx: true },
  { id: "landmark-centre", name: "Landmark Centre", type: "megamall", w: 3, d: 2, at: { lat: 6.4228, lon: 3.4455 }, approx: true },
  { id: "ikoyi-club", name: "Ikoyi Club 1938", type: "bigpark", w: 5, d: 4, at: { lat: 6.4555, lon: 3.4300 }, approx: true },
  { id: "the-palms", name: "The Palms Shopping Mall", type: "megamall", at: { lat: 6.4355, lon: 3.4510 }, approx: true },
  { id: "nike-art-gallery", name: "Nike Art Gallery", type: "museum", at: { lat: 6.4432, lon: 3.4888 }, approx: true },
  { id: "lekki-conservation-centre", name: "Lekki Conservation Centre", type: "bigpark", w: 6, d: 6, at: { lat: 6.4415, lon: 3.5355 }, approx: true },

  // ---- The mainland
  { id: "national-theatre", name: "National Theatre", type: "museum", w: 3, d: 3, at: { lat: 6.4760, lon: 3.3685 }, approx: true },
  { id: "national-stadium", name: "National Stadium, Surulere", type: "arena", at: { lat: 6.4985, lon: 3.3650 }, approx: true },
  { id: "teslim-balogun-stadium", name: "Teslim Balogun Stadium", type: "arena", w: 3, d: 3, at: { lat: 6.4990, lon: 3.3585 }, approx: true },
  { id: "unilag", name: "University of Lagos (Unilag)", type: "campus", w: 4, d: 4, inside: ["Unilag Main Library", "Senate Building · Lecture theatre"], at: { lat: 6.5155, lon: 3.3920 }, approx: true },
  { id: "yabatech", name: "Yaba College of Technology", type: "campus", w: 3, d: 2, at: { lat: 6.5190, lon: 3.3720 }, approx: true },
  { id: "tejuosho-market", name: "Tejuosho Market", type: "market", at: { lat: 6.5090, lon: 3.3700 }, approx: true },
  { id: "luth", name: "Lagos University Teaching Hospital (LUTH)", type: "hospital", at: { lat: 6.5180, lon: 3.3540 }, approx: true },
  { id: "apapa-port", name: "Apapa Port", type: "port", w: 4, d: 3, at: { lat: 6.4430, lon: 3.3620 }, approx: true },
  { id: "tin-can-port", name: "Tin Can Island Port", type: "port", w: 4, d: 3, at: { lat: 6.4380, lon: 3.3430 }, approx: true },
  { id: "oshodi-market", name: "Oshodi Market", type: "market", at: { lat: 6.5550, lon: 3.3430 }, approx: true },
  { id: "airport", name: "Murtala Muhammed International Airport", type: "intlairport", at: { lat: 6.5775, lon: 3.3210 }, approx: true },
  { id: "computer-village", name: "Computer Village", type: "market", w: 3, d: 2, at: { lat: 6.5965, lon: 3.3425 }, approx: true },
  { id: "new-afrika-shrine", name: "New Afrika Shrine", type: "club", at: { lat: 6.6030, lon: 3.3510 }, approx: true },
  { id: "kalakuta-museum", name: "Kalakuta Republic Museum", type: "museum", at: { lat: 6.5985, lon: 3.3525 }, approx: true },
  { id: "ikeja-city-mall", name: "Ikeja City Mall", type: "megamall", at: { lat: 6.6130, lon: 3.3580 }, approx: true },
];
