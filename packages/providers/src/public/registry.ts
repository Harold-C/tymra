import type { PublicDataAdapter } from "../adapter-types";
import { officialNzSourceAdapters } from "../official-nz-adapters";
import { christchurchEventAdapters } from "../christchurch-event-adapters";
import { christchurchDemandAdapters } from "../christchurch-demand-adapters";
import { christchurchPriorityAdapters } from "../christchurch-priority-adapters";
import { publicEventPlatformAdapters } from "../public-event-platform-adapters";
import { publicEventWebAdapters } from "../public-event-web-adapters";
import { regionalMarketAdapters } from "../regional-market-adapters";
import { airportMonthlyAdapters } from "../airport-monthly-adapters";
import { mbieTourismAdapters } from "../mbie-tourism-adapters";
import { queenstownAirportMonthlyAdapters } from "../queenstown-airport-monthly-adapter";
import { accessDisruptionAdapters } from "../access-disruption-adapters";
import { skiSeasonAdapters } from "../ski-season-adapter";
import { aviationArgusAdapters } from "../aviation-argus-adapters";
import { argusPublicMarketAdapters } from "../argus-public-market-adapters";
import { OfficialHtmlCalendarAdapter, parseEmploymentPublicHolidays, parseEducationSchoolHolidays } from "./calendar";
import { GeoNetAdapter } from "./geonet";
import { MbieAccommodationAdapter } from "./mbie-accommodation";
import { RbnzFxBrowserAdapter } from "./rbnz-fx";
import { StatsNzInternationalTravelAdapter } from "./stats-nz-travel";
import { NztaJourneyPlannerAdapter } from "./nzta";
import { MetServiceCapAdapter } from "./metservice-cap";

export const publicDataAdapters: Record<string, PublicDataAdapter> = {
  public_holidays_nz: new OfficialHtmlCalendarAdapter("public_holidays_nz", "Employment New Zealand public holidays", "https://www.employment.govt.nz/leave-and-holidays/public-holidays/public-holidays-and-anniversary-dates", parseEmploymentPublicHolidays),
  school_holidays_nz: new OfficialHtmlCalendarAdapter("school_holidays_nz", "Ministry of Education school holidays", "https://www.education.govt.nz/school-terms-and-holidays-dates", parseEducationSchoolHolidays),
  geonet: new GeoNetAdapter(),
  mbie: new MbieAccommodationAdapter(),
  stats_nz: new StatsNzInternationalTravelAdapter(),
  nzta: new NztaJourneyPlannerAdapter(),
  metservice: new MetServiceCapAdapter(),
  fx_rates: new RbnzFxBrowserAdapter(),
  ...publicEventWebAdapters,
  ...officialNzSourceAdapters,
  ...christchurchEventAdapters,
  ...christchurchDemandAdapters,
  ...christchurchPriorityAdapters,
  ...publicEventPlatformAdapters,
  ...regionalMarketAdapters,
  ...airportMonthlyAdapters,
  ...mbieTourismAdapters,
  ...queenstownAirportMonthlyAdapters,
  ...accessDisruptionAdapters,
  ...skiSeasonAdapters,
  ...aviationArgusAdapters,
  ...argusPublicMarketAdapters,
};
