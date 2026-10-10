// FROZEN snapshot of the recipe keys and every catalogue's option ids, in order.
// The tests check that the live catalogues still start with exactly these entries.
// Only ever ADD to this file (new keys at the end of KEYS, new ids at the end of a list), and only
// after adding the same entries at the end of catalog.ts / recipe.ts. Never edit or remove a line.

export const LOCKED_KEYS = ["face","chin","fat","skin","eye","eyeC","brow","nose","lips","lipT","hair","hairC","facial","frame","build","bust","butt","outfit","top","pattern","bottom","glasses","ear","pierce","hw","hwC","watch","chain","bg","height","topStyle","bottomStyle","layer","layerC","shoes","shoeC"];

export const LOCKED_IDS: Record<string, string[]> = {
  face: ["oval","round","square","heart","long","diamond","wide","soft-square"],
  chin: ["soft","rounded","pointed","square","strong","receding","cleft","long"],
  fat: ["slim","average","full","chubby"],
  skin: ["ebony","espresso","cocoa","chestnut","mahogany","pecan","caramel","honey","sand","ivory","fair","porcelain"],
  eye: ["almond","round","hooded","upturned","downturned","wide","narrow","deep-set"],
  eyeC: ["dark-brown","brown","hazel","amber","green","blue","grey"],
  brow: ["natural","straight-thick","thin-arch","high-arch","angled","bushy","rounded","short","low-flat"],
  nose: ["button","small","straight","wide","broad","long","pointed","round","flat-bridge"],
  lips: ["natural","full","thin","wide","small","heart","pouty","broad-full"],
  lipT: ["natural","deep","rosy","berry","nude"],
  hair: ["bald","buzz","low-fade","short-coils","afro","puff","bun","cornrows","box-braids","locs","long","headwrap","ponytail"],
  hairC: ["black","dark-brown","brown","auburn","honey-blonde","grey","burgundy","platinum","red","purple","blue"],
  facial: ["none","stubble","mustache","goatee","short-beard","full-beard"],
  frame: ["masculine","feminine"],
  build: ["athletic","ectomorphic","sturdy","average","bodybuilder","lean","stocky","petite"],
  bust: ["natural","flat","small","medium","large","extra-large"],
  butt: ["flat","average","full","curvy","extra"],
  outfit: ["t-shirt","long-sleeve","hoodie","kaftan","agbada","dress","abaya","jalabiya","cute-dress","short-dress","suit","skirt-suit","swimwear"],
  top: ["navy","forest","brick","gold","white","black","plum","teal","orange","royal-blue","red","green","pink"],
  pattern: ["plain","ankara","kente","pinstripe"],
  bottom: ["charcoal","denim","khaki","white","grey","brown"],
  glasses: ["none","round","square","sunglasses"],
  ear: ["none","studs","hoops","drops"],
  pierce: ["none","helix","tragus","second-lobe","conch","helix-tragus","full-set"],
  hw: ["none","face-cap","head-tie","gele","kufi","fila","hijab"],
  hwC: ["navy","forest","brick","gold","white","black","plum","teal","orange","royal-blue","red","green","pink"],
  watch: ["none","gold","silver","smart","leather"],
  chain: ["none","gold-chain","silver-chain","gold-cuban","iced-cuban","pendant","layered"],
  bg: ["butter","sky","mint","blush","lilac","peach","aqua","cloud"],
  height: ["average","short","tall","very-short","very-tall"],
  topStyle: ["outfit","t-shirt","long-sleeve","hoodie","crop-top","tank-top","sweater","shirt","polo","blouse","dashiki","buba","senator"],
  bottomStyle: ["outfit","trousers","jeans","shorts","joggers","leggings","midi-skirt","mini-skirt","wrapper","sokoto"],
  layer: ["none","denim-jacket","bomber","blazer","cardigan","leather-jacket"],
  layerC: ["navy","forest","brick","gold","white","black","plum","teal","orange","royal-blue","red","green","pink"],
  shoes: ["outfit","sneakers","dress-shoes","loafers","heels","sandals","boots"],
  shoeC: ["default","white","black","brown","tan","red","navy","gold","nude"],
};
