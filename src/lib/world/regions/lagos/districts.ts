// Lagos's districts: where the skyline is, where it's busy, where it's quiet. Positions are the
// middle of each district; density 1.1+ means high-rises, 0.5 a busy middle of
// offices and flats, 0.3 mostly houses. Only the
// islands' business districts (Lagos Island, Victoria Island, Eko Atlantic) are high-rise: the
// mainland is mostly two to four storeys, with busier middles (Ikeja, Yaba).

import type { District } from "../../region.ts";

export const DISTRICTS: District[] = [
  { id: "lagos-island", name: "Lagos Island", at: { lat: 6.4535, lon: 3.3925 }, radiusKm: 1.4, density: 1.25 },
  { id: "victoria-island", name: "Victoria Island", at: { lat: 6.4300, lon: 3.4200 }, radiusKm: 1.6, density: 1.2 },
  { id: "eko-atlantic", name: "Eko Atlantic", at: { lat: 6.4100, lon: 3.4080 }, radiusKm: 1.2, density: 1.1 },
  { id: "ikoyi", name: "Ikoyi", at: { lat: 6.4520, lon: 3.4350 }, radiusKm: 1.8, density: 0.42 },
  { id: "lekki-phase-1", name: "Lekki Phase 1", at: { lat: 6.4450, lon: 3.4750 }, radiusKm: 2.2, density: 0.36 },
  { id: "lekki-ajah", name: "Ajah", at: { lat: 6.4680, lon: 3.5700 }, radiusKm: 2, density: 0.3 },
  { id: "ikeja", name: "Ikeja", at: { lat: 6.6000, lon: 3.3500 }, radiusKm: 2.4, density: 0.5 },
  { id: "maryland", name: "Maryland", at: { lat: 6.5700, lon: 3.3670 }, radiusKm: 1.4, density: 0.34 },
  { id: "oshodi", name: "Oshodi", at: { lat: 6.5550, lon: 3.3430 }, radiusKm: 1.6, density: 0.38 },
  { id: "gbagada", name: "Gbagada", at: { lat: 6.5550, lon: 3.3870 }, radiusKm: 1.6, density: 0.3 },
  { id: "yaba", name: "Yaba", at: { lat: 6.5100, lon: 3.3780 }, radiusKm: 1.6, density: 0.42 },
  { id: "ebute-metta", name: "Ebute Metta", at: { lat: 6.4800, lon: 3.3830 }, radiusKm: 1.2, density: 0.36 },
  { id: "surulere", name: "Surulere", at: { lat: 6.4950, lon: 3.3550 }, radiusKm: 2, density: 0.33 },
  { id: "mushin", name: "Mushin", at: { lat: 6.5300, lon: 3.3500 }, radiusKm: 1.6, density: 0.3 },
  { id: "apapa", name: "Apapa", at: { lat: 6.4480, lon: 3.3600 }, radiusKm: 1.6, density: 0.4 },
  { id: "ajegunle", name: "Ajegunle", at: { lat: 6.4600, lon: 3.3330 }, radiusKm: 1.4, density: 0.28 },
  { id: "festac", name: "Festac Town", at: { lat: 6.4650, lon: 3.2830 }, radiusKm: 2, density: 0.3 },
];
