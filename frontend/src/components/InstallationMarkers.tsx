import { useEffect, useState } from 'react';
import { Marker, Circle, useMap } from 'react-leaflet';
import { DivIcon } from 'leaflet';
import { ActiveInstallation } from '../types/installation';

interface InstallationMarkersProps {
  installations: ActiveInstallation[];
}

export default function InstallationMarkers({ installations }: InstallationMarkersProps) {
  const map = useMap();
  const [currentZoom, setCurrentZoom] = useState(map.getZoom());

  useEffect(() => {
    const handleZoom = () => {
      setCurrentZoom(map.getZoom());
    };

    map.on('zoomend', handleZoom);
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map]);

  const createMarkerIcon = (installation: ActiveInstallation) => {
    const showLabel = currentZoom <= 8;

    const html = showLabel
      ? `
        <div style="position: relative; text-align: center;">
          <div style="
            position: absolute;
            bottom: 35px;
            left: 50%;
            transform: translateX(-50%);
            background: white;
            padding: 4px 8px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            white-space: nowrap;
            font-size: 12px;
            font-weight: 500;
            color: #1e293b;
            pointer-events: none;
          ">
            <div style="font-weight: 600; color: #0f172a;">${installation.nom}</div>
            <div style="font-size: 11px; color: #64748b;">${installation.commune}</div>
          </div>
          <img src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png"
               style="width: 25px; height: 41px;" />
        </div>
      `
      : `
        <img src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png"
             style="width: 25px; height: 41px;" />
      `;

    return new DivIcon({
      html,
      className: 'custom-marker-icon',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    });
  };

  return (
    <>
      {installations.map((installation) => (
        <div key={installation.id}>
          <Marker
            position={[installation.latitude, installation.longitude]}
            icon={createMarkerIcon(installation)}
          />
          <Circle
            center={[installation.latitude, installation.longitude]}
            radius={installation.rayon || 20000}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              weight: 2,
            }}
          />
        </div>
      ))}
    </>
  );
}
