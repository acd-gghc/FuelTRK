import { useState, useCallback, useRef, useEffect } from 'react';
import ChartView from './ChartView';
import FlightMap from './FlightMap';
import { parseGarminCSV, extractFlightMeta } from './parseCSV';
import './App.css';

const FLIGHT_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#469990', '#9A6324',
  '#800000', '#aaffc3', '#808000', '#000075', '#fabed4',
  '#dcbeff', '#a9a9a9',
];

const PRE_LOAD_FILES = [
  'log_260612_102403_KLDJ.csv',
  'log_260612_112334_KLDJ.csv',
  'log_260612_170202_KBKL.csv',
  'log_260613_100634_KIOW.csv',
  'log_260613_102233_KIOW.csv',
  'log_260613_150032_KICR.csv',
  'log_260614_135453______.csv',
  'log_260614_141002_46U.csv',
  'log_260614_191702_KTRK.csv',
];

const COLUMN_GROUPS = {
  'Position': ['Latitude', 'Longitude', 'AltB', 'AltMSL', 'AltGPS'],
  'Speed': ['IAS', 'GndSpd', 'TAS', 'VSpd', 'VSpdG'],
  'Attitude': ['Pitch', 'Roll', 'HDG', 'TRK', 'CRS'],
  'Acceleration': ['LatAc', 'NormAc'],
  'Atmosphere': ['OAT', 'BaroA', 'WndSpd', 'WndDr'],
  'Fuel': ['FQtyL', 'FQtyR'],
  'Engine 1': ['E1 FFlow', 'E1 FPres', 'E1 OilT', 'E1 OilP', 'E1 RPM', 'E1 %Pwr'],
  'Engine 2': ['E2 FFlow', 'E2 FPres', 'E2 OilT', 'E2 OilP', 'E2 RPM', 'E2 %Pwr'],
  'Electrical': ['volt1', 'volt2'],
  'Navigation': ['HCDI', 'VCDI', 'WptDst', 'WptBrg', 'MagVar'],
};

