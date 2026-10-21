// Partner brands. Each one has a folder public/<slug>/ (form, team page, config.js, products.js)
// and an entry here. Address: enquiry.kitchenwhiz.in/<slug> and /<slug>/team.
import HW_PRICES from './brands/hw-prices.js';

export const BRANDS = {
  hw: {
    name: 'Hoshizaki & Western',
    ref: 'HW', // enquiry numbers HW-1001, HW-1002…
    prices: HW_PRICES,
    priceNote: 'Dealer price (DP), GST extra',
    wef: '2026-04-01',
  },
};
