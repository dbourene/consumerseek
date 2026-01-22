import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface DraggableCircleFilterProps {
  center: [number, number];
  innerRadius: number;
  outerRadius: number;
  onPositionChange: (position: [number, number]) => void;
}

export function DraggableCircleFilter({
  center,
  innerRadius,
  outerRadius,
  onPositionChange
}: DraggableCircleFilterProps) {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const currentPositionRef = useRef<[number, number]>(center);

  useEffect(() => {
    if (!map) return;

    const paneName = 'draggableCirclePane';
    if (!map.getPane(paneName)) {
      const pane = map.createPane(paneName);
      pane.style.zIndex = '650';
      pane.style.pointerEvents = 'auto';
    }

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;

    const innerCircle = L.circle(center, {
      radius: innerRadius,
      color: '#3b82f6',
      weight: 2,
      fillColor: '#3b82f6',
      fillOpacity: 0.15,
      dashArray: '5, 5',
      interactive: true,
      pane: paneName
    });

    const ringCircle = L.circle(center, {
      radius: outerRadius,
      color: '#3b82f6',
      weight: 2,
      fillColor: '#60a5fa',
      fillOpacity: 0.25,
      dashArray: '5, 5',
      interactive: true,
      pane: paneName
    });

    const outerBorder = L.circle(center, {
      radius: outerRadius,
      color: '#2563eb',
      weight: 3,
      fill: false,
      interactive: true,
      pane: paneName
    });

    innerCircle.addTo(layerGroup);
    ringCircle.addTo(layerGroup);
    outerBorder.addTo(layerGroup);

    let isDragging = false;
    let dragStartLatLng: L.LatLng | null = null;
    let initialCenter: L.LatLng = L.latLng(center);

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e.originalEvent);
      L.DomEvent.preventDefault(e.originalEvent);
      isDragging = true;
      dragStartLatLng = e.latlng;
      initialCenter = L.latLng(currentPositionRef.current);
      map.dragging.disable();
      map.getContainer().style.cursor = 'grabbing';
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!isDragging || !dragStartLatLng) return;

      L.DomEvent.stopPropagation(e.originalEvent);
      L.DomEvent.preventDefault(e.originalEvent);

      const latDiff = e.latlng.lat - dragStartLatLng.lat;
      const lngDiff = e.latlng.lng - dragStartLatLng.lng;

      const newCenter = L.latLng(
        initialCenter.lat + latDiff,
        initialCenter.lng + lngDiff
      );

      innerCircle.setLatLng(newCenter);
      ringCircle.setLatLng(newCenter);
      outerBorder.setLatLng(newCenter);
    };

    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (!isDragging || !dragStartLatLng) return;

      L.DomEvent.stopPropagation(e.originalEvent);
      L.DomEvent.preventDefault(e.originalEvent);

      const latDiff = e.latlng.lat - dragStartLatLng.lat;
      const lngDiff = e.latlng.lng - dragStartLatLng.lng;

      const newCenter: [number, number] = [
        initialCenter.lat + latDiff,
        initialCenter.lng + lngDiff
      ];

      currentPositionRef.current = newCenter;
      onPositionChange(newCenter);

      isDragging = false;
      dragStartLatLng = null;
      map.dragging.enable();
      map.getContainer().style.cursor = 'grab';
    };

    innerCircle.on('mousedown', onMouseDown);
    ringCircle.on('mousedown', onMouseDown);
    outerBorder.on('mousedown', onMouseDown);

    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    innerCircle.on('mouseover', () => {
      if (!isDragging) {
        map.getContainer().style.cursor = 'grab';
      }
    });

    innerCircle.on('mouseout', () => {
      if (!isDragging) {
        map.getContainer().style.cursor = '';
      }
    });

    ringCircle.on('mouseover', () => {
      if (!isDragging) {
        map.getContainer().style.cursor = 'grab';
      }
    });

    ringCircle.on('mouseout', () => {
      if (!isDragging) {
        map.getContainer().style.cursor = '';
      }
    });

    outerBorder.on('mouseover', () => {
      if (!isDragging) {
        map.getContainer().style.cursor = 'grab';
      }
    });

    outerBorder.on('mouseout', () => {
      if (!isDragging) {
        map.getContainer().style.cursor = '';
      }
    });

    return () => {
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.getContainer().style.cursor = '';
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
      }
      map.dragging.enable();
    };
  }, [map, center, innerRadius, outerRadius, onPositionChange]);

  return null;
}
