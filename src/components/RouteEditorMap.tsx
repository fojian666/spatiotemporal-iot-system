import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import { AREA_CENTER } from '../data/devices';
import type { DroneWaypoint } from '../services/api';

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution: 'Esri World Imagery',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#06101c' } },
    {
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      paint: {
        'raster-opacity': 0.94,
        'raster-brightness-max': 0.78,
        'raster-brightness-min': 0.05,
        'raster-contrast': 0.12,
        'raster-saturation': -0.26,
      },
    },
  ],
};

type Props = {
  waypoints: DroneWaypoint[];
  editable: boolean;
  onChange: (waypoints: DroneWaypoint[]) => void;
  className?: string;
  resetKey?: string;
};

function lineData(waypoints: DroneWaypoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features:
      waypoints.length >= 2
        ? [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: {
                type: 'LineString' as const,
                coordinates: waypoints.map((point) => [point.lng, point.lat]),
              },
            },
          ]
        : [],
  };
}

export function RouteEditorMap({ waypoints, editable, onChange, className = '', resetKey }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const waypointsRef = useRef(waypoints);
  const onChangeRef = useRef(onChange);
  const editableRef = useRef(editable);
  waypointsRef.current = waypoints;
  onChangeRef.current = onChange;
  editableRef.current = editable;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [AREA_CENTER[0], AREA_CENTER[1] - 0.004],
      zoom: 12.2,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: 'Esri World Imagery · 演示数据' }),
      'bottom-right',
    );
    map.on('load', () => {
      map.addSource('route-line', {
        type: 'geojson',
        data: lineData(waypointsRef.current),
      });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route-line',
        paint: { 'line-color': '#6ff3ff', 'line-width': 10, 'line-opacity': 0.12, 'line-blur': 8 },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-line',
        paint: { 'line-color': '#66e9ff', 'line-width': 2, 'line-opacity': 0.88, 'line-dasharray': [2, 1.4] },
      });
      map.on('click', (event) => {
        if (!editableRef.current) return;
        const current = waypointsRef.current;
        const next: DroneWaypoint = {
          lng: +event.lngLat.lng.toFixed(6),
          lat: +event.lngLat.lat.toFixed(6),
          altitude: current[current.length - 1]?.altitude ?? 120,
          action: current.length === 0 ? '自动起飞' : '拍照',
          name: `航点 ${current.length + 1}`,
        };
        onChangeRef.current([...current, next]);
      });
      setReady(true);
    });
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const source = map.getSource('route-line') as maplibregl.GeoJSONSource | undefined;
    source?.setData(lineData(waypoints));

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = waypoints.map((point, index) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'route-waypoint';
      el.innerHTML = `<span>${index + 1}</span><em>${point.altitude}m</em>`;
      el.addEventListener('pointerdown', (event) => event.stopPropagation());
      el.addEventListener('click', (event) => event.stopPropagation());
      const marker = new maplibregl.Marker({ element: el, anchor: 'center', draggable: editable })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      if (editable) {
        marker.on('dragend', () => {
          const position = marker.getLngLat();
          const current = waypointsRef.current.slice();
          current[index] = {
            ...current[index],
            lng: +position.lng.toFixed(6),
            lat: +position.lat.toFixed(6),
          };
          onChangeRef.current(current);
        });
      }
      return marker;
    });
  }, [ready, waypoints, editable]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !waypoints.length) return;
    const lngs = waypoints.map((point) => point.lng);
    const lats = waypoints.map((point) => point.lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 70, duration: 650, maxZoom: 14 },
    );
    // Only refit when the selected route changes, not on every point edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, resetKey]);

  return (
    <div className={`route-editor-map ${className}`}>
      <div ref={containerRef} className="route-editor-map__canvas" />
      <div className="route-editor-map__hint mono">
        {editable ? '点击地图添加航点 · 拖动航点调整位置' : '航线预览 · 只读'}
        <strong>{waypoints.length} WAYPOINTS</strong>
      </div>
    </div>
  );
}
