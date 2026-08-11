import { DataSourceStatus, OperationalStatus, ProviderType, SourceHealthStatus, SourceLifecycle, SourceType } from "@prisma/client";

export const ARGUS_PUBLIC_MARKET_SEED_SOURCES = [
  ["venue_eden_park", "Eden Park official events", ["edenpark.co.nz", "www.edenpark.co.nz"], "auckland", "event"],
  ["venue_nzicc", "NZICC official events", ["nzicc.co.nz", "www.nzicc.co.nz"], "auckland", "event"],
  ["venue_sky_stadium", "Hnry Stadium official events", ["hnrystadium.co.nz", "www.hnrystadium.co.nz"], "wellington", "event"],
  ["venue_forsyth_barr", "Forsyth Barr Stadium official events", ["dunedinvenues.co.nz", "www.dunedinvenues.co.nz"], "dunedin", "event"],
  ["venue_takina", "Tākina official events", ["takina.co.nz", "www.takina.co.nz"], "wellington", "event"],
  ["venue_claudelands", "Claudelands official events", ["claudelands.co.nz", "www.claudelands.co.nz"], "waikato", "event"],
  ["cruise_port_tauranga", "Port of Tauranga cruise schedule", ["port-tauranga.co.nz", "www.port-tauranga.co.nz"], "tauranga", "transport"],
  ["cruise_centreport", "CentrePort cruise schedule", ["centreport.co.nz", "www.centreport.co.nz"], "wellington", "transport"],
  ["cruise_port_otago", "Port Otago cruise schedule", ["portotago.co.nz", "www.portotago.co.nz"], "dunedin", "transport"],
  ["airport_dunedin_live", "Dunedin Airport live flight board", ["dunedinairport.co.nz", "www.dunedinairport.co.nz"], "dunedin", "transport"],
  ["airport_rotorua_live", "Rotorua Airport live flight board", ["rotorua-airport.co.nz", "www.rotorua-airport.co.nz"], "rotorua", "transport"],
  ["airport_hamilton_live", "Hamilton Airport live flight board", ["hamiltonairport.co.nz", "www.hamiltonairport.co.nz"], "waikato", "transport"],
  ["airport_hawkes_bay_live", "Hawke's Bay Airport live flight board", ["hawkesbay-airport.co.nz", "www.hawkesbay-airport.co.nz"], "hawkes-bay", "transport"],
  ["airport_new_plymouth_live", "New Plymouth Airport live flight board", ["nplairport.co.nz", "www.nplairport.co.nz"], "taranaki", "transport"],
  ["airport_palmerston_north_live", "Palmerston North Airport live flight board", ["pnairport.co.nz", "www.pnairport.co.nz"], "manawatu", "transport"],
  ["university_otago_key_dates", "University of Otago key dates", ["www.otago.ac.nz"], "dunedin", "event"],
  ["university_victoria_key_dates", "Victoria University of Wellington key dates", ["www.wgtn.ac.nz", "search.wgtn.ac.nz"], "wellington", "event"],
  ["university_waikato_key_dates", "University of Waikato key dates", ["www.waikato.ac.nz"], "waikato", "event"],
  ["university_massey_key_dates", "Massey University key dates", ["www.massey.ac.nz"], "manawatu", "event"],
  ["university_aut_key_dates", "AUT key dates", ["www.aut.ac.nz"], "auckland", "event"],
] as const;

