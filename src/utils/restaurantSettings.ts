import type { FoodCourtSettings } from '../types';

export const FOOD_COURT_NAME = "Chef's Canvas";

export function normalizeRestaurantSettings(settings: FoodCourtSettings): FoodCourtSettings {
  const oldCourt = /^(?:Faridpur Stadium Food Court(?: \(Stall #06\))?|FS Stadium Food Court|FS Studium Food Court)$/i.test(settings.foodCourtName.trim());
  return {
    ...settings,
    stallName: settings.stallName === 'Shahi Kacchi & Kebab (Shop 06)' ? 'Sea Slash' : settings.stallName,
    foodCourtName: oldCourt ? FOOD_COURT_NAME : settings.foodCourtName,
  };
}
