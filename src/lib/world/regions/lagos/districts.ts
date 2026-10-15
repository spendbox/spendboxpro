// Lagos's districts: where the skyline is, where it's busy, where it's quiet. Positions are the
// middle of each district; density 1.1+ means high-rises, 0.5 a busy middle of
// offices and flats, 0.3 mostly houses. Only the
// islands' business districts (Lagos Island, Victoria Island, Eko Atlantic) are high-rise: the
// mainland is mostly two to four storeys, with busier middles (Ikeja, Yaba). landPrice is
// what land costs in the middle, in naira per m² (rough market levels, to be checked).

import type { District } from "../../region.ts";

export const DISTRICTS: District[] = [
  { id: "lagos-island", name: "Lagos Island", at: { lat: 6.4535, lon: 3.3925 }, radiusKm: 1.4, density: 1.25, landPrice: 450_000 },
  { id: "victoria-island", name: "Victoria Island", at: { lat: 6.4300, lon: 3.4200 }, radiusKm: 1.6, density: 1.2, landPrice: 900_000 },
  { id: "eko-atlantic", name: "Eko Atlantic", at: { lat: 6.4100, lon: 3.4080 }, radiusKm: 1.2, density: 1.1, landPrice: 1_400_000 },
  // The dearest land in Lagos: Banana Island (mansions on their own island off Ikoyi), then Ikoyi.
  { id: "banana-island", name: "Banana Island", at: { lat: 6.4655, lon: 3.4505 }, radiusKm: 0.7, density: 0.34, landPrice: 3_200_000 },
  { id: "ikoyi", name: "Ikoyi", at: { lat: 6.4520, lon: 3.4350 }, radiusKm: 1.8, density: 0.42, landPrice: 1_600_000 },
  { id: "lekki-phase-1", name: "Lekki Phase 1", at: { lat: 6.4450, lon: 3.4750 }, radiusKm: 2.2, density: 0.36, landPrice: 500_000 },
  { id: "lekki-ajah", name: "Ajah", at: { lat: 6.4680, lon: 3.5700 }, radiusKm: 2, density: 0.3, landPrice: 90_000 },
  { id: "ikeja", name: "Ikeja", at: { lat: 6.6000, lon: 3.3500 }, radiusKm: 2.4, density: 0.5, landPrice: 230_000 },
  { id: "maryland", name: "Maryland", at: { lat: 6.5700, lon: 3.3670 }, radiusKm: 1.4, density: 0.34, landPrice: 180_000 },
  { id: "oshodi", name: "Oshodi", at: { lat: 6.5550, lon: 3.3430 }, radiusKm: 1.6, density: 0.38, landPrice: 90_000 },
  { id: "gbagada", name: "Gbagada", at: { lat: 6.5550, lon: 3.3870 }, radiusKm: 1.6, density: 0.3, landPrice: 140_000 },
  { id: "yaba", name: "Yaba", at: { lat: 6.5100, lon: 3.3780 }, radiusKm: 1.6, density: 0.42, landPrice: 190_000 },
  { id: "ebute-metta", name: "Ebute Metta", at: { lat: 6.4800, lon: 3.3830 }, radiusKm: 1.2, density: 0.36, landPrice: 110_000 },
  { id: "surulere", name: "Surulere", at: { lat: 6.4950, lon: 3.3550 }, radiusKm: 2, density: 0.33, landPrice: 160_000 },
  { id: "mushin", name: "Mushin", at: { lat: 6.5300, lon: 3.3500 }, radiusKm: 1.6, density: 0.3, landPrice: 60_000 },
  { id: "apapa", name: "Apapa", at: { lat: 6.4480, lon: 3.3600 }, radiusKm: 1.6, density: 0.4, landPrice: 170_000 },
  { id: "ajegunle", name: "Ajegunle", at: { lat: 6.4600, lon: 3.3330 }, radiusKm: 1.4, density: 0.28, landPrice: 35_000 },
  { id: "festac", name: "Festac Town", at: { lat: 6.4650, lon: 3.2830 }, radiusKm: 2, density: 0.3, landPrice: 85_000 },

  // ---- The rest of Lagos State: the towns round the first box, west to the Benin border, east
  // to Epe and along the Lekki corridor (cheaper land further out, the Free Zone's industry).
  { id: "agege", name: "Agege", at: { lat: 6.6220, lon: 3.3200 }, radiusKm: 1.8, density: 0.42, landPrice: 100_000 },
  { id: "abule-egba", name: "Abule Egba", at: { lat: 6.6440, lon: 3.3000 }, radiusKm: 1.8, density: 0.34, landPrice: 70_000 },
  { id: "ojodu", name: "Ojodu", at: { lat: 6.6420, lon: 3.3700 }, radiusKm: 1.6, density: 0.36, landPrice: 130_000 },
  { id: "ikorodu", name: "Ikorodu", at: { lat: 6.6150, lon: 3.5080 }, radiusKm: 2.8, density: 0.38, landPrice: 70_000 },
  { id: "ojo", name: "Ojo", at: { lat: 6.4650, lon: 3.1600 }, radiusKm: 2.2, density: 0.32, landPrice: 50_000 },
  { id: "badagry", name: "Badagry", at: { lat: 6.4167, lon: 2.8846 }, radiusKm: 2.2, density: 0.32, landPrice: 30_000 },
  { id: "seme", name: "Seme Border", at: { lat: 6.3900, lon: 2.7350 }, radiusKm: 1.5, density: 0.22, landPrice: 15_000 },
  { id: "sangotedo", name: "Sangotedo", at: { lat: 6.4710, lon: 3.6355 }, radiusKm: 2.2, density: 0.3, landPrice: 120_000 },
  { id: "awoyaya", name: "Awoyaya", at: { lat: 6.4680, lon: 3.7000 }, radiusKm: 2, density: 0.26, landPrice: 60_000 },
  { id: "ibeju-lekki", name: "Ibeju-Lekki", at: { lat: 6.4706, lon: 3.8082 }, radiusKm: 3, density: 0.2, landPrice: 25_000 },
  { id: "lekki-free-zone", name: "Lekki Free Zone", at: { lat: 6.4538, lon: 3.9861 }, radiusKm: 3.5, density: 0.3, landPrice: 40_000 },
  { id: "epe", name: "Epe", at: { lat: 6.5850, lon: 3.9800 }, radiusKm: 2.5, density: 0.32, landPrice: 35_000 },
];
