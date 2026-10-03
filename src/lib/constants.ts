/** Suggestions for "What do you sell?". Businesses can also type their own. */
export const CATEGORIES = [
  "Restaurant",
  "Food & drinks",
  "Fast food",
  "Bukka / local food",
  "Small chops & snacks",
  "Bakery & cakes",
  "Catering",
  "Drinks & bar",
  "Lounge",
  "Grocery & supermarket",
  "Provisions",
  "Fruits & vegetables",
  "Butcher & meat",
  "Fish & seafood",
  "Fashion & clothing",
  "Tailoring",
  "Shoes & bags",
  "Thrift / okrika",
  "Fabrics & lace",
  "Jewellery & accessories",
  "Hair salon",
  "Barber",
  "Nails",
  "Makeup",
  "Spa & massage",
  "Skincare & cosmetics",
  "Perfumes",
  "Phones & gadgets",
  "Phone repairs",
  "Computers & electronics",
  "Pharmacy",
  "Clinic & health",
  "Gym & fitness",
  "Car wash",
  "Auto repairs",
  "Car parts",
  "Laundry & dry cleaning",
  "Cleaning services",
  "Printing & branding",
  "Photography",
  "Events & decor",
  "Furniture",
  "Home & kitchen",
  "Building materials",
  "Gas & cooking fuel",
  "Water supply",
  "Logistics & delivery",
  "Education & lessons",
  "Kids & baby",
  "Pets",
  "Books & stationery",
  "Something else",
];

/** Colours a business can pick for its card. White text passes contrast on all of them. */
export const BRAND_COLORS = ["#2A772C", "#1C2B24", "#4338A0", "#A33A0B", "#A3214E", "#0F5E8C", "#7A4B12", "#5B2C83"];

/** Tidies the categories a business picked (trimmed, unique, at most 6). */
export function cleanCategories(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (value.length < 2 || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    result.push(value);
  }
  return result.slice(0, 6);
}

/** Used when Paystack isn't connected: pick a bank and type the name yourself. */
export const FALLBACK_BANKS = [
  "Access Bank", "Carbon", "Ecobank", "FairMoney", "FCMB", "Fidelity Bank", "First Bank", "Globus Bank",
  "GTBank", "Heritage Bank", "Jaiz Bank", "Keystone Bank", "Kuda", "Moniepoint", "OPay", "PalmPay",
  "Polaris Bank", "Providus Bank", "Stanbic IBTC", "Standard Chartered", "Sterling Bank", "Titan Trust Bank",
  "UBA", "Union Bank", "Unity Bank", "VFD Microfinance Bank", "Wema Bank", "Zenith Bank",
];
