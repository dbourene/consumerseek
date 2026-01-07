import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { ResultatRPC } from '../types/commune';

interface FormulaireRechercheProps {
  onResultat: (resultat: ResultatRPC, lat: number, lon: number) => void;
}

interface SuggestionAdresse {
  label: string;
  lat: number;
  lon: number;
}

export default function FormulaireRecherche({ onResultat }: FormulaireRechercheProps) {
  const [adresse, setAdresse] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionAdresse[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (adresse.trim().length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setLoadingSuggestions(true);
      try {
        const response = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresse)}&limit=5`
        );

        if (!response.ok) {
          throw new Error('Erreur lors de la recherche d\'adresses');
        }

        const data = await response.json();

        if (data.features && data.features.length > 0) {
          const suggestions = data.features.map((feature: any) => ({
            label: feature.properties.label,
            lat: feature.geometry.coordinates[1],
            lon: feature.geometry.coordinates[0],
          }));
          setSuggestions(suggestions);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch (err) {
        console.error('Erreur lors de la recherche d\'adresses:', err);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [adresse]);

  const geocodeAdresse = async (adresseInput: string): Promise<{ lat: number; lon: number }> => {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresseInput)}&limit=1`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Erreur lors du géocodage de l\'adresse');
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      throw new Error('Adresse introuvable');
    }

    return {
      lat: data.features[0].geometry.coordinates[1],
      lon: data.features[0].geometry.coordinates[0],
    };
  };

  const handleSuggestionClick = (suggestion: SuggestionAdresse) => {
    setAdresse(suggestion.label);
    setLatitude(suggestion.lat.toString());
    setLongitude(suggestion.lon.toString());
    setShowSuggestions(false);
  };

  const rechercherCommunes = async (lat: number, lon: number) => {
    const { data, error: rpcError } = await supabase.rpc('rpc_communes_autour_installation', {
      p_lat: lat,
      p_lon: lon,
    });

    if (rpcError) {
      throw new Error(`Erreur lors de la recherche: ${rpcError.message}`);
    }

    if (!data) {
      throw new Error('Aucune donnée retournée');
    }

    console.log('Données brutes du RPC:', JSON.stringify(data, null, 2));

    let resultat = data;

    // Le RPC peut retourner les données de différentes manières selon le client
    if (Array.isArray(data) && data.length > 0) {
      resultat = data[0];
    }

    // Si le résultat contient une clé avec le nom de la fonction RPC, extraire son contenu
    if (resultat && typeof resultat === 'object' && 'rpc_communes_autour_installation' in resultat) {
      resultat = (resultat as any).rpc_communes_autour_installation;
    }

    console.log('Résultat après extraction:', resultat);
    console.log('Nombre de communes:', resultat?.communes_dans_rayon?.length);

    if (resultat?.communes_dans_rayon?.[0]?.geomgeo) {
      console.log('Exemple de geomgeo:', resultat.communes_dans_rayon[0].geomgeo);
    }

    return resultat as ResultatRPC;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let lat: number;
      let lon: number;

      if (adresse.trim()) {
        const coords = await geocodeAdresse(adresse);
        lat = coords.lat;
        lon = coords.lon;
        setLatitude(lat.toString());
        setLongitude(lon.toString());
      } else if (latitude && longitude) {
        lat = parseFloat(latitude);
        lon = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lon)) {
          throw new Error('Coordonnées GPS invalides');
        }
      } else {
        throw new Error('Veuillez saisir une adresse ou des coordonnées GPS');
      }

      const resultat = await rechercherCommunes(lat, lon);
      onResultat(resultat, lat, lon);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-4">Rechercher une installation</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Adresse
          </label>
          <div className="relative" ref={wrapperRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 z-10" />
            <input
              type="text"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Ex: 1 Place de la République, Paris"
              autoComplete="off"
            />
            {loadingSuggestions && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 animate-spin" />
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 transition border-b border-slate-100 last:border-b-0"
                  >
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{suggestion.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="text-center text-sm text-slate-500 font-medium">OU</div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Latitude
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="48.8566"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Longitude
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="2.3522"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Recherche en cours...
            </>
          ) : (
            <>
              <MapPin className="w-5 h-5" />
              Localiser
            </>
          )}
        </button>
      </form>
    </div>
  );
}
