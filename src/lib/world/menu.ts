// What you can order at a table (docs/FOOD.md): the food and the drinks, at real Lagos prices, and
// what each looks like when the waiter sets it down. Dearer in the fancy places (a hotel, a lounge,
// a club) than at a buka. The server works out the bill from this list, never from the phone.

/** What lands on the table: a plate of something, a bowl of soup (and a swallow), a platter, a drink. */
export type Dish = { kind: "plate" | "bowl" | "drink" | "platter"; color: number; side?: number };

export type MenuItem = {
  id: string;
  name: string;
  blurb: string;
  /** Naira, at an ordinary restaurant. */
  naira: number;
  kind: "food" | "drink";
  /** How it looks on the table. */
  dish: Dish;
};

export const MENU: MenuItem[] = [
  { id: "jollof", name: "Party jollof rice", blurb: "Smoky, peppery, with fried plantain and chicken.", naira: 6_500, kind: "food", dish: { kind: "plate", color: 0xd9480f, side: 0xf59f00 } },
  { id: "pounded_egusi", name: "Pounded yam & egusi", blurb: "Soft, stretchy yam and a rich melon-seed soup.", naira: 8_000, kind: "food", dish: { kind: "bowl", color: 0xe8b04a, side: 0xf8f4ec } },
  { id: "suya", name: "Suya platter", blurb: "Spicy grilled beef with onions and yaji pepper.", naira: 7_500, kind: "food", dish: { kind: "platter", color: 0x8a4b2a, side: 0xe9ecef } },
  { id: "pepper_soup", name: "Goat meat pepper soup", blurb: "Hot, spicy and comforting. Mind your tongue!", naira: 6_000, kind: "food", dish: { kind: "bowl", color: 0xb5421b } },
  { id: "moi_moi", name: "Moi moi & pap", blurb: "Steamed bean pudding with smooth, warm pap.", naira: 3_500, kind: "food", dish: { kind: "plate", color: 0xe8590c, side: 0xf1e3c8 } },
  { id: "ofada", name: "Ofada rice & ayamase", blurb: "Local rice with a green pepper stew that bites back.", naira: 7_000, kind: "food", dish: { kind: "plate", color: 0xe9dcc4, side: 0x2b8a3e } },
  { id: "asun", name: "Asun", blurb: "Peppered goat meat, smoky and sticky.", naira: 6_500, kind: "food", dish: { kind: "plate", color: 0x9c3b1b } },
  { id: "fish", name: "Grilled croaker & chips", blurb: "A whole fish grilled with pepper sauce.", naira: 15_000, kind: "food", dish: { kind: "platter", color: 0xc2a07a, side: 0xf2c94c } },
  { id: "akara", name: "Akara & bread", blurb: "Crispy bean fritters in a soft roll.", naira: 2_500, kind: "food", dish: { kind: "plate", color: 0xc77d3a, side: 0xf3e3c3 } },
  { id: "efo_riro", name: "Efo riro & semo", blurb: "Leafy vegetable soup packed with goodies.", naira: 7_500, kind: "food", dish: { kind: "bowl", color: 0x2f7d32, side: 0xf3ead6 } },
  { id: "fried_rice", name: "Fried rice & turkey", blurb: "Bright with peas and carrots, a big turkey wing.", naira: 9_000, kind: "food", dish: { kind: "plate", color: 0xf2c94c, side: 0x8a4b2a } },
  { id: "small_chops", name: "Small chops", blurb: "Puff-puff, samosa, spring rolls and gizzard on sticks.", naira: 5_000, kind: "food", dish: { kind: "platter", color: 0xd4a04c, side: 0x8a4b2a } },
  { id: "chin_chin_cake", name: "Chin chin & cake", blurb: "Crunchy chin chin and a slice of birthday cake.", naira: 3_000, kind: "food", dish: { kind: "plate", color: 0xf783ac, side: 0xe8b04a } },
  { id: "chapman", name: "Chapman", blurb: "Fizzy, fruity, with cucumber and a cherry.", naira: 4_500, kind: "drink", dish: { kind: "drink", color: 0xc92a2a } },
  { id: "zobo", name: "Zobo cooler", blurb: "Hibiscus, ginger and pineapple over ice.", naira: 2_500, kind: "drink", dish: { kind: "drink", color: 0x862e3a } },
  { id: "kunu", name: "Kunun aya", blurb: "Creamy tiger-nut milk with a hint of dates.", naira: 3_000, kind: "drink", dish: { kind: "drink", color: 0xe9dcc4 } },
  { id: "pineapple_ginger", name: "Pineapple-ginger fizz", blurb: "Sweet, spicy and very cold.", naira: 3_500, kind: "drink", dish: { kind: "drink", color: 0xf2c94c } },
  { id: "mojito", name: "Virgin mojito", blurb: "Lime, mint and soda. Zero drama.", naira: 4_000, kind: "drink", dish: { kind: "drink", color: 0xb2f2bb } },
  { id: "palm_wine", name: "Fresh palm wine", blurb: "Sweet and milky, tapped this morning.", naira: 3_000, kind: "drink", dish: { kind: "drink", color: 0xf1ede4 } },
  { id: "malt", name: "Cold malt", blurb: "Straight from the cooler, a little foam on top.", naira: 1_500, kind: "drink", dish: { kind: "drink", color: 0x4a2c17 } },
  { id: "coconut", name: "Coconut water", blurb: "From the shell, with crushed ice.", naira: 2_000, kind: "drink", dish: { kind: "drink", color: 0xf8f9fa } },
];

export const MENU_BY_ID = new Map(MENU.map((m) => [m.id, m]));

/** At most this many things in one order (a table can only hold so much). */
export const ORDER_MAX = 6;

/**
 * How much dearer it is where you are, by what stands there: a hotel 2.5×, a club, a tower's
 * lounge or an office block's restaurant 2×, a mall 1.5×, a restaurant or anywhere else 1×.
 */
export function priceLevel(where: string | null | undefined) {
  if (where === "hotel" || where === "intlairport") return 2.5;
  if (where === "club" || where === "tower" || where === "twin") return 2;
  if (where === "mall" || where === "megamall" || where === "office") return 1.5;
  return 1;
}

/** The bill in naira for these items where you are (null if an id is unknown or there are too many). */
export function billNaira(ids: string[], where: string | null | undefined): number | null {
  if (!Array.isArray(ids) || !ids.length || ids.length > ORDER_MAX) return null;
  let total = 0;
  for (const id of ids) {
    const m = MENU_BY_ID.get(id);
    if (!m) return null;
    total += m.naira;
  }
  return Math.round(total * priceLevel(where));
}
