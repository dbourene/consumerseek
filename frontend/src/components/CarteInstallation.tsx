import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ResultatRPC } from '../types/commune';
import { Layers } from 'lucide-react';
import CommunesLayer from './CommunesLayer';

import L from 'leaflet';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CarteInstallationProps {
  resultat: ResultatRPC;
  latitude: number;
  longitude: number;
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

function MapController({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);

  return null;
}

export default function CarteInstallation({
  resultat,
  latitude,
  longitude,
}: CarteInstallationProps) {
  const [transparence, setTransparence] = useState(0.4);
  const [fondCarteIndex, setFondCarteIndex] = useState(0);
  const [showFondSelector, setShowFondSelector] = useState(false);

  const center: LatLngExpression = [latitude, longitude];
  const rayon = resultat.rayon || 20000;

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      <div className="h-[600px] relative">
        <MapContainer
          center={center}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <MapController center={center} zoom={10} />

          <TileLayer
            url={fondsCarte[fondCarteIndex].url}
            attribution={fondsCarte[fondCarteIndex].attribution}
          />

          <Marker position={center} />

          <Circle
            center={center}
            radius={rayon}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              weight: 2,
            }}
          />

          <CommunesLayer
            communes={[
              ...(resultat.commune_installation ? [resultat.commune_installation] : []),
              ...resultat.communes_dans_rayon,
            ]}
            transparence={transparence}
            highlight={resultat.commune_installation?.id}
          />
        </MapContainer>

        <div className="absolute top-4 right-4 z-[1000] space-y-2">
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
              <span>Densité 1-2 (Faible)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(251, 191, 36, 0.6)' }}></div>
              <span>Densité 3-4 (Moyenne)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }}></div>
              <span>Densité 5-7 (Forte)</span>
            </div>
          </div>
          {resultat.commune_installation && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs text-slate-600">
                <strong>Installation:</strong> {resultat.commune_installation.nom}
              </p>
              <p className="text-xs text-slate-600">
                <strong>Rayon:</strong> {(rayon / 1000).toFixed(0)} km
              </p>
              <p className="text-xs text-slate-600">
                <strong>Communes:</strong> {resultat.communes_dans_rayon.length}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