export default function App() {
  const [flights, setFlights] = useState([]);
  const [selectedFlightIds, setSelectedFlightIds] = useState(new Set());
  const [selectedParams, setSelectedParams] = useState([]);
  const [showMap, setShowMap] = useState(true);
  const nextId = useRef(0);

  // Pre-load bundled flight data on mount
  useEffect(() => {
    PRE_LOAD_FILES.forEach((fileName) => {
      fetch(`/pre_load_data/${fileName}`)
        .then((r) => r.text())
        .then((text) => {
          const { rows, headers } = parseGarminCSV(text);
          if (rows.length === 0) return;
          const meta = extractFlightMeta(fileName);
          const id = String(nextId.current++);
          const flight = {
            id,
            name: meta.name,
            fileName,
            rows,
            headers,
            color: FLIGHT_COLORS[parseInt(id) % FLIGHT_COLORS.length],
          };
          setFlights((prev) => [...prev, flight]);
          setSelectedFlightIds((prev) => new Set([...prev, id]));
        })
        .catch(() => {});
    });
  }, []);

  const handleFiles = useCallback((e) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const { rows, headers } = parseGarminCSV(ev.target.result);
        if (rows.length === 0) return;
        const meta = extractFlightMeta(file.name);
        const id = String(nextId.current++);
        const flight = {
          id,
          name: meta.name,
          fileName: file.name,
          rows,
          headers,
          color: FLIGHT_COLORS[parseInt(id) % FLIGHT_COLORS.length],
        };
        setFlights((prev) => [...prev, flight]);
        setSelectedFlightIds((prev) => new Set([...prev, id]));
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  }, []);

  const removeFlight = (id) => {
    setFlights((prev) => prev.filter((f) => f.id !== id));
    setSelectedFlightIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const removeAllFlights = () => {
    setFlights([]);
    setSelectedFlightIds(new Set());
    setSelectedParams([]);
  };

  const toggleFlight = (id) => {
    setSelectedFlightIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFlights = () => {
    if (selectedFlightIds.size === flights.length) {
      setSelectedFlightIds(new Set());
    } else {
      setSelectedFlightIds(new Set(flights.map((f) => f.id)));
    }
  };

  const toggleParam = (param) => {
    setSelectedParams((prev) =>
      prev.includes(param) ? prev.filter((p) => p !== param) : [...prev, param]
    );
  };

  const clearParams = () => setSelectedParams([]);

  // Union of all headers across loaded flights
  const allHeaders = [...new Set(flights.flatMap((f) => f.headers))];

  // Group headers
  const groupedColumns = {};
  const ungrouped = [];
  for (const col of allHeaders) {
    let found = false;
    for (const [group, members] of Object.entries(COLUMN_GROUPS)) {
      if (members.includes(col)) {
        if (!groupedColumns[group]) groupedColumns[group] = [];
        groupedColumns[group].push(col);
        found = true;
        break;
      }
    }
    if (!found) ungrouped.push(col);
  }

  const selectedFlights = flights.filter((f) => selectedFlightIds.has(f.id));
  const hasTrackData = selectedFlights.some((f) =>
    f.rows.some((r) => r.Latitude != null && r.Longitude != null && r.Latitude !== 0 && r.Longitude !== 0)
  );

  const renderParamItem = (col) => {
    const isOn = selectedParams.includes(col);
    return (
      <label
        key={col}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 6px',
          borderRadius: 4,
          cursor: 'pointer',
          background: isOn ? '#16213e' : 'transparent',
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: isOn ? '#4fc3f7' : '#333',
            flexShrink: 0,
          }}
        />
        <input
          type="checkbox"
          checked={isOn}
          onChange={() => toggleParam(col)}
          style={{ display: 'none' }}
        />
        {col}
      </label>
    );
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 20, background: '#1a1a2e', minHeight: '100vh', color: '#e0e0e0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#fff' }}>FuelTRK Flight Data Viewer</h1>
        <label
          style={{
            display: 'inline-block',
            padding: '6px 14px',
            background: '#16213e',
            border: '1px solid #0f3460',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Load CSV Files
          <input type="file" accept=".csv" multiple onChange={handleFiles} style={{ display: 'none' }} />
        </label>
        {flights.length > 0 && (
          <span style={{ color: '#666', fontSize: 13 }}>{flights.length} flight{flights.length !== 1 ? 's' : ''} loaded</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Sidebar */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 80px)' }}>
          {/* Flights section */}
          {flights.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 13, color: '#aaa' }}>
                  Flights ({selectedFlightIds.size}/{flights.length})
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={toggleAllFlights}
                    style={{ background: 'none', border: 'none', color: '#4fc3f7', cursor: 'pointer', fontSize: 11 }}
                  >
                    {selectedFlightIds.size === flights.length ? 'None' : 'All'}
                  </button>
                  <button
                    onClick={removeAllFlights}
                    style={{ background: 'none', border: 'none', color: '#f66', cursor: 'pointer', fontSize: 11 }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', fontSize: 12 }}>
                {flights.map((f) => {
                  const isOn = selectedFlightIds.has(f.id);
                  return (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 6px',
                        borderRadius: 4,
                        background: isOn ? '#16213e' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => toggleFlight(f.id)}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: isOn ? f.color : '#333',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </span>
                      <span style={{ color: '#555', fontSize: 10, flexShrink: 0 }}>
                        {f.rows.length}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFlight(f.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#555',
                          cursor: 'pointer',
                          fontSize: 11,
                          padding: '0 2px',
                          flexShrink: 0,
                        }}
                      >
                        x
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Datasets section */}
          {allHeaders.length > 0 && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 13, color: '#aaa' }}>Datasets ({selectedParams.length})</h3>
                {selectedParams.length > 0 && (
                  <button onClick={clearParams} style={{ background: 'none', border: 'none', color: '#f66', cursor: 'pointer', fontSize: 11 }}>
                    Clear
                  </button>
                )}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', fontSize: 12 }}>
                {Object.entries(groupedColumns).map(([group, cols]) => (
                  <div key={group} style={{ marginBottom: 10 }}>
                    <div style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{group}</div>
                    {cols.map(renderParamItem)}
                  </div>
                ))}
                {ungrouped.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Other</div>
                    {ungrouped.map(renderParamItem)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main area */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
          {selectedFlights.length === 0 || selectedParams.length === 0 ? (
            <div style={{ color: '#555', textAlign: 'center', marginTop: 120, fontSize: 14 }}>
              {flights.length === 0
                ? 'Load CSV files to begin'
                : selectedFlights.length === 0
                  ? 'Select flights from the sidebar'
                  : 'Select datasets to plot'}
            </div>
          ) : (
            <>
              {hasTrackData && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                  <button
                    onClick={() => setShowMap((v) => !v)}
                    style={{
                      background: showMap ? '#0f3460' : '#16213e',
                      border: '1px solid #0f3460',
                      color: '#aaa',
                      borderRadius: 4,
                      padding: '3px 10px',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {showMap ? 'Hide Map' : 'Show Map'}
                  </button>
                </div>
              )}

              {showMap && hasTrackData && (
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid #0f3460',
                    marginBottom: 8,
                  }}
                >
                  <FlightMap flights={selectedFlights} />
                </div>
              )}

              <div style={{ flex: 1, minHeight: 0 }}>
                <ChartView flights={selectedFlights} selectedParams={selectedParams} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
