# Eating out

Restaurants, bars, lounges, hotel restaurants and clubs all have a menu.

## How it works
1. Go inside and **sit at a table** (tap a glowing chair). The menu won't take an order until you're sitting.
2. Tap **Order food & drinks** (in a hotel suite it's **Room service**). There are two tabs, Food and Drinks.
3. Add up to **6 things**. The button shows the bill: `Order 4 for ₦…`.
4. You pay from your money (fun first, then savings, then essentials). If you can't afford it, you're told.
5. A **waiter** in a white shirt walks over from the door with a tray, stops beside you, sets the dishes
   down on your table (food in front, drinks behind) and walks back. The food stays until you leave or
   order again.
6. Eating out lifts your **mind (+2)** and **health (+1)**, and the room sees what you ordered.

## The menu (at an ordinary restaurant)
Food: party jollof ₦6,500 · pounded yam & egusi ₦8,000 · suya platter ₦7,500 · goat pepper soup ₦6,000 ·
moi moi & pap ₦3,500 · ofada & ayamase ₦7,000 · asun ₦6,500 · grilled croaker & chips ₦15,000 ·
akara & bread ₦2,500 · efo riro & semo ₦7,500 · fried rice & turkey ₦9,000 · small chops ₦5,000 ·
chin chin & cake ₦3,000.

Drinks: Chapman ₦4,500 · zobo ₦2,500 · kunun aya ₦3,000 · pineapple-ginger ₦3,500 · virgin mojito ₦4,000 ·
palm wine ₦3,000 · malt ₦1,500 · coconut water ₦2,000.

## Dearer places
A hotel or the airport: 2.5×. A club or a tower's lounge: 2×. A mall or an office block: 1.5×.
The server works out the price from where you are, so the phone can't change it.

## Where it lives
- Menu and prices: `src/lib/world/menu.ts`
- The menu sheet: `src/app/play/activities/order.tsx`
- Paying: `src/app/play/food-actions.ts` and `game-db/120_restaurant_orders.sql` (owner runs it once)
- The waiter and the dishes: `src/app/play/city/serve.ts`
