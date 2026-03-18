import type * as Leaflet from "leaflet";
import React, { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { KM_PER_MILE, METERS_PER_MILE } from "./constants";
import type { RankedRestaurant, UserLocation } from "./types";
import { formatDistance } from "./utils";

type LeafletModule = typeof Leaflet;

type OpenStreetMapPanelProps = {
  userLocation: UserLocation;
  rankedRestaurants: RankedRestaurant[];
  maxDistanceMiles: number;
};

function hasValidCoordinates(lat: number, lng: number): boolean {
  const inRange = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const notZeroOrigin = Math.abs(lat) > 1e-9 || Math.abs(lng) > 1e-9;
  return Number.isFinite(lat) && Number.isFinite(lng) && inRange && notZeroOrigin;
}

export function OpenStreetMapPanel({
  userLocation,
  rankedRestaurants,
  maxDistanceMiles,
}: OpenStreetMapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const markerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const radiusCircleRef = useRef<Leaflet.Circle | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initializeMap = async () => {
      const container = mapContainerRef.current;
      if (!container || mapRef.current) {
        return;
      }

      const L = await import("leaflet");
      if (cancelled || !mapContainerRef.current) {
        return;
      }

      leafletRef.current = L;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      map.invalidateSize();
      setMapReady(true);
    };

    void initializeMap();

    return () => {
      cancelled = true;
      setMapReady(false);
      markerLayerRef.current?.clearLayers();
      markerLayerRef.current = null;
      radiusCircleRef.current?.remove();
      radiusCircleRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) {
      return;
    }

    const map = mapRef.current;
    const L = leafletRef.current;
    const markerLayer = markerLayerRef.current ?? L.layerGroup().addTo(map);
    markerLayerRef.current = markerLayer;
    markerLayer.clearLayers();

    const hasDistanceFilter = maxDistanceMiles > 0;
    const radiusKm = maxDistanceMiles * KM_PER_MILE;
    radiusCircleRef.current?.remove();
    radiusCircleRef.current = null;
    if (hasDistanceFilter) {
      const radiusCircle = L.circle([userLocation.lat, userLocation.lng], {
        radius: maxDistanceMiles * METERS_PER_MILE,
        color: "#f43f5e",
        weight: 1.5,
        fillColor: "#f43f5e",
        fillOpacity: 0.08,
      }).addTo(map);
      radiusCircleRef.current = radiusCircle;
    }

    const visibleRestaurants = hasDistanceFilter
      ? rankedRestaurants.filter((entry) => entry.distanceKm <= radiusKm).slice(0, 15)
      : rankedRestaurants.slice(0, 15);

    const points: Array<[number, number]> = [[userLocation.lat, userLocation.lng]];

    const userMarkerIcon = L.divIcon({
      className: "",
      html: '<span style="display:block;height:14px;width:14px;border-radius:9999px;background:#111827;border:2px solid #ffffff;box-shadow:0 0 0 2px #f43f5e;"></span>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    L.marker([userLocation.lat, userLocation.lng], { icon: userMarkerIcon })
      .addTo(markerLayer)
      .bindPopup(`<b>You</b><br/>${userLocation.label}`);

    visibleRestaurants.forEach((entry, index) => {
      const { restaurant } = entry;
      if (!hasValidCoordinates(restaurant.location.lat, restaurant.location.lng)) {
        return;
      }
      const markerIcon = L.divIcon({
        className: "",
        html: `<span style="display:block;height:11px;width:11px;border-radius:9999px;background:${index < 3 ? "#f43f5e" : "#334155"};border:2px solid #ffffff;"></span>`,
        iconSize: [11, 11],
        iconAnchor: [6, 6],
      });

      L.marker([restaurant.location.lat, restaurant.location.lng], { icon: markerIcon })
        .addTo(markerLayer)
        .bindPopup(`<b>${restaurant.name}</b><br/>${formatDistance(entry.distanceKm)}`);

      points.push([restaurant.location.lat, restaurant.location.lng]);
    });

    const zoomCapByRadius =
      maxDistanceMiles <= 1 ? 13 : maxDistanceMiles <= 3 ? 12 : maxDistanceMiles <= 8 ? 11 : 10;

    const combinedBounds = hasDistanceFilter
      ? L.latLngBounds(points).extend(
          L.latLng(userLocation.lat, userLocation.lng)
            .toBounds(maxDistanceMiles * METERS_PER_MILE)
            .pad(0.35),
        )
      : L.latLngBounds(points);
    if (combinedBounds.isValid() && mapRef.current === map) {
      try {
        map.fitBounds(combinedBounds, { padding: [52, 52], maxZoom: zoomCapByRadius });
      } catch {
        map.setView([userLocation.lat, userLocation.lng], zoomCapByRadius);
      }
    }

    map.invalidateSize();
  }, [mapReady, maxDistanceMiles, rankedRestaurants, userLocation]);

  return (
    <Card className="border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-7rem)]">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Nearby on OpenStreetMap</p>
            <p className="text-xs text-slate-500">
              {maxDistanceMiles > 0
                ? `Map updates as filters change · radius ${maxDistanceMiles} mi`
                : "Map updates as filters change · any distance"}
            </p>
          </div>
          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
            OSM
          </Badge>
        </div>
        <div
          ref={mapContainerRef}
          className="h-80 overflow-hidden rounded-xl border border-slate-200 lg:h-[calc(100vh-12.5rem)] [&_.leaflet-control-attribution]:text-[10px]"
        />
      </CardContent>
    </Card>
  );
}
