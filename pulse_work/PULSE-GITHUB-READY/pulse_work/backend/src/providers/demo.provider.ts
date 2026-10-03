import type { NewsProvider, RawNewsItem } from './types';
import type { NewsCategory } from '../types/domain';

/**
 * DEMO provider — fictional, clearly-labelled sample data.
 *
 * It exists so the entire application (globe, regions, markers, filters,
 * search, panels, animations) can be exercised without any API key. Every item
 * is marked origin:"demo" and the UI displays a "DEMO DATA" badge. These are
 * NOT real news and must never be presented as such.
 */

interface DemoSeed {
  title: string;
  description: string;
  source: string;
  language: string;
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  category: NewsCategory;
  minutesAgo: number;
}

const SEEDS: DemoSeed[] = [
  { title: '[DEMO] Coastal communities test new storm siren network', description: 'Sample scenario: a regional civil-protection drill exercises an early-warning siren grid along the coast.', source: 'Demo Wire', language: 'en', country: 'MX', region: 'Tamaulipas', city: 'Reynosa', latitude: 26.09, longitude: -98.28, category: 'weather', minutesAgo: 4 },
  { title: '[DEMO] Industrial corridor reports record logistics volume', description: 'Sample scenario: freight activity rises at a northern industrial corridor, according to a fictional trade group.', source: 'Demo Business Daily', language: 'en', country: 'MX', region: 'Nuevo León', city: 'Monterrey', latitude: 25.68, longitude: -100.31, category: 'economy', minutesAgo: 22 },
  { title: '[DEMO] University opens climate-resilience research lab', description: 'Sample scenario: a new laboratory will study drought resilience and water management.', source: 'Demo Science', language: 'es', country: 'MX', region: 'Jalisco', city: 'Guadalajara', latitude: 20.67, longitude: -103.35, category: 'science', minutesAgo: 51 },
  { title: '[DEMO] Grid operator schedules maintenance outage', description: 'Sample scenario: a fictional utility announces a planned maintenance window affecting several districts.', source: 'Demo Energy Desk', language: 'en', country: 'US', region: 'Texas', city: 'Houston', latitude: 29.76, longitude: -95.37, category: 'technology', minutesAgo: 9 },
  { title: '[DEMO] Metro line extension enters final testing phase', description: 'Sample scenario: transit officials begin trial runs on a fictional metro extension.', source: 'Demo Transit', language: 'en', country: 'US', region: 'California', city: 'Los Angeles', latitude: 34.05, longitude: -118.24, category: 'general', minutesAgo: 37 },
  { title: '[DEMO] Coastal wildfire prompts evacuation exercise', description: 'Sample scenario: a simulated evacuation exercise is held in a fire-prone region.', source: 'Demo Emergency', language: 'en', country: 'US', region: 'California', city: 'San Francisco', latitude: 37.77, longitude: -122.42, category: 'emergency', minutesAgo: 66 },
  { title: '[DEMO] Robotics expo showcases warehouse automation', description: 'Sample scenario: fictional exhibitors demonstrate autonomous logistics robots.', source: 'Demo Tech Review', language: 'ja', country: 'JP', region: 'Tokyo', city: 'Tokyo', latitude: 35.68, longitude: 139.69, category: 'technology', minutesAgo: 14 },
  { title: '[DEMO] Traditional craft festival draws record visitors', description: 'Sample scenario: a fictional cultural festival celebrates regional crafts.', source: 'Demo Culture', language: 'ja', country: 'JP', region: 'Osaka', city: 'Osaka', latitude: 34.69, longitude: 135.5, category: 'culture', minutesAgo: 88 },
  { title: '[DEMO] River monitoring sensors detect rising levels', description: 'Sample scenario: fictional hydrological sensors report elevated river levels after heavy rain.', source: 'Demo Environment', language: 'en', country: 'DE', region: 'Bavaria', city: 'Munich', latitude: 48.14, longitude: 11.58, category: 'environment', minutesAgo: 27 },
  { title: '[DEMO] Parliament debates digital privacy framework', description: 'Sample scenario: legislators discuss a fictional data-protection framework.', source: 'Demo Politics', language: 'en', country: 'FR', region: 'Île-de-France', city: 'Paris', latitude: 48.86, longitude: 2.35, category: 'politics', minutesAgo: 43 },
  { title: '[DEMO] Observatory reports new comet tracking campaign', description: 'Sample scenario: a fictional observatory launches a public tracking campaign.', source: 'Demo Science', language: 'en', country: 'GB', region: 'England', city: 'London', latitude: 51.51, longitude: -0.13, category: 'science', minutesAgo: 120 },
  { title: '[DEMO] Startup unveils low-power edge computing chip', description: 'Sample scenario: a fictional company presents a chip aimed at edge devices.', source: 'Demo Tech Review', language: 'en', country: 'IN', region: 'Karnataka', city: 'Bengaluru', latitude: 12.97, longitude: 77.59, category: 'technology', minutesAgo: 33 },
  { title: '[DEMO] Football league announces fixture calendar', description: 'Sample scenario: a fictional sports league publishes its season schedule.', source: 'Demo Sports', language: 'es', country: 'AR', region: 'Buenos Aires', city: 'Buenos Aires', latitude: -34.6, longitude: -58.38, category: 'sports', minutesAgo: 58 },
  { title: '[DEMO] Air quality network adds new monitoring stations', description: 'Sample scenario: fictional stations are added to an air-quality network.', source: 'Demo Environment', language: 'pt', country: 'BR', region: 'São Paulo', city: 'São Paulo', latitude: -23.55, longitude: -46.63, category: 'environment', minutesAgo: 75 },
  { title: '[DEMO] Cybersecurity drill simulates ransomware response', description: 'Sample scenario: a fictional exercise tests response to a simulated ransomware incident.', source: 'Demo Cyber', language: 'en', country: 'AU', region: 'New South Wales', city: 'Sydney', latitude: -33.87, longitude: 151.21, category: 'internet', minutesAgo: 18 },
  { title: '[DEMO] Central bank publishes financial stability note', description: 'Sample scenario: a fictional stability note reviews household credit trends.', source: 'Demo Finance', language: 'en', country: 'ZA', region: 'Gauteng', city: 'Johannesburg', latitude: -26.2, longitude: 28.05, category: 'economy', minutesAgo: 95 },
  { title: '[DEMO] Peace talks resume in fictional mediation round', description: 'Sample scenario: a fictional mediation round continues between two delegations.', source: 'Demo World', language: 'en', country: 'EG', region: 'Cairo', city: 'Cairo', latitude: 30.04, longitude: 31.24, category: 'conflict', minutesAgo: 140 },
  { title: '[DEMO] Museum digitises regional archive collection', description: 'Sample scenario: a fictional museum publishes a digitised archive.', source: 'Demo Culture', language: 'es', country: 'ES', region: 'Community of Madrid', city: 'Madrid', latitude: 40.42, longitude: -3.7, category: 'culture', minutesAgo: 160 },
  { title: '[DEMO] National rail expands night-service pilot', description: 'Sample scenario: a fictional rail operator extends a night-service trial.', source: 'Demo Transit', language: 'en', country: 'IT', region: 'Lazio', city: 'Rome', latitude: 41.9, longitude: 12.5, category: 'general', minutesAgo: 205 },
  { title: '[DEMO] Earthquake early-warning app reaches milestone', description: 'Sample scenario: a fictional app reports one million installs.', source: 'Demo Emergency', language: 'en', country: 'ID', region: 'Jakarta', city: 'Jakarta', latitude: -6.21, longitude: 106.85, category: 'weather', minutesAgo: 12 },
  { title: '[DEMO] Country-wide fibre rollout reaches rural districts', description: 'Sample scenario: a fictional rollout connects rural districts.', source: 'Demo Telecom', language: 'en', country: 'KE', region: 'Nairobi', city: 'Nairobi', latitude: -1.29, longitude: 36.82, category: 'internet', minutesAgo: 130 },
  { title: '[DEMO] Health agency reviews seasonal vaccination plan', description: 'Sample scenario: a fictional agency reviews a vaccination plan.', source: 'Demo Health', language: 'en', country: 'CA', region: 'Ontario', city: 'Toronto', latitude: 43.65, longitude: -79.38, category: 'general', minutesAgo: 48 },
  { title: '[DEMO] Flood barriers tested ahead of monsoon season', description: 'Sample scenario: fictional barriers are tested before monsoon rains.', source: 'Demo Weather', language: 'en', country: 'PH', region: 'Metro Manila', city: 'Manila', latitude: 14.6, longitude: 120.98, category: 'weather', minutesAgo: 7 },
  { title: '[DEMO] City pilots congestion-pricing study', description: 'Sample scenario: a fictional study models traffic demand.', source: 'Demo Transit', language: 'en', country: 'TR', region: 'Istanbul', city: 'Istanbul', latitude: 41.01, longitude: 28.98, category: 'general', minutesAgo: 72 },
  { title: '[DEMO] Desert solar farm reaches full capacity', description: 'Sample scenario: a fictional solar farm reaches its designed capacity.', source: 'Demo Energy Desk', language: 'en', country: 'CL', region: 'Antofagasta', city: 'Antofagasta', latitude: -23.65, longitude: -70.4, category: 'environment', minutesAgo: 100 },
  { title: '[DEMO] Ocean research vessel begins polar survey', description: 'Sample scenario: a fictional vessel starts a polar research survey.', source: 'Demo Science', language: 'en', country: 'NO', region: 'Oslo', city: 'Oslo', latitude: 59.91, longitude: 10.75, category: 'science', minutesAgo: 118 },
  { title: '[DEMO] Currency markets steady in fictional session', description: 'Sample scenario: a fictional trading session shows limited movement.', source: 'Demo Finance', language: 'en', country: 'SG', region: 'Singapore', city: 'Singapore', latitude: 1.35, longitude: 103.82, category: 'economy', minutesAgo: 25 },
  { title: '[DEMO] Heritage bridge reopens after restoration', description: 'Sample scenario: a fictional bridge reopens after restoration works.', source: 'Demo Culture', language: 'en', country: 'PT', region: 'Lisbon', city: 'Lisbon', latitude: 38.72, longitude: -9.14, category: 'culture', minutesAgo: 155 },
  { title: '[DEMO] Wildfire smoke tracked by satellite network', description: 'Sample scenario: fictional satellites track smoke plumes.', source: 'Demo Environment', language: 'en', country: 'GR', region: 'Attica', city: 'Athens', latitude: 37.98, longitude: 23.73, category: 'environment', minutesAgo: 63 },
  { title: '[DEMO] Basketball championship sets attendance record', description: 'Sample scenario: a fictional championship reports high attendance.', source: 'Demo Sports', language: 'en', country: 'KR', region: 'Seoul', city: 'Seoul', latitude: 37.57, longitude: 126.98, category: 'sports', minutesAgo: 82 },
];

export class DemoProvider implements NewsProvider {
  readonly id = 'demo';
  readonly name = 'WorldPulse Demo';
  readonly origin = 'demo' as const;

  isEnabled(): boolean {
    return true; // always available; the aggregator decides when to use it
  }

  async fetchLatest(since?: Date): Promise<RawNewsItem[]> {
    const sinceMs = since ? since.getTime() : 0;
    const now = Date.now();
    return SEEDS
      .map((seed, index) => {
        const publishedAt = new Date(now - seed.minutesAgo * 60_000);
        return {
          title: seed.title,
          description: seed.description,
          url: `https://demo.worldpulse.local/news/${index + 1}`,
          source: seed.source,
          sourceId: 'demo',
          publishedAt: publishedAt.toISOString(),
          image: null,
          language: seed.language,
          country: seed.country,
          region: seed.region,
          city: seed.city,
          latitude: seed.latitude,
          longitude: seed.longitude,
          categoryHint: seed.category,
          origin: 'demo' as const,
          locationText: `${seed.city}, ${seed.region}`,
        };
      })
      .filter((item) => new Date(item.publishedAt).getTime() >= sinceMs);
  }
}
