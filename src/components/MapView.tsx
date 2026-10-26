import { prefersReducedMotion, subscribeMotion } from '../motion';
import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import { Layers3, LocateFixed, Minus, Plus } from 'lucide-react';
import {
  AREA_CENTER,
  DEVICES,
  DRONE_ROUTE,
  FENCES,
  FOREST_ROUTE,
  KIND_META,
  expandPoint,
  UGV_ROUTE,
  USV_ROUTE,
  type DeviceKind,
  type RouteWaypoint,
} from '../data/devices';
import { useSimulation } from '../engine/simulation';

/* 公共领域高程瓦片（Mapzen terrarium，托管于 AWS Open Data），离线环境与卫星底图一样不可用，
 * 故地形只作为可选增强：加载失败时回落到纯平面，不影响地图本身。 */
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TERRAIN_SOURCE = 'terrain-dem';
const TERRAIN_SHADE_SOURCE = 'terrain-shade';
/* 夸张度与俯角是一组参数：设备/航线坐标经过 expandPoint 扩散（经度 ×1.65），
 * 与真实地形本是两套坐标，抬过头会把既有偏差放大成"设备挂在陡坡上"；
 * 但压太狠又只剩明暗变化、看不出河谷——1.65 / 36° 是"能看出沟壑、设备仍落在合理地表"的折中。 */
const TERRAIN_EXAGGERATION = 1.65;
const TERRAIN_PITCH = 36;
const FLAT_PITCH = 18;

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
    [TERRAIN_SOURCE]: {
      type: 'raster-dem',
      tiles: [DEM_TILES],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 12,
      attribution: 'Elevation: Mapzen / AWS Terrain Tiles',
    },
    /* 晕渲单独一份同源声明：MapLibre 不推荐 terrain 与 hillshade 共用一个 raster-dem，
     * 共用会每次进页面打一条告警并影响晕渲质量。同 URL 命中 HTTP 缓存，不增加流量。 */
    [TERRAIN_SHADE_SOURCE]: {
      type: 'raster-dem',
      tiles: [DEM_TILES],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 12,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#06101c' },
    },
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
    {
      id: 'terrain-hillshade',
      type: 'hillshade',
      source: TERRAIN_SHADE_SOURCE,
      layout: { visibility: 'none' },
      paint: {
        'hillshade-exaggeration': 0.46,
        'hillshade-shadow-color': 'rgba(0, 6, 12, 0.78)',
        'hillshade-highlight-color': 'rgba(118, 158, 184, 0.42)',
        'hillshade-accent-color': 'rgba(10, 26, 38, 0.6)',
      },
    },
  ],
};

const MARKER_CHAR: Record<DeviceKind, string> = {
  weather: '气',
  water: '水',
  soil: '土',
  geology: '地',
  air: '空',
  video: '视',
  drone: '机',
  ugv: '车',
  usv: '船',
  satellite: '星',
  gateway: '网',
};

type MapLayers = {
  satellite: boolean;
  devices: boolean;
  route: boolean;
  fences: boolean;
  heat: boolean;
  orbit: boolean;
  terrain: boolean;
};

const INITIAL_LAYERS: MapLayers = {
  satellite: true,
  devices: true,
  route: true,
  fences: true,
  heat: false,
  orbit: true,
  /* 真实默认在组件初始化时按 detailed + 视口宽度决定，这里只是占位 */
  terrain: false,
};

const WAYPOINT_ROUTE_KEYS = new Set(['drone', 'ugv', 'usv', 'satellite']);

/* 把经纬度换算成 DEM 瓦片地址，用于可用性探测（z10 足够覆盖一个县城范围） */
function demTileUrl(lng: number, lat: number, z = 10): string {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return DEM_TILES.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

function routeFeature(route: RouteWaypoint[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: route.map((point) => [point.lng, point.lat]),
    },
  };
}

