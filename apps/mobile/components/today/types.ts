// Shape interfaces consumed by Today strip components.
//
// These describe the rendered card payloads — the API contract shapes
// (`@mei/types`) are adapted to these in the screen, so component code
// stays agnostic of how the data is sourced (mock, REST, future cache).

import type { Occasion } from '@mei/types';

export interface TodayUserHeader {
  firstName: string;
  city: string;
  selfieCount: number;
}

export interface TodayWeather {
  tempC: number;
  condition: string;
  city: string;
}

export interface TodayEventCard {
  id: string;
  startLabel: string; // "11:00"
  title: string;
  locationName: string;
  occasion: Occasion;
}

export interface TodayCommunityLook {
  id: string;
  initials: string;
  username: string;
}

export interface TodayFashionItem {
  id: string;
  source: string; // "Paris FW"
  caption: string;
}
