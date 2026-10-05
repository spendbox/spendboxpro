// Product and service categories. Every product has one, picked when it's
// posted: the app suggests the best one from the product's name and
// description and the business's own categories, and the business can pick
// another or add its own. In the 3D shop each category is a section, shown
// framed on the wall, on shelves or on tables (the business can change where).

/** How a category shows in the 3D shop. "showroom" (a 3D car for each) is only for vehicles. */
export type Placement = "wall" | "shelf" | "table" | "showroom";
export type CategoryGroup = "product" | "service";

export interface Category {
  id: string;
  name: string;
  group: CategoryGroup;
  /** Where it shows in the 3D shop unless the business changes it. */
  placement: Placement;
  /** Wall frames: landscape for homes, cars, events... (portrait otherwise). */
  wide?: boolean;
  /** Words in a product's name or description that point to it (strong: worth more). */
  strong?: RegExp;
  weak?: RegExp;
  /** A business category that points to it. */
  business?: RegExp;
}

/** A category a business added itself. */
export interface CustomCategory {
  id: string;
  name: string;
  placement: Placement;
}

/** Splits "a|b(c|d)|e" into its top-level choices. */
function choices(words: string) {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const ch = words[i];
    if (ch === "\\") i++;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "|" && depth === 0) {
      out.push(words.slice(start, i));
      start = i + 1;
    }
  }
  return [...out, words.slice(start)];
}
/** A word list as a pattern, longest choices first, so "pet food" is matched whole before "pet". */
const w = (words: string) => new RegExp(`\\b(${choices(words).sort((a, b) => b.length - a.length).join("|")})\\b`, "i");

