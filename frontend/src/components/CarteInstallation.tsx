import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ResultatRPC, Commune } from '../types/commune';
import { TrancheConso, CategorieActivite } from '../types/consommateur';
import { ActiveInstallation } from '../types/installation';
import { Layers } from 'lucide-react';
import CommunesLayer from './CommunesLayer';
import ConsumersLayer from './ConsumersLayer';
import ConsumersFilters from './ConsumersFilters';
import InstallationMarkers from './InstallationMarkers';
import { DraggableCircleFilter } from './DraggableCircleFilter';
import { supabase } from '../supabaseClient';
import { getRayonReglementaire } from '../utils/densityCategory';

import L from 'leaflet';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CarteInstallationProps {
  resultat: ResultatRPC | null;
  latitude?: number;
  longitude?: number;
  marge: number;
  selectedCommuneCodes: string[];
  selectedTranches: Set<TrancheConso>;
  selectedCategories: Set<CategorieActivite>;
  onTrancheToggle: (tranche: TrancheConso) => void;
  onCategoryToggle: (category: CategorieActivite) => void;
  onStatsUpdate: (nbSites: number, consoTotal: number) => void;
  activeInstallations?: ActiveInstallation[];
  geocodingRefreshKey?: number;
  circleFilterActive?: boolean;
  circleFilterPosition?: [number, number] | null;
  onCircleFilterPositionChange?: (position: [number, number]) => void;
}

interface FondCarte {
  nom: string;
  url: string;
  attribution: string;
}

