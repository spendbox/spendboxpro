// How each product stands in a business's 3D shop: clothes on a mannequin,
// shoes and bags on a riser, food on a laid table, homes as a model house, videos on a standing banner,
// and anything else on a pedestal. Guessed from the product's words and the
// business's categories; the business can change it in its shop editor.

export type DisplayKind = "wear" | "shoes" | "food" | "home" | "video" | "item";

export const DISPLAY_KINDS: { id: DisplayKind; name: string; section: string; hint: string }[] = [
  { id: "wear", name: "On a mannequin", section: "Clothes", hint: "Clothes, fabric and outfits" },
  { id: "shoes", name: "On a shoe riser", section: "Shoes & bags", hint: "Shoes, sneakers, heels, sandals and bags" },
  { id: "food", name: "On a table", section: "Food & drinks", hint: "Meals, cakes, snacks and drinks" },
  { id: "home", name: "As a model house", section: "Homes & spaces", hint: "Houses, flats, land and shortlets" },
  { id: "video", name: "On a standing banner", section: "Videos", hint: "Videos and adverts" },
  { id: "item", name: "On a pedestal", section: "Products", hint: "Everything else" },
];

const WORDS: [DisplayKind, RegExp][] = [
  [
    "shoes",
    /\b(shoes?|sneakers?|trainers?|heels?|stilettos?|sandals?|slides?|slippers?|boots?|loafers?|mules?|flats|pumps|brogues|oxfords|footwear|crocs|bags?|handbags?|purses?|clutch|totes?|backpacks?)\b/,
  ],
  [
    "home",
    /\b(house|houses|home|homes|apartment|apartments|flat|flats|duplex|bungalow|terrace|terraced|bedroom|bedrooms|bed ?room|land|plot|plots|property|properties|estate|mansion|villa|rent|lease|shortlet|short let|condo|penthouse|office space)\b/,
  ],
  [
    "food",
    /\b(cake|cakes|cupcakes?|rice|jollof|food|meals?|pizza|burgers?|chicken|soup|stew|suya|chops|pastry|pastries|bread|cookies?|snacks?|drinks?|juice|smoothies?|shawarma|dish|dishes|amala|egusi|fries|sandwich|salad|pasta|noodles|breakfast|lunch|dinner|catering|dessert|doughnuts?|donuts?|meat|fish|grill|grilled|pepper ?soup|parfait|yogurt|ice cream|cocktail|wine|coffee|tea)\b/,
  ],
  [
    "wear",
    /\b(dress|dresses|gown|gowns|shirt|shirts|t-shirt|tee|top|tops|blouse|skirt|skirts|trousers?|pants|jeans|jacket|jackets|hoodie|hoodies|suit|suits|agbada|kaftan|caftan|ankara|aso ?ebi|aso ?oke|abaya|jumpsuit|outfit|outfits|wears?|clothing|clothes|lace|senator|boubou|kimono|sweater|polo|shorts|bodycon|corset|two ?piece|set|native|buba|iro|wrapper|kente|adire)\b/,
  ],
];

const CATEGORY_WORDS: [DisplayKind, RegExp][] = [
  ["shoes", /shoe|footwear|sneaker|cobbler|bag/i],
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