export function registrySourceSeedRecords() {
  const activeOtaKeys = new Set<string>(["booking", "airbnb", "expedia", "bookabach", "agoda", "trip"]);
  const ota = [
    ["booking", "Booking.com", ["booking.com"]],
    ["airbnb", "Airbnb", ["airbnb.com", "airbnb.co.nz"]],
    ["expedia", "Expedia", ["expedia.com", "expedia.co.nz"]],
    ["wotif", "Wotif", ["wotif.co.nz"]],
    ["hotels", "Hotels.com", ["hotels.com", "nz.hotels.com"]],
    ["bookabach", "Bookabach", ["bookabach.co.nz"]],
    ["vrbo", "Vrbo", ["vrbo.com"]],
    ["agoda", "Agoda", ["agoda.com"]],
    ["trip", "Trip.com", ["trip.com"]],
    ["google_hotels", "Google Hotels", ["google.com", "google.co.nz"]],
  ] as const;
  const publicSources = [
    ["linz", "LINZ New Zealand Gazetteer", ["gazetteer.linz.govt.nz"]],
    ["mbie", "MBIE Tourism Data", ["mbie.govt.nz"]],
    ["stats_nz", "Stats NZ", ["stats.govt.nz"]],
    ["mbie_tourism_flows", "MBIE Tourism Volumes & Flows", ["teic.mbie.govt.nz"]],
    ["mbie_mrte", "MBIE Monthly Regional Tourism Estimates", ["teic.mbie.govt.nz"]],
    ["mbie_ivs", "MBIE International Visitor Survey", ["teic.mbie.govt.nz"]],
    ["public_holidays_nz", "Employment New Zealand public holidays", ["employment.govt.nz"]],
    ["school_holidays_nz", "Ministry of Education school holidays", ["education.govt.nz"]],
    ["eventfinda", "Eventfinda New Zealand", ["www.eventfinda.co.nz", "eventfinda.co.nz"]],
    ["ticketmaster", "Ticketmaster New Zealand", ["www.ticketmaster.co.nz", "ticketmaster.co.nz"]],
    ["eventbrite_events", "Eventbrite New Zealand Events", ["www.eventbrite.co.nz", "eventbrite.co.nz"]],
    ["humanitix_events", "Humanitix New Zealand Events", ["humanitix.com", "events.humanitix.com"]],
    ["school_sport_nz", "School Sport New Zealand Events", ["www.sporty.co.nz"]],
    ["school_sport_canterbury", "School Sport Canterbury Events", ["www.sporty.co.nz", "teamup.com"]],
    ["ticketek_events", "Ticketek New Zealand Events", ["www.ticketek.co.nz", "premier.ticketek.co.nz"]],
    ["venue_calendars", "Auckland Live Events", ["www.aucklandlive.co.nz"]],
    ["council_calendars", "Auckland Council OurAuckland Events", ["ourauckland.aucklandcouncil.govt.nz"]],
    ["university_calendars", "University of Auckland Events", ["apis.auckland.ac.nz"]],
    ["rto_calendars", "ChristchurchNZ Events", ["www.christchurchnz.com"]],
    ["wellingtonnz_events", "WellingtonNZ Official Events", ["www.wellingtonnz.com"]],
    ["waikatonz_events", "Hamilton & Waikato Tourism Official Events", ["www.waikatonz.com"]],
    ["queenstownnz_events", "Destination Queenstown Official Events", ["www.queenstownnz.co.nz"]],
    ["tauponz_events", "Destination Great Lake Taupō Official Events", ["www.lovetaupo.com"]],
    ["southlandnz_events", "Great South Official Events", ["southlandnz.com"]],
    ["hawkesbaynz_events", "Hawke's Bay Tourism Official Events", ["www.hawkesbaynz.com"]],
    ["taranakienz_events", "Venture Taranaki Official Events", ["listings.venture.org.nz"]],
    ["nelsontasman_events", "Nelson Regional Development Agency Official Events", ["www.nelsontasman.nz"]],
    ["tauranga_events", "Tauranga City Council What's On Events", ["www.whatsontauranga.co.nz"]],
    ["manawatunz_events", "Central Economic Development Agency Official Events", ["manawatunz.co.nz"]],
    ["northland_events", "Whangārei District Council Official Events", ["www.wdc.govt.nz"]],
    ["rotoruanz_events", "RotoruaNZ Official Events", ["www.rotoruanz.com"]],
    ["dunedinnz_events", "DunedinNZ Official Events", ["www.dunedinnz.com"]],
    ["te_pae_events", "Te Pae Christchurch Events", ["www.tepae.co.nz"]],
    ["venues_otautahi_events", "Venues Otautahi Events", ["venuesotautahi.co.nz", "api.storyblok.com"]],
    ["isaac_theatre_royal_events", "Isaac Theatre Royal Events", ["isaactheatreroyal.co.nz"]],
    ["christchurch_council_events", "Christchurch City Council What's On", ["www.ccc.govt.nz"]],
    ["ara_academic_dates", "Ara Academic Calendar", ["www.ara.ac.nz"]],
    ["canterbury_major_annual_events", "Canterbury Independent Major Annual Events", ["www.theshow.co.nz", "www.christchurchmarathon.co.nz"]],
    ["metservice", "MetService CAP weather warnings", ["alerts.metservice.com", "www.metservice.com", "metservice.com"]],
    ["nzta", "NZTA Journey Planner", ["nzta.govt.nz"]],
    ["geonet", "GeoNet", ["api.geonet.org.nz"]],
    ["doc_alerts", "DOC Regional Recreation Alerts", ["www.doc.govt.nz"]],
    ["interislander_alerts", "Interislander Service Alerts", ["www.interislander.co.nz"]],
    ["ski_seasons_nz", "Official New Zealand Ski Season Dates", ["www.theremarkables.co.nz", "www.mthutt.co.nz", "www.whakapapa.com"]],
    ["airport_data", "Queenstown Airport Flights", ["www.queenstownairport.co.nz"]],
    ["queenstown_airport_monthly", "Queenstown Airport Monthly Passengers", ["www.queenstownairport.co.nz", "app.powerbi.com", "wabi-australia-southeast-api.analysis.windows.net"]],
    ["auckland_airport_monthly", "Auckland Airport Monthly Passengers", ["corporate.aucklandairport.co.nz"]],
    ["mot_airline_performance", "Ministry of Transport Airline On-time Performance", ["www.transport.govt.nz"]],
    ["wellington_airport", "Wellington Airport Flights", ["www.wellingtonairport.co.nz"]],
    ["wellington_airport_monthly", "Wellington Airport Monthly Passengers", ["www.wellingtonairport.co.nz"]],
    ["christchurch_airport", "Christchurch Airport Flights", ["www.christchurchairport.co.nz"]],
    ["christchurch_sports", "Christchurch Official Sports Fixtures", ["www.crusaders.co.nz", "www.tactixnetball.co.nz", "www.canterburycricket.org.nz"]],
    ["christchurch_university_dates", "Christchurch University Demand Dates", ["www.canterbury.ac.nz", "www.lincoln.ac.nz"]],
    ["christchurch_racing", "Christchurch Racing and Cup Week", ["www.addington.co.nz", "racing.riccartonpark.nz"]],
    ["christchurch_cruise", "Christchurch Cruise Schedule", ["www.christchurchnz.com", "app.powerbi.com", "wabi-south-east-asia-api.analysis.windows.net"]],
    ["christchurch_airport_monthly", "Christchurch Airport Monthly Passengers", ["www.christchurchairport.co.nz"]],
    ["port_and_cruise", "Port and Cruise Schedules", ["poal.co.nz"]],
    ["fx_rates", "Reserve Bank of New Zealand Exchange Rates", ["rbnz.govt.nz"]],
    ...ARGUS_PUBLIC_MARKET_SEED_SOURCES.map(([key, name, domains]) => [key, name, domains] as const),
  ] as const;
  const argusPublicMarketSourceKeys = new Set<string>(ARGUS_PUBLIC_MARKET_SEED_SOURCES.map(([key]) => key));

  return [
    ...ota.map(([key, name, supportedDomains]) => ({
      key, name, supportedDomains, providerType: ProviderType.OTA, sourceType: key === "google_hotels" ? SourceType.META_SEARCH : SourceType.OTA,
      status: DataSourceStatus.PILOT, healthStatus: SourceHealthStatus.DEGRADED, enabled: activeOtaKeys.has(key), isDemo: false, errorRate: 0,
      lifecycle: SourceLifecycle.RESEARCH,
      operationalStatus: OperationalStatus.HEALTHY,
      lastSuccessAt: null,
      environments: ["DEVELOPMENT", "TEST"] as const, adapterKey: `ota:${key}:v1`, accessMethod: "PUBLIC_WEB_RESEARCH_FIXTURE",
    })),
    ...publicSources.map(([key, name, supportedDomains]) => {
      const liveTransportImplemented = argusPublicMarketSourceKeys.has(key) || ["public_holidays_nz", "school_holidays_nz", "ski_seasons_nz", "geonet", "doc_alerts", "interislander_alerts", "eventfinda", "ticketmaster", "eventbrite_events", "humanitix_events", "school_sport_nz", "school_sport_canterbury", "ticketek_events", "mbie", "stats_nz", "mbie_tourism_flows", "mbie_mrte", "mbie_ivs", "metservice", "nzta", "fx_rates", "linz", "venue_calendars", "council_calendars", "university_calendars", "rto_calendars", "wellingtonnz_events", "waikatonz_events", "queenstownnz_events", "tauponz_events", "southlandnz_events", "hawkesbaynz_events", "taranakienz_events", "nelsontasman_events", "tauranga_events", "manawatunz_events", "northland_events", "rotoruanz_events", "dunedinnz_events", "te_pae_events", "venues_otautahi_events", "isaac_theatre_royal_events", "christchurch_council_events", "ara_academic_dates", "canterbury_major_annual_events", "airport_data", "queenstown_airport_monthly", "auckland_airport_monthly", "mot_airline_performance", "wellington_airport", "wellington_airport_monthly", "christchurch_airport", "christchurch_sports", "christchurch_university_dates", "christchurch_racing", "christchurch_cruise", "christchurch_airport_monthly", "port_and_cruise"].includes(key);
      const locallyVerified = ["public_holidays_nz", "school_holidays_nz", "geonet"].includes(key);
      const browserSource = argusPublicMarketSourceKeys.has(key) || ["fx_rates", "school_sport_nz", "school_sport_canterbury", "ticketek_events", "dunedinnz_events", "auckland_airport_monthly", "mot_airline_performance"].includes(key);
      const adapterKey = argusPublicMarketSourceKeys.has(key) ? `public:${key}:argus-v1`
        : key === "ticketmaster" ? "public:ticketmaster:http-listing-argus-detail-v1"
        : key === "eventfinda" ? "public:eventfinda:http-v1"
          : key === "eventbrite_events" ? "public:eventbrite:jsonld-listing-v1"
            : key === "humanitix_events" ? "public:humanitix:jsonld-listing-v1"
              : key === "school_sport_nz" || key === "school_sport_canterbury" ? `public:${key}:argus-v1`
                : key === "ticketek_events" ? "public:ticketek_events:argus-v1"
          : key === "fx_rates" ? "public:fx_rates:rbnz-browser-v1"
                      : key === "geonet" ? "public:geonet:hazards-v3"
                        : key === "doc_alerts" ? "public:doc:regional-alerts-json-v1"
                          : key === "interislander_alerts" ? "public:interislander:service-alerts-json-v1"
                            : key === "ski_seasons_nz" ? "public:nz-ski-seasons:official-html-v1"
                        : key === "mbie" ? "public:mbie:adp-csv-v2"
              : key === "mbie_tourism_flows" ? "public:mbie_tourism_flows:xlsx-v1"
                : key === "mbie_mrte" ? "public:mbie_mrte:xlsx-v1"
                  : key === "mbie_ivs" ? "public:mbie_ivs:annual-summary-json-v1"
              : key === "stats_nz" ? "public:stats_nz:international-travel-v1"
                : key === "nzta" ? "public:nzta:journey-planner-delays-v1"
                  : key === "metservice" ? "public:metservice:cap-rss-v1"
                    : key === "linz" ? "public:linz:gazetteer-search-v1"
                      : key === "venue_calendars" ? "public:venue-calendars:auckland-live-v1"
                        : key === "council_calendars" ? "public:council-calendars:our-auckland-v1"
                          : key === "university_calendars" ? "public:university-calendars:uoa-events-v1"
                            : key === "rto_calendars" ? "public:rto-calendars:christchurchnz-v1"
                              : key === "wellingtonnz_events" ? "public:wellingtonnz_events:wellingtonnz-html-v1"
                                : key === "waikatonz_events" ? "public:waikatonz_events:waikatonz-api-v1"
                                  : key === "queenstownnz_events" ? "public:queenstownnz_events:queenstownnz-simpleview-v1"
                                    : key === "tauponz_events" ? "public:tauponz_events:tauponz-ajax-html-v1"
                                      : key === "southlandnz_events" ? "public:southlandnz_events:southlandnz-simpleview-v1"
                                        : key === "hawkesbaynz_events" ? "public:hawkesbaynz_events:hawkesbaynz-epoch-html-v1"
                                          : key === "taranakienz_events" ? "public:taranakienz_events:taranaki-graphql-v1"
                                            : key === "nelsontasman_events" ? "public:nelsontasman_events:nelsontasman-featured-html-v1"
                                              : key === "tauranga_events" ? "public:tauranga_events:tauranga-carousel-html-v1"
                                                : key === "manawatunz_events" ? "public:manawatunz_events:manawatu-wordpress-html-v1"
                                                  : key === "northland_events" ? "public:northland_events:whangarei-opencities-html-v1"
                                                    : key === "rotoruanz_events" ? "public:rotoruanz_events:rotoruanz-simple-tile-html-v1"
                                                      : key === "dunedinnz_events" ? "public:dunedinnz_events:argus-v1"
                                                        : key === "auckland_airport_monthly" ? "public:auckland-airport:monthly-passengers-argus-v1"
                                                          : key === "mot_airline_performance" ? "public:mot:airline-performance-argus-v1"
                              : key === "te_pae_events" ? "public:te-pae-events:html-v1"
                                : key === "venues_otautahi_events" ? "public:venues-otautahi:storyblok-v1"
                              : key === "isaac_theatre_royal_events" ? "public:isaac-theatre-royal-events:html-v1"
                                : key === "christchurch_council_events" ? "public:christchurch_council_events:official-html-pagination-v1"
                                  : key === "ara_academic_dates" ? "public:ara_academic_dates:academic-calendar-html-v1"
                                    : key === "canterbury_major_annual_events" ? "public:canterbury_major_annual_events:official-event-page-html-v1"
                                : key === "christchurch_airport" ? "public:christchurch-airport:flights-json-v1"
                                  : key === "christchurch_sports" ? "public:christchurch_sports:events-v1"
                                    : key === "christchurch_university_dates" ? "public:christchurch_university_dates:key-dates-v2"
                                      : key === "christchurch_racing" ? "public:christchurch_racing:racing-v1"
                                        : key === "christchurch_cruise" ? "public:christchurch_cruise:powerbi-v1"
                                          : key === "christchurch_airport_monthly" ? "public:christchurch_airport_monthly:passenger-table-v1"
                              : key === "airport_data" ? "public:airport-data:queenstown-flights-v2"
                                : key === "queenstown_airport_monthly" ? "public:queenstown-airport:monthly-passengers-powerbi-v1"
                                : key === "wellington_airport" ? "public:wellington-airport:flight-board-html-v1"
                                  : key === "wellington_airport_monthly" ? "public:wellington-airport:monthly-passengers-xlsx-v1"
                                : key === "port_and_cruise" ? "public:port-and-cruise:poal-csv-v1"
              : `public:${key}:v1`;
      const accessMethod = argusPublicMarketSourceKeys.has(key) ? "PUBLIC_WEB_ARGUS_READ_ONLY"
        : key === "ticketmaster" ? "PUBLIC_HTTP_LISTING_ARGUS_DETAIL"
        : key === "eventfinda" ? "PUBLIC_HTTP_HTML_JSONLD"
          : ["eventbrite_events", "humanitix_events"].includes(key) ? "PUBLIC_HTML_JSONLD"
            : ["school_sport_nz", "school_sport_canterbury", "ticketek_events", "dunedinnz_events", "auckland_airport_monthly", "mot_airline_performance"].includes(key) ? "PUBLIC_WEB_ARGUS_READ_ONLY"
      : key === "fx_rates" ? "OFFICIAL_PUBLIC_HTML_BROWSER"
        : key === "mbie" ? "OFFICIAL_PUBLIC_CSV_RANGE"
          : ["mbie_tourism_flows", "mbie_mrte"].includes(key) ? "OFFICIAL_PUBLIC_XLSX"
            : key === "mbie_ivs" ? "OFFICIAL_PUBLIC_JSON"
          : key === "stats_nz" ? "OFFICIAL_PUBLIC_HTML_EMBEDDED_JSON"
            : key === "nzta" ? "OFFICIAL_PUBLIC_GEOJSON"
              : key === "metservice" ? "OFFICIAL_PUBLIC_CAP_RSS"
                : key === "linz" ? "OFFICIAL_PUBLIC_JSON"
                  : key === "venue_calendars" || key === "rto_calendars" || key === "waikatonz_events" ? "OFFICIAL_PUBLIC_JSON_PAGINATED"
                    : key === "queenstownnz_events" ? "OFFICIAL_PUBLIC_JSON_DISCOVERED"
                      : key === "southlandnz_events" ? "OFFICIAL_PUBLIC_JSON_DISCOVERED"
                        : key === "tauponz_events" ? "OFFICIAL_PUBLIC_HTML_PAGINATED"
                          : key === "hawkesbaynz_events" ? "OFFICIAL_PUBLIC_HTML"
                            : key === "taranakienz_events" ? "OFFICIAL_PUBLIC_GRAPHQL"
                              : key === "nelsontasman_events" ? "OFFICIAL_PUBLIC_HTML"
                                : ["tauranga_events", "northland_events", "rotoruanz_events"].includes(key) ? "OFFICIAL_PUBLIC_HTML"
                                  : key === "manawatunz_events" ? "OFFICIAL_PUBLIC_HTML_PAGINATED"
                    : key === "wellingtonnz_events" ? "OFFICIAL_PUBLIC_HTML"
                    : key === "council_calendars" ? "OFFICIAL_PUBLIC_HTML_PAGINATED"
                      : key === "venues_otautahi_events" ? "PUBLIC_HTML_DISCOVERED_JSON"
                        : key === "christchurch_council_events" ? "OFFICIAL_PUBLIC_HTML_PAGINATED"
                        : key === "christchurch_airport" ? "PUBLIC_JSON"
                          : key === "christchurch_cruise" ? "OFFICIAL_PUBLIC_HTML_DISCOVERED_JSON"
                            : key === "christchurch_university_dates" ? "OFFICIAL_PUBLIC_HTML_AND_ARGUS"
                            : ["christchurch_sports", "christchurch_racing", "christchurch_airport_monthly"].includes(key) ? "OFFICIAL_PUBLIC_HTML"
                        : ["te_pae_events", "isaac_theatre_royal_events", "ara_academic_dates", "canterbury_major_annual_events"].includes(key) ? "OFFICIAL_PUBLIC_HTML"
                      : key === "wellington_airport" ? "OFFICIAL_PUBLIC_HTML"
                        : key === "wellington_airport_monthly" ? "OFFICIAL_PUBLIC_HTML_XLSX"
                      : key === "queenstown_airport_monthly" ? "OFFICIAL_PUBLIC_HTML_POWERBI_JSON"
                        : ["doc_alerts", "interislander_alerts"].includes(key) ? "OFFICIAL_PUBLIC_JSON"
                          : key === "ski_seasons_nz" ? "OFFICIAL_PUBLIC_HTML"
                      : key === "university_calendars" || key === "airport_data" ? "OFFICIAL_PUBLIC_JSON"
                        : key === "port_and_cruise" ? "OFFICIAL_PUBLIC_CSV"
          : browserSource ? "PUBLIC_WEB_BROWSER_READ_ONLY"
            : "OFFICIAL_PUBLIC_SOURCE";
      return {
        key, name, supportedDomains, providerType: ProviderType.PUBLIC, sourceType: SourceType.PUBLIC_DATA,
        status: locallyVerified ? DataSourceStatus.PILOT : DataSourceStatus.UNKNOWN,
        healthStatus: locallyVerified ? SourceHealthStatus.HEALTHY : SourceHealthStatus.DEGRADED,
        enabled: true, isDemo: false, errorRate: 0,
        lifecycle: locallyVerified ? SourceLifecycle.PILOT : SourceLifecycle.RESEARCH, operationalStatus: locallyVerified ? OperationalStatus.HEALTHY : liveTransportImplemented ? OperationalStatus.DEGRADED : OperationalStatus.UNCONFIGURED,
        environments: ["DEVELOPMENT", "TEST", "PILOT"] as const, adapterKey, accessMethod,
        concurrencyLimit: browserSource || ["eventfinda", "ticketmaster", "eventbrite_events", "humanitix_events", "mbie", "mbie_tourism_flows", "mbie_mrte", "mbie_ivs", "stats_nz", "metservice", "nzta", "doc_alerts", "interislander_alerts", "ski_seasons_nz", "linz", "venue_calendars", "council_calendars", "university_calendars", "rto_calendars", "wellingtonnz_events", "waikatonz_events", "queenstownnz_events", "tauponz_events", "southlandnz_events", "hawkesbaynz_events", "taranakienz_events", "nelsontasman_events", "tauranga_events", "manawatunz_events", "northland_events", "te_pae_events", "venues_otautahi_events", "isaac_theatre_royal_events", "christchurch_council_events", "ara_academic_dates", "canterbury_major_annual_events", "airport_data", "queenstown_airport_monthly", "wellington_airport", "wellington_airport_monthly", "christchurch_airport", "christchurch_sports", "christchurch_university_dates", "christchurch_racing", "christchurch_cruise", "christchurch_airport_monthly", "port_and_cruise"].includes(key) ? 1 : 2,
        dailyBudget: key === "ticketmaster" ? 20
          : key === "eventfinda" ? 2_500
            : key === "metservice" ? 288
              : key === "christchurch_airport" ? 192
                : key === "christchurch_sports" ? 24
                  : key === "christchurch_racing" ? 12
                    : ["christchurch_university_dates", "christchurch_cruise", "christchurch_airport_monthly"].includes(key) ? 4
                : ["nzta", "airport_data", "wellington_airport"].includes(key) ? 96
                  : key === "queenstown_airport_monthly" ? 6
                  : ["auckland_airport_monthly", "mot_airline_performance"].includes(key) ? 4
                  : key === "wellington_airport_monthly" ? 4
                : ["council_calendars", "rto_calendars", "linz"].includes(key) ? 100
                  : key === "waikatonz_events" ? 72
                    : key === "wellingtonnz_events" ? 24
                      : key === "queenstownnz_events" ? 24
                        : ["tauponz_events", "southlandnz_events"].includes(key) ? 24
                          : key === "hawkesbaynz_events" ? 24
                            : key === "taranakienz_events" ? 24
                              : key === "nelsontasman_events" ? 24
                                : ["tauranga_events", "manawatunz_events", "northland_events", "rotoruanz_events", "dunedinnz_events"].includes(key) ? 24
                  : key === "venue_calendars" ? 48
                    : ["venues_otautahi_events", "isaac_theatre_royal_events"].includes(key) ? 48
                      : key === "christchurch_council_events" ? 48
                        : ["ara_academic_dates", "canterbury_major_annual_events"].includes(key) ? 4
                      : ["eventbrite_events", "humanitix_events"].includes(key) ? 24
                        : ["school_sport_nz", "school_sport_canterbury"].includes(key) ? 4
                          : key === "ticketek_events" ? 20
                        : key === "doc_alerts" ? 14
                          : key === "interislander_alerts" ? 48
                            : key === "ski_seasons_nz" ? 3
                        : ["university_calendars", "te_pae_events", "port_and_cruise"].includes(key) ? 24
                      : ["mbie", "mbie_tourism_flows", "mbie_mrte", "mbie_ivs", "fx_rates"].includes(key) ? 4
                        : key === "stats_nz" ? 8 : 2_000,
      };
    }),
  ];
}