function pointAlong(route: RouteWaypoint[], progress: number) {
  const t = ((progress % 1) + 1) % 1;
  const scaled = t * (route.length - 1);
  const index = Math.min(route.length - 2, Math.floor(scaled));
  const frac = scaled - index;
  const a = route[index];
  const b = route[index + 1];
  return {
    lng: a.lng + (b.lng - a.lng) * frac,
    lat: a.lat + (b.lat - a.lat) * frac,
  };
}

function createNode(device: (typeof DEVICES)[number], onClick: (id: string) => void, index: number) {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', `${device.shortName} · ${device.id}`);
  el.className = `map-node map-node--${device.kind}`;
  el.style.setProperty('--node-color', KIND_META[device.kind].color);
  el.style.setProperty('--marker-delay', `${Math.min(12, index) * 32}ms`);
  el.style.setProperty('--pulse-delay', `${-((index * 0.21) % 2.8).toFixed(2)}s`);
  el.innerHTML = `<span class="map-node__pulse"></span><span class="map-node__core">${MARKER_CHAR[device.kind]}</span><span class="map-node__label">${device.shortName}<em>${device.id}</em></span>`;
  el.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick(device.id);
  });
  return el;
}

function createMovingMarker(
  kind: DeviceKind,
  text: string,
  label: string,
  onClick: () => void,
  extraClass = '',
) {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', label);
  el.className = `map-moving map-moving--${kind} ${extraClass}`;
  el.style.setProperty('--node-color', KIND_META[kind].color);
  el.innerHTML = `<span class="map-moving__ring"></span><span class="map-moving__core">${text}</span><span class="map-moving__label">${label}</span>`;
  el.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return el;
}

