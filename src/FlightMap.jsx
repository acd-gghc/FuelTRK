import { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, bounds]);
  return null;
}

export default function FlightMap({ flights }) {
  const tracks = useMemo(() => {
    return flights
      .map((flight) => {
        const positions = flight.rows
          .filter(
            (r) =>
              r.Latitude != null &&
              r.Longitude != null &&
              r.Latitude !== 0 &&
              r.Longitude !== 0
          )
          .map((r) => [r.Latitude, r.Longitude]);

        // Downsample for map performance
        const step = Math.max(1, Math.ceil(positions.length / 500));
        const sampled = positions.filter((_, i) => i % step === 0);

        return {
          id: flight.id,
          name: flight.name,
          color: flight.color,
          positions: sampled,
        };
      })
      .filter((t) => t.positions.length > 1);
  }, [flights]);

  const bounds = useMemo(() => {
    const allPoints = tracks.flatMap((t) => t.positions);
    if (allPoints.length === 0) return null;
    return L.latLngBounds(allPoints);
  }, [tracks]);

  if (tracks.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#16213e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#555',
          fontSize: 12,
        }}
      >
        No position data
      </div>
    );
  }

  return (
    <MapContainer
      style={{ width: '100%', height: '100%' }}
      center={[0, 0]}
      zoom={2}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds bounds={bounds} />
      {tracks.map((track) => (
        <Polyline
          key={track.id}
          positions={track.positions}
          pathOptions={{
            color: track.color,
            weight: 2.5,
            opacity: 0.85,
          }}
        />
      ))}
    </MapContainer>
  );
}