const fondsCarte: FondCarte[] = [
  {
    nom: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  {
    nom: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
  },
  {
    nom: 'Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  {
    nom: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
];

function MapController({ latitude, longitude, initialZoom }: { latitude?: number; longitude?: number; initialZoom: number }) {
  const map = useMap();
  const [hasInitialized, setHasInitialized] = useState(false);
  const prevCoordsRef = useRef({ lat: latitude, lon: longitude });

  useEffect(() => {
    if (!latitude || !longitude) return;

    const center: LatLngExpression = [latitude, longitude];

    if (!hasInitialized) {
      map.setView(center, initialZoom);
      setHasInitialized(true);
      prevCoordsRef.current = { lat: latitude, lon: longitude };
    } else if (prevCoordsRef.current.lat !== latitude || prevCoordsRef.current.lon !== longitude) {
      map.flyTo(center, initialZoom, {
        duration: 1.5,
        easeLinearity: 0.5
      });
      prevCoordsRef.current = { lat: latitude, lon: longitude };
    }
  }, [latitude, longitude, initialZoom, map, hasInitialized]);

  return null;
}

export default function CarteInstallation({
  resultat,
  latitude,
  longitude,
  marge,
  selectedCommuneCodes,
  selectedTranches,
  selectedCategories,
  onTrancheToggle,
  onCategoryToggle,
  onStatsUpdate,
  activeInstallations = [],
  geocodingRefreshKey = 0,
  circleFilterActive = false,
  circleFilterPosition = null,
  onCircleFilterPositionChange
}: CarteInstallationProps) {
  const [transparence, setTransparence] = useState(0.4);
  const [fondCarteIndex, setFondCarteIndex] = useState(0);
  const [showFondSelector, setShowFondSelector] = useState(false);
  const [communesFromInstallations, setCommunesFromInstallations] = useState<Commune[]>([]);

  const [installationsInfo, setInstallationsInfo] = useState<Array<{
    latitude: number;
    longitude: number;
    densite: number;
  }>>([]);

  useEffect(() => {
    const loadCommunesForInstallations = async () => {
      if (activeInstallations.length === 0) {
        setCommunesFromInstallations([]);
        setInstallationsInfo([]);
        return;
      }

      const allCommunes: Commune[] = [];
      const communesSet = new Set<string>();
      const instInfo: Array<{ latitude: number; longitude: number; densite: number }> = [];

      for (const installation of activeInstallations) {
        const { data: rpcData } = await supabase.rpc(
          'rpc_communes_autour_installation',
          { p_lat: installation.latitude, p_lon: installation.longitude }
        );

        if (rpcData) {
          if (rpcData.commune_installation && !communesSet.has(rpcData.commune_installation.codgeo)) {
            allCommunes.push(rpcData.commune_installation);
            communesSet.add(rpcData.commune_installation.codgeo);

            // Stocker les infos de l'installation avec sa densité
            instInfo.push({
              latitude: installation.latitude,
              longitude: installation.longitude,
              densite: rpcData.commune_installation.dens7
            });
          }

          rpcData.communes_dans_rayon.forEach((commune: Commune) => {
            if (!communesSet.has(commune.codgeo)) {
              allCommunes.push(commune);
              communesSet.add(commune.codgeo);
            }
          });
        }
      }

      setCommunesFromInstallations(allCommunes);
      setInstallationsInfo(instInfo);
    };

    loadCommunesForInstallations();
  }, [activeInstallations]);

  const hasActiveSearch = !!(resultat && latitude && longitude);
  const hasActiveInstallations = activeInstallations.length > 0;

  const center: LatLngExpression = hasActiveSearch
    ? [latitude, longitude]
    : hasActiveInstallations
    ? [activeInstallations[0].latitude, activeInstallations[0].longitude]
    : [46.603354, 1.888334];

  const rayon = resultat?.rayon || 20000;

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      <div className="h-[600px] relative">
        <MapContainer
          center={center}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <MapController latitude={latitude} longitude={longitude} initialZoom={10} />

          <TileLayer
            url={fondsCarte[fondCarteIndex].url}
            attribution={fondsCarte[fondCarteIndex].attribution}
          />

          {hasActiveSearch && latitude && longitude && (
            <>
              <Marker position={[latitude, longitude]} />
              <Circle
                center={[latitude, longitude]}
                radius={rayon}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.1,
                  weight: 2,
                }}
              />
            </>
          )}

          <InstallationMarkers installations={activeInstallations} />

          {(resultat || communesFromInstallations.length > 0) && (
            <CommunesLayer
              communes={resultat ? [
                ...(resultat.commune_installation ? [resultat.commune_installation] : []),
                ...resultat.communes_dans_rayon,
              ] : communesFromInstallations}
              transparence={transparence}
              highlight={resultat?.commune_installation?.codgeo}
              installations={resultat && latitude && longitude ? [
                {
                  latitude,
                  longitude,
                  densite: resultat.commune_installation?.dens7
                }
              ] : installationsInfo}
            />
          )}

          <ConsumersLayer
            selectedCommuneCodes={selectedCommuneCodes}
            selectedTranches={selectedTranches}
            selectedCategories={selectedCategories}
            installationLat={latitude}
            installationLon={longitude}
            rayon={rayon}
            marge={marge}
            onStatsUpdate={onStatsUpdate}
            activeInstallations={activeInstallations}
            geocodingRefreshKey={geocodingRefreshKey}
            circleFilterActive={circleFilterActive}
            circleFilterPosition={circleFilterPosition}
          />

          {circleFilterActive && circleFilterPosition && activeInstallations.length === 1 && onCircleFilterPositionChange && (
            <DraggableCircleFilter
              center={circleFilterPosition}
              innerRadius={(activeInstallations[0].rayon || 20000) / 2}
              outerRadius={(activeInstallations[0].rayon || 20000) / 2 + 100}
              onPositionChange={onCircleFilterPositionChange}
            />
          )}
        </MapContainer>

        <ConsumersFilters
          selectedTranches={selectedTranches}
          selectedCategories={selectedCategories}
          onTrancheToggle={onTrancheToggle}
          onCategoryToggle={onCategoryToggle}
        />

        <div className="absolute top-4 left-4 z-[1000] space-y-2">
          <div className="bg-white rounded-lg shadow-lg p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Transparence: {Math.round(transparence * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={transparence}
              onChange={(e) => setTransparence(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="bg-white rounded-lg shadow-lg">
            <button
              onClick={() => setShowFondSelector(!showFondSelector)}
              className="w-full px-4 py-3 flex items-center gap-2 text-slate-700 hover:bg-slate-50 transition rounded-lg"
            >
              <Layers className="w-5 h-5" />
              <span className="font-medium">{fondsCarte[fondCarteIndex].nom}</span>
            </button>

            {showFondSelector && (
              <div className="border-t border-slate-200">
                {fondsCarte.map((fond, index) => (
                  <button
                    key={fond.nom}
                    onClick={() => {
                      setFondCarteIndex(index);
                      setShowFondSelector(false);
                    }}
                    className={`w-full px-4 py-2 text-left hover:bg-slate-50 transition ${
                      index === fondCarteIndex ? 'bg-blue-50 text-blue-600 font-medium' : 'text-slate-700'
                    }`}
                  >
                    {fond.nom}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-lg shadow-lg p-4 max-w-xs">
          <h3 className="font-bold text-slate-900 mb-2">Légende</h3>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.6)' }}></div>
              <span>Densité 1-2 (Forte)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(251, 191, 36, 0.6)' }}></div>
              <span>Densité 3-4 (Moyenne)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }}></div>
              <span>Densité 5-7 (Faible)</span>
            </div>
          </div>
          {resultat?.commune_installation && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs text-slate-600">
                <strong>Installation:</strong> {resultat.commune_installation.nom_commune}
              </p>
              <p className="text-xs text-slate-600">
                <strong>Rayon:</strong> {(rayon / 1000).toFixed(0)} km
              </p>
              <p className="text-xs text-slate-600">
                <strong>Communes:</strong> {resultat.communes_dans_rayon.length}
              </p>
            </div>
          )}
          {!resultat && activeInstallations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs text-slate-600">
                <strong>Installations:</strong> {activeInstallations.length}
              </p>
              <p className="text-xs text-slate-600">
                <strong>Communes:</strong> {communesFromInstallations.length}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
