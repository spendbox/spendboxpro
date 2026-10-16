# Plots: many buildings to a tile

A real Lagos neighbourhood isn't one house per 100 m square. It's dozens of small roofs packed
together at slight angles. So on the real map, a tile of low-rise property is split into plots
(`src/lib/city/plots.ts`):

- **Plot 0 is the property** you can buy, at the front of the tile on its street. It's drawn
  smaller across and a little lower (`main.s`, `main.v`), behind just a front wall and gate. Nothing
  about owning it changed: still one property per tile, with the same id, units and price. Its
  floors (`inPlot` in `src/app/play/city/levels.ts`) and its hover outline move with it, so going
  in swoops to where it stands.
- **The other plots are scenery**: up to 7 little houses (one to three low storeys; hipped,
  gabled or flat concrete roofs with a water tank; mostly rusty brown corrugated roofs) or a yard
  with a tree. Their sizes, turns and colours come from the tile's position, the same every time,
  and nothing about them is stored or owned. Richer streets get fewer, bigger houses, wider gaps
  and more yards.
- **Which tiles:** bungalows, duplexes, rooming houses, terraces, shops, mixed blocks, flats up to
  4 storeys and walled land. Towers, offices, plazas, warehouses, farms and gated estates still
  fill their tile. As the city grows (docs/GROWTH.md), a block rebuilt taller than 4 storeys
  fills its tile again and its little neighbours go. Growth still adds homes as before.
- **Drawing budget:** the little houses are only drawn within 12 tiles (about 1.2 km) of the middle
  of the drawn area (`PLOTS_NEAR` in `src/app/play/city-view.tsx`); further out, each property
  stands alone as before. They're two or three of the city's shared instanced pieces each. Across a
  whole drawn area of dense Lagos that's about +34,000 triangles (+28,000 more for shadows),
  partly paid for by the compound walls the shared tiles no longer draw.

Still to come: real street curves (side streets along their real lines), so the blocks
themselves stop looking like a grid.
