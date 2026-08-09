/**
 * Real photos for the 15 public/heritage property cards (PUBLIC_HOUSING, OLD_TONG_LAU,
 * TRANSPORT) — all sourced from Wikimedia Commons under a verified open license, hotlinked by
 * their stable upload.wikimedia.org URL. ESTATE/COMMERCIAL_LUXURY cards (private developments)
 * intentionally keep the illustrated treatment to avoid unlicensed use of a private brand's
 * building likeness — see the plan for the full rationale.
 *
 * Every entry here was individually confirmed to load and to carry a reusable license
 * (CC-BY / CC-BY-SA) before being added. Two TRANSPORT cards had no confidently-licensed
 * photo of the specific landmark and were left out on purpose, so they fall back to the
 * illustrated treatment — this is a deliberate gate, not a gap to fill in later.
 */
export interface PropertyPhoto {
  url: string;
  credit: string;
  license: string;
}

export const PROPERTY_PHOTOS: Record<string, PropertyPhoto> = {
  'public-housing-tin-shing-yuen': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/Tin_Shing_Court_2020_10_part1.jpg',
    credit: 'Qwer132477',
    license: 'CC BY-SA 4.0',
  },
  'public-housing-yau-oi-estate': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/b0/Yau_Oi_Estate_South.jpg',
    credit: 'Prosperity Horizons',
    license: 'CC BY-SA 4.0',
  },
  'public-housing-ngau-tau-kok-lower-estate': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/b2/Lower_Ngau_Tau_Kok_Estate_Overview_201708.jpg',
    credit: 'Wpcpey',
    license: 'CC BY-SA 4.0',
  },
  'public-housing-shek-lei-estate': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Shek_Lei_Estate_Block_13_and_14_-_January_2025.jpg',
    credit: 'Knowledge Era',
    license: 'CC BY-SA 4.0',
  },
  'public-housing-choi-hung-estate': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/43/Choi_Hung_Estate_2018.jpg',
    credit: 'Wpcpey',
    license: 'CC BY-SA 4.0',
  },
  'tong-lau-apliu-street': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/fe/Apliu_Street_201506.jpg',
    credit: 'Wing1990hk',
    license: 'CC BY 3.0',
  },
  'tong-lau-ladies-market': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/b2/Tung_Choi_Street_201705.JPG',
    credit: 'Wpcpey',
    license: 'CC BY-SA 4.0',
  },
  'tong-lau-nga-tsin-wai-road': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Nga_Tsin_Wai_Road.JPG',
    credit: 'Exploringlife',
    license: 'CC BY-SA 4.0',
  },
  'tong-lau-wan-chai-blue-house': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Blue_House%2C_Hong_Kong.jpg',
    credit: 'Prosperity Horizons',
    license: 'CC BY-SA 4.0',
  },
  'tong-lau-ki-lung-street': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Ki_Lung_Street_%28Hong_Kong%29.jpg',
    credit: 'Mk2010',
    license: 'CC BY-SA 3.0',
  },
  'transport-tsing-ma-bridge': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/1d/Tsing_Ma_Bridge_2008.jpg',
    credit: 'ehoba',
    license: 'CC BY-SA 2.0',
  },
  'transport-high-speed-rail': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/Hong_Kong_West_Kowloon_Station_view_201810.jpg',
    credit: 'Wpcpey',
    license: 'CC BY 4.0',
  },
  'transport-island-line': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/9d/Causeway_Bay_Station_2021_05_part2.jpg',
    credit: 'Qwer132477',
    license: 'CC BY-SA 4.0',
  },
  'transport-interchange-station': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/f6/Admiralty_Station_platforms_2022_05_part17.jpg',
    credit: 'Qwer132477',
    license: 'CC BY-SA 4.0',
  },
  'transport-third-runway': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/9c/201806_Construction_of_The_Three_Runways_System_Expansion_at_HKG.jpg',
    credit: 'MNXANL',
    license: 'CC BY-SA 4.0',
  },
};
