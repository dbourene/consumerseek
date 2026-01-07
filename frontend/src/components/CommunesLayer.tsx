import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { Commune } from '../types/commune';

interface CommunesLayerProps {
  communes: Commune[];
  transparence: number;
  highlight?: string;
}

function getCouleurDensite(densite: number): { fillColor: string; color: string } {
  if (densite === 1 || densite === 2) {
    return { fillColor: '#ef4444', color: '#991b1b' };
  } else if (densite === 3 || densite === 4) {
    return { fillColor: '#fbbf24', color: '#92400e' };
  } else {
    return { fillColor: '#22c55e', color: '#166534' };
  }
}

export default function CommunesLayer({ communes, transparence, highlight }: CommunesLayerProps) {
  const map = useMap();

  useEffect(() => {
    console.log('CommunesLayer - Nombre de communes reçues:', communes.length);
    console.log('CommunesLayer - Communes:', communes.map(c => ({ nom: c.nom, hasGeom: !!c.geomgeo })));

    const layers: L.GeoJSON[] = [];

    communes.forEach((commune) => {
      if (!commune.geomgeo) {
        console.log('CommunesLayer - Commune sans geomgeo:', commune.nom);
        return;
      }

      console.log('CommunesLayer - Ajout de la commune:', commune.nom, commune.geomgeo);

      const couleurs = getCouleurDensite(commune.densite);
      const isHighlight = highlight === commune.id;

      const layer = L.geoJSON(commune.geomgeo as any, {
        style: {
          fillColor: couleurs.fillColor,
          color: isHighlight ? '#1e40af' : couleurs.color,
          weight: isHighlight ? 2.5 : 1.5,
          fillOpacity: transparence,
          opacity: isHighlight ? 1 : 0.8,
        },
        onEachFeature: (feature, layer) => {
          layer.bindPopup(`
            <div style="font-family: sans-serif;">
              <strong style="font-size: 1.125rem;">${commune.nom}</strong><br/>
              ${isHighlight ? '<span style="color: #2563eb; font-weight: 600;">Commune d\'installation</span><br/>' : ''}
              Code: ${commune.code}<br/>
              Densité: ${commune.densite}
            </div>
          `);
        },
      });

      layer.addTo(map);
      layers.push(layer);
    });

    return () => {
      layers.forEach((layer) => {
        map.removeLayer(layer);
      });
    };
  }, [map, communes, transparence, highlight]);

  return null;
}
