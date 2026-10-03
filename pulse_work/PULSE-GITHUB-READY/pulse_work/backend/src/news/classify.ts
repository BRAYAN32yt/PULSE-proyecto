import type { NewsCategory } from '../types/domain';
import { normalizeText } from '../utils/geo';

/**
 * Rule-based category classifier. Deterministic, dependency-free and easy to
 * extend or replace with an ML model later (same interface).
 */

const RULES: Array<{ category: NewsCategory; terms: string[] }> = [
  { category: 'emergency', terms: ['emergency', 'evacuat', 'state of emergency', 'sos', 'rescue', 'ambulance', 'emergencia', 'evacuacion'] },
  { category: 'weather', terms: ['hurricane', 'cyclone', 'typhoon', 'earthquake', 'tsunami', 'flood', 'wildfire', 'storm', 'blizzard', 'drought', 'volcano', 'tornado', 'landslide', 'huracan', 'terremoto', 'inundacion', 'sequia', 'tormenta'] },
  { category: 'conflict', terms: ['war', 'conflict', 'strike', 'airstrike', 'military', 'troops', 'ceasefire', 'missile', 'invasion', 'offensive', 'shelling', 'guerra', 'conflicto', 'ataque', 'tropas'] },
  { category: 'politics', terms: ['election', 'president', 'parliament', 'minister', 'senate', 'vote', 'policy', 'government', 'diplomat', 'sanction', 'coalition', 'referendum', 'eleccion', 'presidente', 'gobierno', 'congreso'] },
  { category: 'economy', terms: ['economy', 'inflation', 'gdp', 'market', 'stocks', 'trade', 'tariff', 'currency', 'bank', 'recession', 'budget', 'unemployment', 'economia', 'inflacion', 'mercado', 'banco'] },
  { category: 'technology', terms: ['software', 'hardware', 'robot', 'chip', 'semiconductor', 'startup', 'cloud', 'algorithm', 'gadget', 'tecnologia', 'inteligencia artificial'] },
  { category: 'internet', terms: ['internet', 'social media', 'cyber', 'hack', 'malware', 'ransomware', 'data breach', 'online platform', 'app store', 'streaming', 'plataforma', 'redes sociales'] },
  { category: 'science', terms: ['research', 'study', 'scientist', 'space', 'nasa', 'telescope', 'physics', 'genome', 'vaccine', 'discovery', 'experiment', 'cientific', 'investigacion', 'espacio'] },
  { category: 'environment', terms: ['climate', 'environment', 'emission', 'biodiversity', 'conservation', 'pollution', 'renewable', 'carbon', 'deforestation', 'medio ambiente', 'contaminacion', 'clima'] },
  { category: 'sports', terms: ['football', 'soccer', 'olympic', 'tournament', 'championship', 'match', 'league', 'tennis', 'basketball', 'world cup', 'deportes', 'futbol', 'partido', 'torneo'] },
  { category: 'culture', terms: ['film', 'music', 'festival', 'museum', 'art', 'book', 'theater', 'award', 'concert', 'fashion', 'cultura', 'pelicula', 'musica', 'arte'] },
];

const CATEGORY_SET = new Set<NewsCategory>(RULES.map((r) => r.category));

export function classify(title: string, description = '', hint?: string): NewsCategory {
  if (hint && CATEGORY_SET.has(hint as NewsCategory)) return hint as NewsCategory;
  const haystack = ' ' + normalizeText(`${title} ${description}`) + ' ';
  let best: { category: NewsCategory; score: number } = { category: 'general', score: 0 };
  for (const rule of RULES) {
    let score = 0;
    for (const term of rule.terms) {
      if (haystack.includes(' ' + term)) score += term.includes(' ') ? 2 : 1;
    }
    if (score > best.score) best = { category: rule.category, score };
  }
  return best.category;
}