export function MapView({
  className = '',
  selectedId = null,
  onSelect,
  detailed = false,
  initialZoom = 12.2,
  flyToSelected = false,
}: {
  className?: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  detailed?: boolean;
  initialZoom?: number;
  flyToSelected?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const nodeElsRef = useRef<Record<string, HTMLButtonElement>>({});
  const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const fenceMarkersRef = useRef<maplibregl.Marker[]>([]);
  const movingElsRef = useRef<Record<string, HTMLButtonElement>>({});
  const droneMarkerRef = useRef<maplibregl.Marker | null>(null);
  const ugvMarkerRef = useRef<maplibregl.Marker | null>(null);
  const usvMarkerRef = useRef<maplibregl.Marker | null>(null);
  const satelliteMarkerRef = useRef<maplibregl.Marker | null>(null);
  const orbitRef = useRef(0);
  const droneProgressRef = useRef(0.06);
  const ugvProgressRef = useRef(0.2);
  const usvProgressRef = useRef(0.45);
  const satelliteProgressRef = useRef(0.15);
  const activeRouteRef = useRef<RouteWaypoint[]>(DRONE_ROUTE);
  const droneDeviceIdRef = useRef('UAV-01');
  const onSelectRef = useRef(onSelect);
  const flyToSelectedRef = useRef(flyToSelected);
  const selectedIdRef = useRef(selectedId);
  flyToSelectedRef.current = flyToSelected;
  selectedIdRef.current = selectedId;
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [terrainFailed, setTerrainFailed] = useState(false);
  /* 窄屏默认关地形：它要额外的 DEM 请求与网格构建，手机上优先保单页流畅。
   * 只在初始化时读一次视口宽度，之后不跟随 resize——面板里有手动开关。 */
  const [layers, setLayers] = useState<MapLayers>(() => ({
    ...INITIAL_LAYERS,
    heat: false,
    fences: detailed,
    terrain: detailed && !window.matchMedia('(max-width: 900px)').matches,
  }));
  const { deviceStatuses, scenarioKey } = useSimulation();
  onSelectRef.current = onSelect;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: node,
        style: SATELLITE_STYLE,
        center: AREA_CENTER,
        zoom: initialZoom,
        pitch: layers.terrain ? (detailed ? TERRAIN_PITCH : 0) : detailed ? FLAT_PITCH : 0,
        bearing: detailed ? -8 : 0,
        attributionControl: false,
        dragRotate: false,
        maxZoom: 17.5,
        minZoom: 9.5,
      });
    } catch (error) {
      setMapError(true);
      return undefined;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    /* DEM 真正取不到时只降级关掉立体，不打断地图本身。
     * 注意 MapLibre 会把 404 吞掉、不抛 error，所以这里只是兜底，主判断在下面的探测 effect。 */
    map.on('error', (event) => {
      const err = event.error as (Error & { sourceId?: string }) | undefined;
      const sourceId = (event as unknown as { sourceId?: string }).sourceId ?? err?.sourceId;
      if (sourceId === TERRAIN_SOURCE) setTerrainFailed(true);
    });

    let stopAnimation = () => {};
    map.on('load', () => {
      map.addSource('fences', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: FENCES.map((fence) => ({
            type: 'Feature',
            properties: { color: fence.color, name: fence.name },
            geometry: { type: 'Polygon', coordinates: [fence.coordinates] },
          })),
        },
      });
      map.addLayer({
        id: 'fence-fill',
        type: 'fill',
        source: 'fences',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.055 },
      });
      map.addLayer({
        id: 'fence-line',
        type: 'line',
        source: 'fences',
        paint: {
          'line-color': ['get', 'color'],
          'line-opacity': 0.62,
          'line-width': 1.2,
          'line-dasharray': [4, 4],
        },
      });

      map.addSource('mission-route', {
        type: 'geojson',
        data: routeFeature(activeRouteRef.current),
      });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'mission-route',
        paint: { 'line-color': '#63e9ff', 'line-opacity': 0.16, 'line-width': 8, 'line-blur': 7 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'mission-route',
        paint: {
          'line-color': '#7defff',
          'line-opacity': 0.88,
          'line-width': 1.5,
          'line-dasharray': [1.5, 2],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      map.addSource('device-heat', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: DEVICES.filter((d) => !WAYPOINT_ROUTE_KEYS.has(d.kind)).map((device) => ({
            type: 'Feature',
            properties: { weight: device.kind === 'water' ? 0.9 : device.kind === 'video' ? 0.45 : 0.6 },
            geometry: { type: 'Point', coordinates: [device.lng, device.lat] },
          })),
        },
      });
      map.addLayer({
        id: 'device-heatmap',
        type: 'heatmap',
        source: 'device-heat',
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': 0.75,
          'heatmap-radius': 32,
          'heatmap-opacity': 0.6,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(0,0,0,0)',
            0.3,
            'rgba(35,230,176,0.35)',
            0.65,
            'rgba(75,225,255,0.55)',
            1,
            'rgba(255,188,92,0.8)',
          ],
        },
      });

      map.addSource('satellite-orbit', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [102.042, 36.552],
              [102.078, 36.535],
              [102.122, 36.512],
              [102.164, 36.49],
              [102.196, 36.47],
            ],
          },
        },
      });
      map.addLayer({
        id: 'orbit-line',
        type: 'line',
        source: 'satellite-orbit',
        paint: {
          'line-color': '#f0abfc',
          'line-opacity': 0.28,
          'line-width': 1,
          'line-dasharray': [2, 5],
        },
      });

      DEVICES.forEach((device, index) => {
        if (WAYPOINT_ROUTE_KEYS.has(device.kind)) return;
        const el = createNode(device, (id) => onSelectRef.current?.(id), index);
        nodeElsRef.current[device.id] = el;
        markersRef.current[device.id] = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([device.lng, device.lat])
          .addTo(map);
        // Marker 初始化会覆盖自定义 aria-label，挂载后恢复设备名称。
        el.setAttribute('aria-label', `${device.shortName} · ${device.id}`);
      });

      const createFenceLabel = (fence: (typeof FENCES)[number], color: string) => {
        const el = document.createElement('div');
        el.className = 'fence-label';
        el.style.setProperty('--fence-color', color);
        el.innerHTML = `<span>${fence.name}</span><em>${fence.level}</em>`;
        const coords = fence.coordinates;
        const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map);
        fenceMarkersRef.current.push(marker);
        return marker;
      };
      FENCES.forEach((fence) => createFenceLabel(fence, fence.color));

      const places = [
        { name: '平安区', sub: 'PING\'AN', lng: 102.104, lat: 36.5005, cls: 'place-label--city' },
        { name: '湟水河', sub: 'HUANGSHUI RIVER', lng: 102.0625, lat: 36.5135, cls: 'place-label--river' },
        { name: '东沟水库', sub: 'DONGGOU RESERVOIR', lng: 102.138, lat: 36.487, cls: 'place-label--water' },
        { name: '峡群林场', sub: 'XIAQUN FOREST', lng: 102.1595, lat: 36.4695, cls: 'place-label--forest' },
        { name: '洪水泉乡', sub: 'HONGSHUIQUAN', lng: 102.057, lat: 36.4685, cls: '' },
      ];
      places.forEach((place, index) => {
        const el = document.createElement('div');
        el.className = `place-label ${place.cls}`;
        el.style.setProperty('--place-delay', `${240 + index * 40}ms`);
        el.innerHTML = `<span>${place.name}</span><em>${place.sub}</em>`;
        new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(expandPoint(place.lng, place.lat)).addTo(map);
      });

      const droneEl = createMovingMarker('drone', '机', 'UAV-01 · 河道巡航', () => onSelectRef.current?.(droneDeviceIdRef.current), 'map-moving--drone');
      droneMarkerRef.current = new maplibregl.Marker({ element: droneEl, anchor: 'center' })
        .setLngLat([DRONE_ROUTE[0].lng, DRONE_ROUTE[0].lat])
        .addTo(map);
      movingElsRef.current['drone'] = droneEl;

      const ugvEl = createMovingMarker('ugv', '车', '无人车 · 园区巡护', () => onSelectRef.current?.('UGV-01'));
      ugvMarkerRef.current = new maplibregl.Marker({ element: ugvEl, anchor: 'center' })
        .setLngLat([UGV_ROUTE[0].lng, UGV_ROUTE[0].lat])
        .addTo(map);
      movingElsRef.current['ugv'] = ugvEl;

      const usvEl = createMovingMarker('usv', '船', '无人船 · 水库采样', () => onSelectRef.current?.('USV-01'));
      usvMarkerRef.current = new maplibregl.Marker({ element: usvEl, anchor: 'center' })
        .setLngLat([USV_ROUTE[0].lng, USV_ROUTE[0].lat])
        .addTo(map);
      movingElsRef.current['usv'] = usvEl;

      const satEl = createMovingMarker('satellite', '星', 'GF-6 · 过境观测', () => onSelectRef.current?.('SAT-01'), 'map-moving--sat');
      satelliteMarkerRef.current = new maplibregl.Marker({ element: satEl, anchor: 'center' })
        .setLngLat([102.078, 36.535])
        .addTo(map);
      movingElsRef.current['satellite'] = satEl;
      Object.values(movingElsRef.current).forEach((el) => {
        el.setAttribute('aria-label', el.querySelector('.map-moving__label')?.textContent ?? '巡行设备');
      });

      let last = performance.now();
      let inViewport = true;
      const animate = (now: number) => {
        orbitRef.current = requestAnimationFrame(animate);
        // 巡行动效限制为 30fps，减少四组 DOM Marker 的投影与样式写入。
        if (now - last < 1000 / 30) return;
        const delta = Math.min(80, now - last) / 1000;
        last = now;

        const active = activeRouteRef.current;
        droneProgressRef.current = (droneProgressRef.current + delta / 110) % 1;
        const dronePoint = pointAlong(active, droneProgressRef.current);
        droneMarkerRef.current?.setLngLat([dronePoint.lng, dronePoint.lat]);

        ugvProgressRef.current = (ugvProgressRef.current + delta / 150) % 1;
        const ugvPoint = pointAlong(UGV_ROUTE, ugvProgressRef.current);
        ugvMarkerRef.current?.setLngLat([ugvPoint.lng, ugvPoint.lat]);

        usvProgressRef.current = (usvProgressRef.current + delta / 170) % 1;
        const usvPoint = pointAlong(USV_ROUTE, usvProgressRef.current);
        usvMarkerRef.current?.setLngLat([usvPoint.lng, usvPoint.lat]);

        satelliteProgressRef.current = (satelliteProgressRef.current + delta / 190) % 1;
        const satPoint = pointAlong(
          [
            { lng: 102.042, lat: 36.552, name: '' },
            { lng: 102.196, lat: 36.47, name: '' },
          ],
          satelliteProgressRef.current,
        );
        satelliteMarkerRef.current?.setLngLat([satPoint.lng, satPoint.lat]);
      };
      const syncAnimation = () => {
        cancelAnimationFrame(orbitRef.current);
        if (!document.hidden && inViewport && !prefersReducedMotion()) {
          last = performance.now();
          orbitRef.current = requestAnimationFrame(animate);
        }
      };
      const intersection = new IntersectionObserver(([entry]) => {
        inViewport = entry.isIntersecting;
        syncAnimation();
      });
      intersection.observe(node);
      document.addEventListener('visibilitychange', syncAnimation);
      const unsubscribeMotion = subscribeMotion(syncAnimation);
      syncAnimation();
      stopAnimation = () => {
        cancelAnimationFrame(orbitRef.current);
        intersection.disconnect();
        document.removeEventListener('visibilitychange', syncAnimation);
        unsubscribeMotion();
      };

      const fittedBounds = new maplibregl.LngLatBounds();
      DEVICES.forEach((device) => fittedBounds.extend([device.lng, device.lat]));
      window.setTimeout(() => {
        map.resize();
        // A deep-linked focus owns the camera; fitting here would override its flyTo.
        if (flyToSelectedRef.current && selectedIdRef.current) return;
        map.fitBounds(fittedBounds, {
          padding: detailed
            ? { top: 160, right: 390, bottom: 100, left: 390 }
            : { top: 24, right: 28, bottom: 50, left: 28 },
          maxZoom: detailed ? 12.8 : 12.2,
          duration: 0,
        });
      }, 220);
      if (detailed) window.setTimeout(() => map.resize(), 80);
      setLoaded(true);
    });

    const onResize = () => map.resize();
    const observer = new ResizeObserver(onResize);
    observer.observe(node);

    map.on('click', () => onSelectRef.current?.(null));

    return () => {
      observer.disconnect();
      stopAnimation();
      cancelAnimationFrame(orbitRef.current);
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
  }, [initialZoom, detailed]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setLayoutProperty('satellite', 'visibility', layers.satellite ? 'visible' : 'none');
    map.setLayoutProperty('fence-fill', 'visibility', layers.fences ? 'visible' : 'none');
    map.setLayoutProperty('fence-line', 'visibility', layers.fences ? 'visible' : 'none');
    map.setLayoutProperty('route-glow', 'visibility', layers.route ? 'visible' : 'none');
    map.setLayoutProperty('route-line', 'visibility', layers.route ? 'visible' : 'none');
    map.setLayoutProperty('device-heatmap', 'visibility', layers.heat ? 'visible' : 'none');
    map.setLayoutProperty('orbit-line', 'visibility', layers.orbit ? 'visible' : 'none');
    map.setLayoutProperty(
      'terrain-hillshade',
      'visibility',
      layers.terrain && !terrainFailed ? 'visible' : 'none',
    );
    fenceMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.display = layers.fences ? '' : 'none';
    });
    waypointMarkersRef.current.forEach((marker) => {
      const el = marker.getElement();
      el.style.display = layers.route ? '' : 'none';
    });
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      marker.getElement().style.display = layers.devices ? '' : 'none';
      const el = marker.getElement();
      el.classList.toggle('is-selected', id === selectedId);
      const status = deviceStatuses[id];
      el.classList.toggle('is-warning', status === 'warning');
      el.classList.toggle('is-offline', status === 'offline');
    });
    if (droneMarkerRef.current) {
      droneMarkerRef.current.getElement().style.display = layers.devices && layers.route ? '' : 'none';
    }
    if (ugvMarkerRef.current) {
      ugvMarkerRef.current.getElement().style.display = layers.devices ? '' : 'none';
    }
    if (usvMarkerRef.current) {
      usvMarkerRef.current.getElement().style.display = layers.devices ? '' : 'none';
    }
    if (satelliteMarkerRef.current) {
      satelliteMarkerRef.current.getElement().style.display = layers.orbit ? '' : 'none';
    }
    movingElsRef.current['drone']?.classList.toggle('is-selected', selectedId === 'UAV-01' || selectedId === 'UAV-02');
    movingElsRef.current['ugv']?.classList.toggle('is-selected', selectedId === 'UGV-01');
    movingElsRef.current['usv']?.classList.toggle('is-selected', selectedId === 'USV-01');
    movingElsRef.current['satellite']?.classList.toggle('is-selected', selectedId === 'SAT-01');
  }, [layers, loaded, selectedId, deviceStatuses, terrainFailed]);

  /* 立体地形：抬升相机 + 挂 terrain，关掉时回到平面并恢复轻微俯角 */
  useEffect(() => {
    const map = mapRef.current;
    /* isStyleLoaded 是硬闸门：setTerrain 在样式未就绪时会直接抛错（重建 map 的瞬间会走到） */
    if (!map || !loaded || !map.isStyleLoaded()) return;
    const on = layers.terrain && !terrainFailed;
    if (on) {
      map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION });
    } else {
      map.setTerrain(null);
    }
    const pitch = on ? (detailed ? TERRAIN_PITCH : 0) : detailed ? FLAT_PITCH : 0;
    if (Math.abs(map.getPitch() - pitch) > 0.5) {
      /* 俯角扫动是整屏运动，跟随系统「减少动态效果」：降级时直接落位 */
      const reduceMotion = prefersReducedMotion();
      map.easeTo({ pitch, duration: reduceMotion ? 0 : 460 });
    }
  }, [layers.terrain, terrainFailed, loaded, detailed]);

  /* DEM 可用性探测：MapLibre 会吞掉 404 不抛 error，只靠 error 事件兑现不了「不可用」降级 */
  useEffect(() => {
    if (!layers.terrain || terrainFailed || !loaded) return undefined;
    const map = mapRef.current;
    if (!map) return undefined;
    const center = map.getCenter();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    let cancelled = false;
    fetch(demTileUrl(center.lng, center.lat), { signal: controller.signal })
      .then((res) => {
        if (!res.ok && !cancelled) setTerrainFailed(true);
      })
      .catch(() => {
        /* 超时导致的 abort 算不可用；组件卸载/依赖变更导致的 abort 不算 */
        if (!cancelled) setTerrainFailed(true);
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [layers.terrain, terrainFailed, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const route = scenarioKey === 'fire' ? FOREST_ROUTE : DRONE_ROUTE;
    activeRouteRef.current = route;
    const source = map.getSource('mission-route') as maplibregl.GeoJSONSource | undefined;
    source?.setData(routeFeature(route));
    const droneEl = movingElsRef.current['drone'];
    if (droneEl) {
      const label = droneEl.querySelector('.map-moving__label');
      if (label) {
        droneEl?.setAttribute('aria-label', scenarioKey === 'fire' ? 'UAV-02 · 林火侦察' : 'UAV-01 · 河道巡航');
        label.innerHTML = scenarioKey === 'fire' ? '<i></i>UAV-02 · 林火侦察' : '<i></i>UAV-01 · 河道巡航';
      }
      droneDeviceIdRef.current = scenarioKey === 'fire' ? 'UAV-02' : 'UAV-01';
    }
    if (!detailed) return;
    waypointMarkersRef.current.forEach((marker) => marker.remove());
    waypointMarkersRef.current = [];
    route.forEach((point, index) => {
      if (index === 0 || index === route.length - 1) return;
      const el = document.createElement('div');
      el.className = 'waypoint-marker';
      el.innerHTML = `<span>${index}</span><em>${point.name}</em>`;
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      waypointMarkersRef.current.push(marker);
    });
  }, [scenarioKey, loaded, detailed]);

  useEffect(() => {
    if (!flyToSelected || !selectedId) return;
    const map = mapRef.current;
    if (!map || !loaded) return;
    const device = DEVICES.find((item) => item.id === selectedId);
    if (!device) return;
    map.flyTo({
      center: [device.lng, device.lat],
      zoom: Math.max(12.9, map.getZoom()),
      duration: prefersReducedMotion() ? 0 : 900,
      offset: [0, 60],
      essential: false,
    });
  }, [flyToSelected, selectedId, loaded]);

  const activeRoute = scenarioKey === 'fire' ? FOREST_ROUTE : DRONE_ROUTE;

  const zoomBy = (delta: number) => mapRef.current?.zoomTo(mapRef.current.getZoom() + delta, { duration: prefersReducedMotion() ? 0 : 300 });
  const terrainOn = layers.terrain && !terrainFailed;
  const reset = () =>
    mapRef.current?.flyTo({
      center: AREA_CENTER,
      zoom: initialZoom,
      pitch: terrainOn ? (detailed ? TERRAIN_PITCH : 0) : detailed ? FLAT_PITCH : 0,
      bearing: detailed ? -8 : 0,
      duration: prefersReducedMotion() ? 0 : 600,
    });

  return (
    <div className={`map-view ${className}`}>
      <div ref={containerRef} className="map-view__canvas" />
      <div className="map-view__tint" aria-hidden="true" />
      <div className="map-view__grid" aria-hidden="true" />

      {detailed && (
        <div className="map-layers">
          <div className="map-layers__title">
            <Layers3 size={13} />
            图层控制
          </div>
          <div className="map-layers__items">
            {(
              [
                { key: 'terrain', label: terrainFailed ? '立体地形 · 不可用' : '立体地形' },
                { key: 'satellite', label: '卫星底图' },
                { key: 'devices', label: '感知设备' },
                { key: 'route', label: '无人机航线' },
                { key: 'fences', label: '电子围栏' },
                { key: 'heat', label: '风险热区' },
                { key: 'orbit', label: '卫星过境' },
              ] as { key: keyof MapLayers; label: string }[]
            ).map((item) => {
              const unavailable = item.key === 'terrain' && terrainFailed;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`map-layer-toggle ${layers[item.key] && !unavailable ? 'is-on' : ''}`}
                  aria-pressed={Boolean(layers[item.key]) && !unavailable}
                  aria-disabled={unavailable || undefined}
                  title={unavailable ? '高程数据不可达，点击重试' : undefined}
                  onClick={() => {
                    /* 不可用不锁死会话：点一下即重新探测，而不是逼用户切路由重挂载 */
                    if (unavailable) {
                      setTerrainFailed(false);
                      return;
                    }
                    setLayers((current) => ({ ...current, [item.key]: !current[item.key] }));
                  }}
                >
                  <i />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="map-tools">
        <button type="button" onClick={() => zoomBy(0.7)} title="放大"><Plus size={15} /></button>
        <button type="button" onClick={() => zoomBy(-0.7)} title="缩小"><Minus size={15} /></button>
        <span className="map-tools__sep" />
        <button type="button" onClick={reset} title="复位视图"><LocateFixed size={15} /></button>
      </div>

      <div className="map-coords mono">
        <span>WGS-84</span>
        <span>102.111°E</span>
        <span>36.493°N</span>
        <span className="map-coords__live"><i /> LIVE</span>
      </div>

      <div className="map-route-caption">
        <span className="map-route-caption__dot" />
        <div>
          <strong>{scenarioKey === 'fire' ? 'UAV-02 · 林火侦察航线' : 'UAV-01 · 湟水河巡检航线'}</strong>
          <span>{activeRoute.length} 航点 · 视距链路 · 任务执行中</span>
        </div>
      </div>

      <div className="map-scale-note mono">IMAGERY © ESRI · MAPLIBRE GL · 演示数据</div>

      {mapError && (
        <div className="map-error">
          <strong>地图渲染不可用</strong>
          <span>当前环境不支持 WebGL，请更换浏览器或开启硬件加速。</span>
        </div>
      )}
    </div>
  );
}

export type { MapLayers };
