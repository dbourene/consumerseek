const API_GOUV_URL = 'https://api-adresse.data.gouv.fr';
const PHOTON_API_URL = 'https://photon.komoot.io';

export interface AddressSuggestion {
  label: string;
  housenumber?: string;
  street?: string;
  citycode: string;
  city: string;
  postcode?: string;
  latitude: number;
  longitude: number;
  score: number;
  type?: string;
}

export interface ParsedAddress {
  adresse: string;
  code_commune: string;
  nom_commune: string;
  latitude: number;
  longitude: number;
}

async function searchPhoton(query: string, limit: number): Promise<AddressSuggestion[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
      lang: 'fr',
      lon: '2.3522',
      lat: '48.8566',
      location_bias_scale: '0.5'
    });

    const response = await fetch(`${PHOTON_API_URL}/api/?${params}`);

    if (!response.ok) {
      throw new Error('Photon API error');
    }

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      return data.features
        .filter((feature: any) => {
          const props = feature.properties;
          return props.countrycode === 'FR' && props.city;
        })
        .map((feature: any) => {
          const props = feature.properties;
          const coords = feature.geometry.coordinates;

          let label = '';
          let housenumber = props.housenumber || '';
          let street = props.street || props.name || '';

          if (props.name && props.name !== props.street) {
            if (props.housenumber) {
              label = `${props.name}, ${props.housenumber} ${props.street || ''}`.trim();
            } else if (props.street) {
              label = `${props.name}, ${props.street}`.trim();
            } else {
              label = props.name;
            }
          } else {
            const parts = [];
            if (props.housenumber) parts.push(props.housenumber);
            if (props.street) parts.push(props.street);
            label = parts.join(' ');
          }

          if (props.city) {
            label += `, ${props.city}`;
          }
          if (props.postcode) {
            label += ` ${props.postcode}`;
          }

          return {
            label: label.trim(),
            housenumber,
            street,
            citycode: props.citycode || extractCityCode(props.postcode, props.city),
            city: props.city,
            postcode: props.postcode,
            latitude: coords[1],
            longitude: coords[0],
            score: 0.9,
            type: props.osm_value || props.type
          };
        });
    }

    return [];
  } catch (error) {
    console.error('Photon search error:', error);
    return [];
  }
}

async function searchGouvAPI(query: string, limit: number): Promise<AddressSuggestion[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
      autocomplete: '1'
    });

    const response = await fetch(`${API_GOUV_URL}/search/?${params}`);

    if (!response.ok) {
      throw new Error('Address search API error');
    }

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      return data.features.map((feature: any) => ({
        label: feature.properties.label,
        housenumber: feature.properties.housenumber,
        street: feature.properties.street,
        citycode: feature.properties.citycode,
        city: feature.properties.city,
        postcode: feature.properties.postcode,
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        score: feature.properties.score,
        type: 'address'
      }));
    }

    return [];
  } catch (error) {
    console.error('Gouv API search error:', error);
    return [];
  }
}

function extractCityCode(postcode?: string, cityName?: string): string {
  if (!postcode) return '';

  const deptCode = postcode.substring(0, 2);
  if (deptCode === '75') return '75056';
  if (deptCode === '69') return '69123';
  if (deptCode === '13') return '13055';

  return deptCode + '000';
}

function deduplicateSuggestions(suggestions: AddressSuggestion[]): AddressSuggestion[] {
  const seen = new Set<string>();
  const unique: AddressSuggestion[] = [];

  for (const suggestion of suggestions) {
    const key = `${suggestion.latitude.toFixed(6)},${suggestion.longitude.toFixed(6)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(suggestion);
    }
  }

  return unique;
}

export async function searchAddresses(
  query: string,
  limit: number = 8
): Promise<AddressSuggestion[]> {
  if (!query || query.trim().length < 3) {
    return [];
  }

  try {
    const [photonResults, gouvResults] = await Promise.all([
      searchPhoton(query, limit),
      searchGouvAPI(query, Math.floor(limit / 2))
    ]);

    const combined = [...photonResults, ...gouvResults];
    const deduplicated = deduplicateSuggestions(combined);

    return deduplicated
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    console.error('Address search error:', error);
    return [];
  }
}

export function parseAddressSuggestion(suggestion: AddressSuggestion): ParsedAddress {
  const addressParts: string[] = [];

  if (suggestion.housenumber) {
    addressParts.push(suggestion.housenumber);
  }

  if (suggestion.street) {
    addressParts.push(suggestion.street);
  }

  const adresse = addressParts.join(' ').trim() || suggestion.label;

  return {
    adresse,
    code_commune: suggestion.citycode,
    nom_commune: suggestion.city,
    latitude: suggestion.latitude,
    longitude: suggestion.longitude
  };
}
