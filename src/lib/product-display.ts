// How each product shows in a business's 3D shop. Every product is a framed
// picture: clothes, hair & beauty, homes and videos hang on the walls, shoes,
// bags and everything else stand on shelves, and food stands on tables down
// the middle. Guessed from the product's words and the business's
// categories; the business can change it in its shop editor.

export type DisplayKind = "wear" | "hair" | "shoes" | "food" | "home" | "video" | "item";

export const DISPLAY_KINDS: { id: DisplayKind; name: string; section: string; hint: string }[] = [
  { id: "wear", name: "Clothes (large frame on the wall)", section: "Clothes", hint: "Clothes, fabric and outfits" },
  { id: "hair", name: "Hair & beauty (large frame on the wall)", section: "Hair & beauty", hint: "Hair, wigs, braids, nails, make-up and skincare" },
  { id: "home", name: "Homes & spaces (wide frame on the wall)", section: "Homes & spaces", hint: "Houses, flats, land and shortlets" },
  { id: "video", name: "Videos (screen frame on the wall)", section: "Videos", hint: "Videos and adverts" },
  { id: "shoes", name: "Shoes & bags (frame on a shelf)", section: "Shoes & bags", hint: "Shoes, sneakers, heels, sandals and bags" },
  { id: "item", name: "Other products (frame on a shelf)", section: "Products", hint: "Everything else" },
  { id: "food", name: "Food & drinks (frame on a table)", section: "Food & drinks", hint: "Meals, cakes, snacks and drinks" },
];

export type Placement = "wall" | "shelf" | "table";

/** Where a display's frame is kept. */
export function placementOf(kind: DisplayKind): Placement {
  return kind === "shoes" || kind === "item" ? "shelf" : kind === "food" ? "table" : "wall";
}

const WORDS: [DisplayKind, RegExp][] = [
  [
    "shoes",
    /\b(shoes?|sneakers?|trainers?|heels?|stilettos?|sandals?|slides?|slippers?|boots?|loafers?|mules?|flats|pumps|brogues|oxfords|footwear|crocs|bags?|handbags?|purses?|clutch|totes?|backpacks?)\b/,
  ],
  [
    "wear",
    /\b(dress|dresses|gown|gowns|shirt|shirts|t-shirt|tee|top|tops|blouse|skirt|skirts|trousers?|pants|jeans|jacket|jackets|hoodie|hoodies|suit|suits|agbada|kaftan|caftan|ankara|aso ?ebi|aso ?oke|abaya|jumpsuit|outfit|outfits|wears?|clothing|clothes|lace|senator|boubou|kimono|sweater|polo|shorts|bodycon|corset|two ?piece|native|buba|iro|wrapper|kente|adire)\b/,
  ],
  [
    "hair",
    /\b(hair|wigs?|braids?|braiding|weaves?|weavon|extensions?|frontals?|closures?|bundles?|lashes|nails?|manicure|pedicure|make-?up|makeup|skincare|skin care|creams?|lotions?|serums?|soaps?|perfumes?|fragrances?|locs|dreads|twists|cornrows?|barbing|haircut|facials?)\b/,
  ],
  [
    "home",
    /\b(house|houses|home|homes|apartment|apartments|flat|flats|duplex|bungalow|terrace|terraced|bedroom|bedrooms|bed ?room|land|plot|plots|property|properties|estate|mansion|villa|rent|lease|shortlet|short let|condo|penthouse|office space)\b/,
  ],
  [
    "food",
    /\b(cake|cakes|cupcakes?|rice|jollof|food|meals?|pizza|burgers?|chicken|soup|stew|suya|chops|pastry|pastries|bread|cookies?|snacks?|drinks?|juice|smoothies?|shawarma|dish|dishes|amala|egusi|fries|sandwich|salad|pasta|noodles|breakfast|lunch|dinner|catering|dessert|doughnuts?|donuts?|meat|fish|grill|grilled|pepper ?soup|parfait|yogurt|ice cream|cocktail|wine|coffee|tea)\b/,
  ],
];

const CATEGORY_WORDS: [DisplayKind, RegExp][] = [
  ["shoes", /shoe|footwear|sneaker|cobbler|bag/i],
  ["hair", /hair|salon|beauty|barb|spa|cosmetic|make-?up|nail|skin|lash|wig/i],
  ["home", /real estate|property|properties|housing|shortlet|interior/i],
  ["food", /food|bak|cake|restaurant|catering|kitchen|drink|bar|grill|cafe|café|chef/i],
  ["wear", /fashion|cloth|tailor|boutique|wear|fabric|thrift/i],
];

/** The display a product gets when the business hasn't picked one. */
export function guessDisplay(product: { title: string; description?: string | null; media_type: string }, categories: string[] = []): DisplayKind {
  if (product.media_type === "video") return "video";
  const text = `${product.title} ${product.description ?? ""}`.toLowerCase();
  for (const [kind, re] of WORDS) if (re.test(text)) return kind;
  const cats = categories.join(" ");
  for (const [kind, re] of CATEGORY_WORDS) if (re.test(cats)) return kind;
  return "item";
}

/** The short key a product's chosen display is kept under in the shop design. */
export function displayKey(productId: string) {
  return productId.replace(/-/g, "").slice(0, 10);
}

export function isDisplayKind(v: unknown): v is DisplayKind {
  return typeof v === "string" && DISPLAY_KINDS.some((k) => k.id === v);
}