export const CATEGORIES: Category[] = [
  // ------------------------------------------------------------ Products
  {
    id: "clothes",
    name: "Clothes",
    group: "product",
    placement: "wall",
    strong: w(
      "dress|dresses|gown|gowns|shirt|shirts|t-shirt|t-shirts|tee|tees|top|tops|blouse|blouses|skirt|skirts|trousers?|pants|jeans|jacket|jackets|blazer|blazers|hoodie|hoodies|suit|suits|agbada|kaftan|kaftans|caftan|abaya|abayas|jumpsuit|jumpsuits|outfit|outfits|clothing|clothes|senator|boubou|kimono|sweater|sweaters|polo|polos|shorts|bodycon|corset|two ?piece|three ?piece|buba|iro|joggers?|tracksuits?|lingerie|bra|bras|pyjamas|pajamas|nightwear|sleepwear|swimsuit|bikini|kaftans|jalabiya|dashiki|sokoto|playsuit|romper|cardigan|coat|coats|vest|leggings|gym wear|activewear",
    ),
    weak: w("native|wears?|style|ready to wear|rtw|thrift|okrika|bale|unisex|men's|women's|ladies"),
    business: /fashion|cloth|boutique|wear|thrift|apparel|outfit/i,
  },
  {
    id: "fabrics",
    name: "Fabrics & materials",
    group: "product",
    placement: "wall",
    strong: w("fabric|fabrics|yards?|material|materials|wrapper|wrappers|bolt|guinea brocade|brocade"),
    weak: w("ankara|lace|laces|aso ?oke|aso ?ebi|adire|kente|george|voile|chiffon|satin|silk|cashmere|velvet|organza|tulle|damask|batik|tie ?and ?dye"),
    business: /fabric|textile|material/i,
  },
  {
    id: "shoes",
    name: "Shoes",
    group: "product",
    placement: "shelf",
    strong: w(
      "shoes?|sneakers?|trainers?|heels?|stilettos?|sandals?|slides?|slippers?|boots?|loafers?|mules?|pumps|brogues|oxfords|footwear|crocs|palms|espadrilles|wedges|flip ?flops?|moccasins?|kicks|jordans?|air ?force|yeezys?",
    ),
    weak: w("flats|size \\d{2}|eu \\d{2}"),
    business: /shoe|footwear|sneaker|cobbler|kicks/i,
  },
  {
    id: "bags",
    name: "Bags",
    group: "product",
    placement: "shelf",
    strong: w("bags?(?! of)|handbags?|purses?|clutch|clutches|totes?|backpacks?|wallets?|luggage|suitcases?|crossbody|duffel|briefcase|school ?bag"),
    business: /\bbags?\b|luggage|leather goods/i,
  },
  {
    id: "jewellery",
    name: "Jewellery & watches",
    group: "product",
    placement: "shelf",
    strong: w("necklaces?|earrings?|rings?|bracelets?|bangles?|anklets?|chains?|pendants?|watch|watches|jewellery|jewelry|beads|brooch|cufflinks|wristwatch|rolex|tiara"),
    weak: w("gold|silver|18k|14k|diamond|pearl|stainless"),
    business: /jewel|watch|gold|accessor/i,
  },
  {
    id: "accessories",
    name: "Accessories",
    group: "product",
    placement: "shelf",
    strong: w("caps?|hats?|belts?|sunglasses|shades|glasses|scarf|scarves|ties|bow ?tie|gele|head ?wraps?|turban|bonnet|durag|socks|gloves|umbrella|hand ?fan|keyholder|keychain"),
    business: /accessor/i,
  },
  {
    id: "hair",
    name: "Hair & wigs",
    group: "product",
    placement: "wall",
    strong: w("wigs?|bundles?|frontals?|closures?|hair ?extensions?|weaves?|weavon|bone ?straight|human ?hair|raw ?hair|kinky ?curly|pixie ?curls?|hair ?pieces?|ponytails?|crotchet|crochet"),
    weak: w("hair|inches|\\d{2} ?inch|lace front|glueless|curly|straight|body wave|deep wave"),
    business: /hair|wig|salon|beauty/i,
  },
  {
    id: "beauty",
    name: "Beauty & skincare",
    group: "product",
    placement: "shelf",
    strong: w(
      "creams?|lotions?|serums?|soaps?|skincare|skin care|lipsticks?|lip ?gloss|lip ?balm|foundation|concealer|powder|mascara|eyeliner|eyeshadow|palette|nail ?polish|press ?on ?nails|body ?butter|shea|toner|cleanser|moisturi[sz]er|sunscreen|face ?mask|scrub|black ?soap|body ?oil|hair ?oil|shampoo|conditioner|lash ?glue|makeup ?kit|make-?up ?kit|brushes",
    ),
    weak: w("glow|organic|natural|oil|spf|beauty|brightening|skin"),
    business: /beauty|cosmetic|skin|make-?up|glam/i,
  },
  {
    id: "perfumes",
    name: "Perfumes",
    group: "product",
    placement: "shelf",
    strong: w("perfumes?|fragrances?|cologne|body ?spray|oud|body ?mist|deodorant|eau de|edp|edt|scent|scents|attar|roll ?on|diffuser"),
    business: /perfume|fragrance|scent/i,
  },
  {
    id: "phones",
    name: "Phones & gadgets",
    group: "product",
    placement: "shelf",
    strong: w(
      "phones?|iphones?|samsung|tecno|infinix|itel|android|tablets?|ipads?|laptops?|macbooks?|chargers?|power ?banks?|earbuds|earpods|airpods|headphones?|headsets?|smart ?watch(es)?|apple ?watch|phone ?case|phone ?cases|screen ?protectors?|gadgets?|usb|cable|cables|hp|dell|lenovo|pixel|redmi|xiaomi|ps5|ps4|playstation|xbox|nintendo|console|keyboard|mouse|router|mifi|flash ?drive|ssd|hard ?drive",
    ),
    weak: w("gb|tb|uk used|brand new|pro max|128gb|256gb"),
    business: /phone|gadget|tech|computer|laptop|electronic/i,
  },
  {
    id: "electronics",
    name: "Electronics & appliances",
    group: "product",
    placement: "shelf",
    strong: w(
      "tvs?|television|fridges?|freezers?|generators?|inverters?|solar|batter(y|ies)|blenders?|microwaves?|air ?conditioners?|ac|fans?|pressing ?iron|speakers?|sound ?system|home ?theat(er|re)|cameras?|cctv|washing ?machines?|cookers?|gas ?cooker|air ?fryer|kettle|toaster|standing ?fan|rechargeable|bulbs?|stabili[sz]er|decoder|projector",
    ),
    business: /electronic|appliance|solar|electrical/i,
  },
  {
    id: "home",
    name: "Home & furniture",
    group: "product",
    placement: "wall",
    wide: true,
    strong: w(
      "sofas?|couch(es)?|chairs?|dining ?set|dining ?table|centre ?table|center ?table|beds?|bed ?frame|mattress(es)?|wardrobes?|curtains?|blinds|rugs?|carpets?|decor|home ?decor|lamps?|mirrors?|cushions?|throw ?pillows?|duvets?|bedsheets?|bed ?sheets?|pillows?|furniture|shelf|shelves|cabinet|tv ?stand|vase|vases|wall ?art|clock|towels?|kitchenware|cookware|pots|plates|cutlery|cups|mugs|glassware|dinnerware|storage",
    ),
    business: /furniture|interior|home|decor|kitchenware/i,
  },
  {
    id: "art",
    name: "Art & crafts",
    group: "product",
    placement: "wall",
    strong: w("paintings?|artworks?|canvas|portraits?|prints?|sculptures?|crafts?|handmade|hand ?made|frames?|framed|calligraphy|pottery|ceramics|illustration|drawing|mosaic|resin ?art|beadwork"),
    weak: w("art|artist|custom"),
    business: /\bart|craft|gallery|frame/i,
  },
  {
    id: "food",
    name: "Food & meals",
    group: "product",
    placement: "table",
    strong: w(
      "jollof|fried ?rice|rice|meals?|food|soups?|stew|swallow|amala|eba|fufu|egusi|pounded ?yam|efo|ogbono|okra|edikaikong|afang|banga|suya|shawarma|burgers?|pizzas?|chicken|turkey|fish|meat|beef|goat ?meat|small ?chops|chops|puff ?puff|spaghetti|pasta|noodles|sandwich(es)?|salads?|breakfast|lunch|dinner|platters?|asun|isi ?ewu|pepper ?soup|moi ?moi|akara|ofada|boli|plantain|dodo|fries|wings|grills?|grilled|barbecue|bbq|tacos?|wraps?|catfish|nkwobi|abacha|yam ?porridge|beans|ewa ?agoyin|gizdodo|peppered|nigerian ?food|lunch ?box|food ?tray|food ?pack",
    ),
    weak: w("tray|pack|plate|portion|spicy|delicious|homemade|serves \\d+|bowl"),
    business: /food|restaurant|kitchen|eatery|bukka|grill|catering|chef|cuisine|cafe|café/i,
  },
  {
    id: "cakes",
    name: "Cakes & pastries",
    group: "product",
    placement: "table",
    strong: w(
      "cakes?|cupcakes?|pastr(y|ies)|bread|breads|cookies?|doughnuts?|donuts?|pies?|meat ?pies?|chin ?chin|brownies?|muffins?|croissants?|desserts?|parfaits?|waffles?|pancakes?|banana ?bread|cheesecake|tarts?|macarons?|sponge|fondant|buttercream|red ?velvet|birthday ?cake|wedding ?cake|bento ?cake|cake ?pops?|cinnamon ?rolls?|scones?|sausage ?rolls?|fish ?rolls?",
    ),
    business: /bak|cake|pastr|dessert|confection/i,
  },
  {
    id: "drinks",
    name: "Drinks",
    group: "product",
    placement: "table",
    strong: w("drinks?|juices?|smoothies?|zobo|kunu|chapman|cocktails?|mocktails?|wines?|beers?|whisk(e)?y|vodka|gin|champagne|tequila|liquor|yog(h)?urt|coffee|latte|tea|milkshakes?|soda|tigernut|tiger ?nuts?|fura|palm ?wine|water|bottled ?water|energy ?drink"),
    business: /drink|bar|lounge|juice|smoothie|wine|beverage|coffee/i,
  },
  {
    id: "groceries",
    name: "Groceries & foodstuff",
    group: "product",
    placement: "shelf",
    strong: w(
      "foodstuffs?|grocer(y|ies)|provisions|garri|semovita|semolina|flour|palm ?oil|vegetable ?oil|groundnut ?oil|spices|seasoning|crayfish|stockfish|dry ?fish|ogbono ?seeds|egusi ?seeds|cereal|oats|custard|milk ?powder|noodles ?carton|indomie|spaghetti ?carton|honey|sugar|salt|tomato ?paste|(bags?|sacks?|paint|mudu|cartons?|crates?|tubers?) of",
    ),
    weak: w("\\d+ ?kg|kg|kilos?|litres?|rice|beans|yam|bulk|wholesale"),
    business: /grocer|foodstuff|supermarket|provision|mart|farm/i,
  },
  {
    id: "kids",
    name: "Kids & baby",
    group: "product",
    placement: "shelf",
    strong: w("baby|babies|kids|kid's|children|child|toddler|toys?|diapers?|nappies|stroller|pram|feeding ?bottle|teether|onesie|romper|school ?uniform|newborn"),
    business: /kid|baby|child|toy|maternity/i,
  },
  {
    id: "books",
    name: "Books & stationery",
    group: "product",
    placement: "shelf",
    strong: w("books?|novels?|e-?books?|stationery|notebooks?|pens?|pencils?|journals?|planners?|diar(y|ies)|textbooks?|bible|quran|magazine|calendar|greeting ?cards?|sticky ?notes"),
    business: /book|stationer|publish|library/i,
  },
  {
    id: "health",
    name: "Health & pharmacy",
    group: "product",
    placement: "shelf",
    strong: w(
      "supplements?|vitamins?|multivitamins?|vitamin ?[a-e]\\d*|omega ?3|fish ?oil|cod ?liver ?oil|probiotics?|drugs?|medicines?|medications?|pills?|capsules?|syrups?|cough|paracetamol|panadol|ibuprofen|aspirin|antibiotics?|amoxicillin|antimalarials?|malaria|coartem|blood ?tonic|tonic|antiseptic|dettol|savlon|iodine|plasters?|bandages?|gauze|cotton ?wool|syringes?|insulin|glucometers?|test ?strips?|test ?kits?|pregnancy ?tests?|ovulation|fertility|first ?aid|blood ?pressure|bp ?monitor|thermometers?|nebuli[sz]ers?|inhalers?|oximeters?|wheel ?chairs?|crutches|walking ?sticks?|eye ?drops|ear ?drops|reading ?glasses|contact ?lens(es)?|spectacles|face ?masks?|nose ?masks?|sanitizers?|hand ?sanitizers?|condoms?|sanitary ?pads?|pads|tampons|menstrual ?cups?|diabetic ?socks|diabetic|diabetes|herbal|herbs|bitters|detox|slimming|weight ?loss ?tea|immune ?boosters?|immunity|pain ?relief|ointments?|health ?check|\\d+ ?mg",
    ),
    weak: w("tablets|health|healthy|wellness|nafdac|pharmacy|relief|remedy|natural ?cure|treatment"),
    business: /pharm|health|medic|chemist|herbal|wellness|drug|clinic/i,
  },
  {
    id: "pets",
    name: "Pets & pet supplies",
    group: "product",
    placement: "shelf",
    strong: w("pets?|puppy|puppies|kittens?|dogs|cats|dog ?food|cat ?food|pet ?food|dog ?treats|cat ?litter|aquarium|fish ?tank|leash|dog ?collar|pet ?shampoo|bird ?cage|pet ?bed|kennel"),
    business: /\bpets?\b|vet|kennel|aquarium/i,
  },
  {
    id: "sports",
    name: "Sports & fitness gear",
    group: "product",
    placement: "shelf",
    strong: w("jerseys?|footballs?|balls?|dumbbells?|kettlebells?|yoga ?mats?|treadmill|skipping ?rope|resistance ?bands?|boxing ?gloves|bicycles?|bikes?|rackets?|gym ?equipment|waist ?trainer"),
    business: /sport|fitness gear|gym equipment/i,
  },
  {
    id: "cars",
    name: "Cars & auto",
    group: "product",
    placement: "wall",
    wide: true,
    strong: w("cars?|toyota|honda|lexus|benz|mercedes|bmw|hyundai|kia|ford|camry|corolla|highlander|venza|suvs?|tokunbo|vehicles?|tyres?|tires?|spare ?parts?|engine|rims?|car ?battery|car ?accessories|dashcam|motorcycles?|okada|keke"),
    weak: w("registered|foreign used|nigerian used|automatic|manual|mileage"),
    business: /car|auto|motor|vehicle|mechanic|spare part/i,
  },
  {
    id: "property",
    name: "Homes & property",
    group: "product",
    placement: "wall",
    wide: true,
    strong: w(
      "house|houses|apartments?|duplex(es)?|bungalows?|terraces?|terraced|bedroom|bedrooms|bed ?room|land|plots?|propert(y|ies)|estate|shortlets?|short ?let|self ?con|self ?contain(ed)?|mini ?flat|office ?space|penthouse|mansion|villa|condo|warehouse|shop ?space|bq",
    ),
    weak: w("rent|lease|sale|sqm|c of o|gated|serviced|furnished|flat|flats|home|homes"),
    business: /real estate|property|properties|housing|shortlet|realtor|estate/i,
  },
  {
    id: "plants",
    name: "Plants & flowers",
    group: "product",
    placement: "table",
    strong: w("plants?|flowers?|bouquets?|roses?|succulents?|potted|orchids?|lil(y|ies)|sunflowers?|seedlings?|houseplants?|bonsai|money ?plant|snake ?plant"),
    business: /plant|flower|florist|garden|nursery/i,
  },
  {
    id: "gifts",
    name: "Gifts & hampers",
    group: "product",
    placement: "shelf",
    strong: w("gifts?|hampers?|souvenirs?|gift ?box(es)?|gift ?set|surprise ?package|giveaways?|party ?favou?rs?|valentine ?package|care ?package"),
    business: /gift|hamper|souvenir|surprise/i,
  },
  { id: "other-products", name: "Other products", group: "product", placement: "shelf" },

  // ------------------------------------------------------------ Services
  {
    id: "hair-styling",
    name: "Hair styling & barbing",
    group: "service",
    placement: "wall",
    strong: w("braids?|braiding|knotless|cornrows?|locs|dreads|dreadlocks|twists|barbing|barber|haircut|hair ?cut|fade|hairstyles?|retouch|relaxer|wig ?install(ation)?|frontal ?install(ation)?|sew ?in|ghana ?weaving|silk ?press|hair ?treatment|wash ?and ?set|ponytail ?styling|tapering|bald|shave|beard"),
    weak: w("hair|style|styling|install|session"),
    business: /salon|barb|hair/i,
  },
  {
    id: "makeup",
    name: "Make-up, nails & lashes",
    group: "service",
    placement: "wall",
    strong: w("make-?up ?artist|bridal ?make-?up|glam|beat ?face|face ?beat|make-?up ?session|nails|manicure|pedicure|acrylics?|gel ?polish|lash ?extensions?|lashes|lash ?lift|brows?|microblading|gele ?tying|facials?|waxing|threading|tattoo|piercing|henna"),
    weak: w("make-?up|makeup|beauty|appointment"),
    business: /make-?up|nail|lash|beauty|spa|glam/i,
  },
  {
    id: "tailoring",
    name: "Tailoring & fashion design",
    group: "service",
    placement: "wall",
    strong: w("tailor|tailoring|sewing|sew|alterations?|custom ?made|bespoke|fashion ?design|made ?to ?measure|amend(ment)?s?|measurement"),
    business: /tailor|fashion design|seamstress/i,
  },
  {
    id: "photography",
    name: "Photography & video",
    group: "service",
    placement: "wall",
    wide: true,
    strong: w("photography|photographer|photoshoots?|photo ?shoots?|shoots?|videography|videographer|video ?coverage|studio ?session|portrait ?session|drone|editing|pre-?wedding|convocation ?shoot|birthday ?shoot|content ?creation"),
    business: /photo|video|studio|media|film/i,
  },
  {
    id: "events",
    name: "Events & decor",
    group: "service",
    placement: "wall",
    wide: true,
    strong: w("events?|event ?planning|decorations?|wedding ?planning|planners?|party ?planning|dj|mc|compere|hall|rentals?|balloons?|canopy|canopies|chairs ?rental|ushers|backdrop|event ?decor|centrepieces?|centerpieces?|live ?band|hype ?man|souvenir ?packaging"),
    weak: w("party|wedding|birthday|celebration|occasion|decor"),
    business: /event|decor|planner|wedding|party|rental/i,
  },
  {
    id: "catering",
    name: "Catering & chefs",
    group: "service",
    placement: "table",
    strong: w("catering|caterer|chefs?|private ?chef|personal ?chef|event ?food|food ?for ?events|for ?parties|party ?packs?|cooking ?class|meal ?prep|outdoor ?catering|buffet"),
    business: /catering|caterer|chef/i,
  },
  {
    id: "cleaning",
    name: "Cleaning & laundry",
    group: "service",
    placement: "wall",
    wide: true,
    strong: w("cleaning|cleaners?|laundry|dry ?clean(ing)?|wash ?and ?fold|fumigation|pest ?control|car ?wash|deep ?clean(ing)?|post-?construction ?cleaning|ironing|janitorial|upholstery ?cleaning|rug ?cleaning"),
    business: /clean|laundry|fumigat|pest/i,
  },
  {
    id: "repairs",
    name: "Repairs & installation",
    group: "service",
    placement: "wall",
    wide: true,
    strong: w("repairs?|fix|fixing|installations?|technician|plumb(er|ing)|electrician|electrical ?work|mechanic|ac ?repair|phone ?repair|laptop ?repair|servicing|maintenance|welding|carpentry|carpenter|painting ?service|tiling|pop ?ceiling|cctv ?installation|solar ?installation|screen ?replacement"),
    business: /repair|technician|plumb|electric|mechanic|maintenance|install/i,
  },
  {
    id: "lessons",
    name: "Classes & training",
    group: "service",
    placement: "wall",
    wide: true,
    strong: w("class|classes|lessons?|training|trainings|course|courses|tutor|tutoring|tutorials?|coaching|mentorship|bootcamp|workshops?|masterclass|lectures?|academy|school|webinar|admission|jamb|waec|ielts|music ?lessons?|driving ?school"),
    business: /school|tutor|academy|training|education|coach|lesson/i,
  },
  {
    id: "health-care",
    name: "Health & medical care",
    group: "service",
    placement: "wall",
    wide: true,
    strong: w(
      "doctors?|consultations?|clinic|hospital|nurse|nurses|nursing|home ?care|caregivers?|physio(therapy|therapist)?|dental|dentist|teeth ?whitening|scaling ?and ?polishing|lab ?tests?|laboratory|blood ?tests?|scans?|ultrasound|x-?rays?|check-?ups?|medical|telemedicine|optician|eye ?tests?|antenatal|vaccinations?|immuni[sz]ations?|dental ?cleaning|health ?screening",
    ),
    weak: w("health|appointment|session|treatment"),
    business: /clinic|hospital|health|medic|dental|nurs|lab|diagnostic|pharm/i,
  },
  {
    id: "fitness",
    name: "Fitness & wellness",
    group: "service",
    placement: "wall",
    wide: true,
    strong: w("gym|personal ?trainer|workouts?|fitness|yoga|pilates|massage|therapy|therapist|wellness|spa ?day|meditation|counsel(l)?ing|nutritionist|diet ?plan|weight ?loss ?program"),
    business: /gym|fitness|wellness|spa|massage|therap|yoga/i,
  },
  {
    id: "design",
    name: "Design & printing",
    group: "service",
    placement: "wall",
    wide: true,
    strong: w("logos?|branding|graphic ?design|designs?|printing|prints ?for|flyers?|banners?|business ?cards?|websites?|web ?design|app ?development|social ?media ?management|marketing|ads ?management|copywriting|ui|ux|brand ?identity|packaging ?design|t-?shirt ?printing|embroidery|engraving|signage"),
    business: /design|print|brand|marketing|web|digital|agency|creative/i,
  },
  {
    id: "delivery",
    name: "Delivery & logistics",
    group: "service",
    placement: "wall",
    wide: true,
    strong: w("delivery|deliveries|dispatch|logistics|shipping|courier|moving|movers|relocation|haulage|errands?|same ?day|waybill|interstate"),
    business: /deliver|logistic|dispatch|courier|shipping|haulage/i,
  },
  { id: "other-services", name: "Other services", group: "service", placement: "wall", wide: true },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
export const OTHER = { product: "other-products", service: "other-services" } as const;
export const MAX_CUSTOM_CATEGORIES = 30;

export const PLACEMENTS: { id: Placement; name: string; hint: string }[] = [
  { id: "wall", name: "Framed on the wall", hint: "Big frames in a row, each with a picture light" },
  { id: "shelf", name: "On shelves", hint: "Small frames, four to a shelf" },
  { id: "table", name: "On tables", hint: "Small frames standing on marble tables" },
  { id: "showroom", name: "3D showroom", hint: "A full-size 3D car for each one, on its own platform, in the colour of its photo" },
];

export function isPlacement(v: unknown): v is Placement {
  return v === "wall" || v === "shelf" || v === "table" || v === "showroom";
}

/** Cars and other vehicles: the categories that can be a 3D showroom (ours, or a business's own named like one). */
const VEHICLE_WORDS = /\b(cars?|vehicles?|autos?|suvs?|fleet|jeeps?|trucks?|vans?|buses|coupes?|sedans?|saloons?|rides?|motors?)\b/i;
export function canShowroom(id: string, custom: CustomCategory[] = []) {
  if (id === "cars") return true;
  const own = custom.find((c) => c.id === id);
  return Boolean(own && VEHICLE_WORDS.test(own.name));
}

/** The ways a category can show: a 3D showroom only for vehicles. */
export function placementsFor(id: string | null, custom: CustomCategory[] = [], name?: string) {
  const vehicle = id ? canShowroom(id, custom) : Boolean(name && VEHICLE_WORDS.test(name));
  return PLACEMENTS.filter((p) => p.id !== "showroom" || vehicle);
}

/** A business's own category's id, from its name ("Bridal sets" → "c-bridal-sets"). */
export function customCategoryId(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return `c-${slug || "category"}`;
}

export interface CategoryInfo {
  id: string;
  name: string;
  group: CategoryGroup;
  placement: Placement;
  wide: boolean;
  custom: boolean;
}

/** A category's name and where it shows (the business's choice, or its usual place). */
export function categoryInfo(id: string | null | undefined, custom: CustomCategory[] = [], looks: Record<string, { placement?: Placement }> = {}): CategoryInfo {
  const own = id ? custom.find((c) => c.id === id) : undefined;
  if (own) return { id: own.id, name: own.name, group: "product", placement: looks[own.id]?.placement ?? own.placement, wide: false, custom: true };
  const c = (id && BY_ID.get(id)) || BY_ID.get(OTHER.product)!;
  return { id: c.id, name: c.name, group: c.group, placement: looks[c.id]?.placement ?? c.placement, wide: Boolean(c.wide), custom: false };
}

export function isKnownCategory(id: string, custom: CustomCategory[] = []) {
  return BY_ID.has(id) || custom.some((c) => c.id === id);
}

/** Words of a custom category's name, to match products against ("Bridal sets" → bridal, set). */
function nameWords(name: string) {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((x) => x.length >= 3 && !["and", "the", "for", "with", "our"].includes(x))
    .map((x) => x.replace(/(es|s)$/, ""));
}

const EDIBLE = new Set(["food", "cakes", "drinks", "plants", "groceries"]);
const HEALTH_EDIBLES = /\b(fish ?oil|cod ?liver ?oil|fish|tea|teas|syrup|tonic|bitters|honey|milk|drinks?|powder)\b/g;
const COLOUR_WORDS = /\b(coffee|wine|champagne|honey|chocolate|cream|caramel|mint|peach|olive|cherry|lemon|orange|rose|milk|tea|butter|pepper|plum|berry|lime|cinnamon|mocha|vanilla|salmon|wine)\b/g;

/** How many times a category's words appear; a phrase ("reading glasses") counts for more than a single word ("glasses"). */
const count = (re: RegExp | undefined, text: string) =>
  re ? (text.match(new RegExp(re.source, "gi")) ?? []).reduce((sum, m) => sum + 1 + 0.25 * (m.trim().split(/[\s-]+/).length - 1), 0) : 0;

/**
 * The categories that fit a product best, best first: words in its name count
 * most, then its description, then the business's own categories (and its
 * own added categories, by their names). Always ends with "Other".
 */
export function suggestCategories(
  product: { title: string; description?: string | null; kind?: CategoryGroup | null },
  { businessCategories = [], custom = [] }: { businessCategories?: string[]; custom?: CustomCategory[] } = {},
): string[] {
  const title = product.title.toLowerCase();
  const description = (product.description ?? "").toLowerCase();
  const business = businessCategories.join(" ");
  const scores = new Map<string, number>();
  const add = (id: string, n: number) => n && scores.set(id, (scores.get(id) ?? 0) + n);

  for (const own of custom) {
    const words = nameWords(own.name);
    const hits = (text: string) => words.filter((x) => new RegExp(`\\b${x}(e?s)?\\b`).test(text)).length;
    add(own.id, hits(title) * 5 + hits(description) * 1.5);
  }
  // "Coffee brown gown", "Honey blonde wig": a food word used as a colour doesn't make it food.
  const named = CATEGORIES.some((c) => !EDIBLE.has(c.id) && c.strong?.test(title));
  // "Fertility tea", "Omega 3 fish oil", "Cough syrup": health products, not drinks or food.
  const health = BY_ID.get("health")!.strong!.test(title);
  const edibleTitle = (named ? title.replace(COLOUR_WORDS, " ") : title).replace(health ? HEALTH_EDIBLES : /$^/, " ");
  for (const c of CATEGORIES) {
    const t = EDIBLE.has(c.id) ? edibleTitle : title;
    add(c.id, count(c.strong, t) * 4 + count(c.weak, t) * 1 + count(c.strong, description) * 1.5 + count(c.weak, description) * 0.4);
    if (c.business?.test(business)) add(c.id, (scores.get(c.id) ?? 0) > 0 ? 2 : 0.8);
  }
  // A service reads best as a service category, a product as a product one.
  if (product.kind) for (const c of CATEGORIES) if (scores.has(c.id) && c.group === product.kind) add(c.id, 0.5);

  const ranked = [...scores.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const other = OTHER[product.kind === "service" ? "service" : "product"];
  return [...ranked.filter((id) => id !== other), other];
}

/** The best category for a product (what's picked until the business picks another). */
export function guessCategory(product: { title: string; description?: string | null; kind?: CategoryGroup | null }, ctx?: { businessCategories?: string[]; custom?: CustomCategory[] }) {
  return suggestCategories(product, ctx)[0]!;
}

/** Categories that suit the business, from its own categories (for the picker's "For your business"). */
export function categoriesForBusiness(businessCategories: string[]): string[] {
  const text = businessCategories.join(" ");
  return text ? CATEGORIES.filter((c) => c.business?.test(text)).map((c) => c.id) : [];
}
