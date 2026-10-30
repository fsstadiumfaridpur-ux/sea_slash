# Saved menu and costing

Menu edits are drafts until Save Menu Item succeeds in Supabase. The saved menu
list updates only after that confirmation. A failed save keeps the draft open.
Saving merges the item into the latest menu list and retries revision conflicts,
so another dish added in another session is not overwritten by a stale list.
Menu data no longer silently uploads when the page is opened. Operational reset
does not replace the real menu with demo dishes. Backups include menu recipes and
cost setup; restoring a menu backup is an explicit administrator action.

## Per-portion figures

Direct Cost items store an entered per-portion cost instead of calculating a
recipe. Hidden recipe lines and extra recipe costs are not added to that amount.
Direct items default to excluding rent, LPG, staff and commission. Individual
operating cost checkboxes are saved with each item; commission can be included
without a monthly volume, while any selected fixed-cost allocation requires it.
Recipe items without these settings retain their existing full-cost calculation.

- Food-only cost = inventory-priced recipe ingredients + extra food/packaging cost.
- Food-only profit = selling price - food-only cost.
- Rent allocation = configured monthly rent / expected total monthly portions.
- Staff allocation = active monthly salaries + daily wages multiplied by operating
  days, divided by expected total monthly portions.
- LPG allocation = monthly LPG budget / expected total monthly portions.
- Commission = selling price multiplied by the configured commission rate (10%
  in the current restaurant settings).
- Full cost = food-only cost + rent + staff + LPG + commission.
- Net profit = selling price - full cost.
- Net margin = net profit divided by selling price.

Fixed operating budgets are allocated equally across all planned portions sold,
not once for each dish on the menu. Enter the total portions across the entire
restaurant, not the number of menu items or the number of customer orders.
These are estimated per-portion operating costs and profits, not recorded sales
or realized monthly profit. No separate generic variable-cost percentage or
other fixed budget is added on top of the named costs.

When monthly portions are unset or ingredient costs are missing, the affected
figures are unavailable instead of being assumed zero. LPG starts at zero until
you supply and save the actual budget. Renaming or repricing an inventory item
affects current recipe costing; menu rows are not historical cost snapshots.

## Suggested prices

The Recipe Calculator tab opens the full-page ingredient editor alongside the
Saved Menu tab. Select a saved dish or use Add Menu Item for a new recipe. Both
views use the same draft and saving logic. Switching dishes or closing an edited
recipe asks before discarding unsaved changes. Margin Comparison displays all
five target prices, profits and achieved margins using the selected cost basis.

Choose a 30%, 35%, 40%, 50% or 60% profit margin in the menu editor. With operating
costs included, the price is `(food cost + allocated fixed cost) / (1 - commission
rate - target margin)`. Without operating costs, it is
`food cost / (1 - target margin)`. Suggestions round up to the next BDT 10. These
are margins on selling price, not percentage markups on ingredient cost. Use
Suggested Price changes the draft; Save Menu Item commits the resulting price.
