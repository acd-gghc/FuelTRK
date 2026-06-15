import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Brush,
} from 'recharts';

const UNIT_MAP = {
  AltB: 'ft', AltMSL: 'ft', AltGPS: 'ft',
  IAS: 'kt', GndSpd: 'kt', TAS: 'kt', WndSpd: 'kt',
  VSpd: 'fpm', VSpdG: 'fpm',
  Pitch: 'deg', Roll: 'deg', HDG: 'deg', TRK: 'deg', CRS: 'deg', WndDr: 'deg', WptBrg: 'deg', MagVar: 'deg',
  Latitude: 'deg', Longitude: 'deg',
  LatAc: 'G', NormAc: 'G',
  OAT: 'C', BaroA: 'inHg',
  FQtyL: 'gal', FQtyR: 'gal',
  'E1 FFlow': 'gph', 'E2 FFlow': 'gph',
  'E1 FPres': 'psi', 'E2 FPres': 'psi',
  'E1 OilT': 'F', 'E2 OilT': 'F',
  'E1 OilP': 'psi', 'E2 OilP': 'psi',
  'E1 RPM': 'rpm', 'E2 RPM': 'rpm',
  'E1 %Pwr': '%', 'E2 %Pwr': '%',
  volt1: 'V', volt2: 'V',
  WptDst: 'nm',
  HCDI: 'fsd', VCDI: 'fsd',
};

const DASH_PATTERNS = [
  '',           // solid
  '8 4',        // long dash
  '3 3',        // short dash
  '12 4 3 4',   // dash-dot
  '3 3 8 3',    // short-long
  '1 3',        // dotted
];

function getAxisId(param) {
  const engineMatch = param.match(/^E[12] (.+)$/);
  if (engineMatch) return engineMatch[1];
  if (param === 'FQtyL' || param === 'FQtyR') return 'FQty';
  if (param === 'volt1' || param === 'volt2') return 'Volts';
  if (param === 'AltB' || param === 'AltMSL' || param === 'AltGPS') return 'Alt';
  if (param === 'VSpd' || param === 'VSpdG') return 'VSpd';
  return param;
}

function getAxisLabel(axisId) {
  const labels = {
    FFlow: 'Fuel Flow (gph)', FPres: 'Fuel Pres (psi)',
    OilT: 'Oil Temp (F)', OilP: 'Oil Pres (psi)',
    RPM: 'RPM', '%Pwr': 'Power (%)',
    FQty: 'Fuel Qty (gal)', Volts: 'Volts (V)',
    Alt: 'Altitude (ft)', VSpd: 'Vert Speed (fpm)',
    IAS: 'IAS (kt)', GndSpd: 'Gnd Spd (kt)', TAS: 'TAS (kt)',
    Pitch: 'Pitch (deg)', Roll: 'Roll (deg)',
    HDG: 'Heading (deg)', TRK: 'Track (deg)',
    OAT: 'OAT (C)', BaroA: 'Baro (inHg)',
  };
  return labels[axisId] || axisId;
}

// Params where an average is meaningful
const AVERAGEABLE = new Set([
  'IAS', 'GndSpd', 'TAS', 'WndSpd',
  'AltB', 'AltMSL', 'AltGPS', 'OAT',
  'E1 FFlow', 'E2 FFlow', 'E1 FPres', 'E2 FPres',
  'E1 OilT', 'E2 OilT', 'E1 OilP', 'E2 OilP',
  'E1 RPM', 'E2 RPM', 'E1 %Pwr', 'E2 %Pwr',
  'volt1', 'volt2', 'FQtyL', 'FQtyR',
]);

// Params where showing total fuel burned (start - end) makes more sense
const FUEL_QTY = new Set(['FQtyL', 'FQtyR']);

function formatElapsed(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h${m.toString().padStart(2, '0')}m`;
}

export default function ChartView({ flights, selectedParams }) {
  // Compute aggregate stats per flight
  const flightStats = useMemo(() => {
    return flights.map((flight) => {
      const rows = flight.rows;
      // Find first and last rows with valid elapsed time
      let firstElapsed = null;
      let lastElapsed = null;
      for (const r of rows) {
        if (r._elapsed != null) {
          if (firstElapsed === null) firstElapsed = r._elapsed;
          lastElapsed = r._elapsed;
        }
      }
      const duration = (firstElapsed != null && lastElapsed != null)
        ? lastElapsed - firstElapsed
        : 0;

      const paramStats = {};
      for (const param of selectedParams) {
        if (!AVERAGEABLE.has(param)) continue;

        const vals = [];
        for (const row of rows) {
          if (row[param] != null) vals.push(row[param]);
        }
        if (vals.length === 0) continue;

        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

        if (FUEL_QTY.has(param)) {
          const first = vals[0];
          const last = vals[vals.length - 1];
          paramStats[param] = { avg, burned: first - last };
        } else {
          paramStats[param] = { avg };
        }
      }

      return { id: flight.id, name: flight.name, color: flight.color, duration, paramStats };
    });
  }, [flights, selectedParams]);

  const totalDuration = flightStats.reduce((sum, fs) => sum + fs.duration, 0);

  const { chartData, lineConfigs, uniqueAxes } = useMemo(() => {
    if (flights.length === 0 || selectedParams.length === 0) {
      return { chartData: [], lineConfigs: [], uniqueAxes: [] };
    }

    // Merge all flight data into a single time series
    const timeMap = new Map();

    flights.forEach((flight) => {
      const rows = flight.rows;
      const step = rows.length > 2000 ? Math.ceil(rows.length / 2000) : 1;

      for (let i = 0; i < rows.length; i += step) {
        const row = rows[i];
        const t = row._elapsed;
        if (t == null) continue;

        if (!timeMap.has(t)) {
          timeMap.set(t, { _elapsed: t });
        }
        const merged = timeMap.get(t);

        for (const param of selectedParams) {
          if (row[param] != null) {
            merged[`${flight.id}__${param}`] = row[param];
          }
        }
      }
    });

    const data = Array.from(timeMap.values()).sort((a, b) => a._elapsed - b._elapsed);

    // Build line configs and collect axes
    const axisSet = new Map();
    const configs = [];

    flights.forEach((flight) => {
      selectedParams.forEach((param, paramIdx) => {
        const dataKey = `${flight.id}__${param}`;
        const axisId = getAxisId(param);
        const unit = UNIT_MAP[param] || '';

        if (!axisSet.has(axisId)) {
          axisSet.set(axisId, {
            id: axisId,
            label: getAxisLabel(axisId),
            unit,
          });
        }

        configs.push({
          dataKey,
          displayName: flights.length > 1 ? `${flight.name} / ${param}` : param,
          param,
          color: flight.color,
          dash: DASH_PATTERNS[paramIdx % DASH_PATTERNS.length],
          yAxisId: axisId,
          unit,
        });
      });
    });

    const axes = Array.from(axisSet.values()).map((axis, i) => ({
      ...axis,
      orientation: i % 2 === 0 ? 'left' : 'right',
    }));

    return { chartData: data, lineConfigs: configs, uniqueAxes: axes };
  }, [flights, selectedParams]);

  if (chartData.length === 0) return null;

  const axisWidth = 60;

  // Build lookup for tooltip
  const lineDisplayMap = {};
  lineConfigs.forEach((lc) => {
    lineDisplayMap[lc.dataKey] = lc;
  });

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 10 }}>
        {lineConfigs.map(({ dataKey, displayName, color, dash, unit }) => (
          <span key={dataKey} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={18} height={4} style={{ flexShrink: 0 }}>
              <line
                x1={0} y1={2} x2={18} y2={2}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={dash}
              />
            </svg>
            {displayName}
            {unit && <span style={{ color: '#555' }}>({unit})</span>}
          </span>
        ))}
      </div>

      {/* Aggregate stats */}
      <div style={{
        background: '#16213e',
        border: '1px solid #0f3460',
        borderRadius: 6,
        padding: '8px 12px',
        marginBottom: 10,
        fontSize: 12,
      }}>
        {/* Per-flight rows */}
        {flightStats.map((fs) => {
          const averageableParams = selectedParams.filter((p) => fs.paramStats[p]);
          return (
            <div key={fs.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: flightStats.length > 1 ? 4 : 0, alignItems: 'center' }}>
              <span style={{ color: fs.color, fontWeight: 600, minWidth: flightStats.length > 1 ? 100 : 0 }}>
                {flightStats.length > 1 ? fs.name : ''}
              </span>
              <span style={{ color: '#aaa' }}>
                <span style={{ color: '#666' }}>Time </span>{formatDuration(fs.duration)}
              </span>
              {averageableParams.map((param) => {
                const s = fs.paramStats[param];
                const unit = UNIT_MAP[param] || '';
                const dec = ['RPM'].some((k) => param.includes(k)) ? 0 : param.includes('OilT') ? 0 : 1;
                return (
                  <span key={param} style={{ color: '#aaa' }}>
                    <span style={{ color: '#666' }}>
                      {FUEL_QTY.has(param) ? `${param} used ` : `${param} `}
                    </span>
                    {FUEL_QTY.has(param)
                      ? `${s.burned.toFixed(1)} ${unit}`
                      : `${s.avg.toFixed(dec)} ${unit}`
                    }
                  </span>
                );
              })}
            </div>
          );
        })}
        {/* Totals row when multiple flights */}
        {flightStats.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', borderTop: '1px solid #0f3460', paddingTop: 4, marginTop: 4, alignItems: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 600, minWidth: 100 }}>Total</span>
            <span style={{ color: '#ccc' }}>
              <span style={{ color: '#666' }}>Time </span>{formatDuration(totalDuration)}
            </span>
            {selectedParams.filter((p) => AVERAGEABLE.has(p)).map((param) => {
              const allVals = [];
              const allBurned = [];
              flightStats.forEach((fs) => {
                if (fs.paramStats[param]) {
                  allVals.push(fs.paramStats[param].avg);
                  if (FUEL_QTY.has(param)) allBurned.push(fs.paramStats[param].burned);
                }
              });
              if (allVals.length === 0) return null;
              const overallAvg = allVals.reduce((a, b) => a + b, 0) / allVals.length;
              const unit = UNIT_MAP[param] || '';
              const dec = ['RPM'].some((k) => param.includes(k)) ? 0 : param.includes('OilT') ? 0 : 1;
              return (
                <span key={param} style={{ color: '#ccc' }}>
                  <span style={{ color: '#666' }}>
                    {FUEL_QTY.has(param) ? `${param} used ` : `${param} `}
                  </span>
                  {FUEL_QTY.has(param)
                    ? `${allBurned.reduce((a, b) => a + b, 0).toFixed(1)} ${unit}`
                    : `${overallAvg.toFixed(dec)} ${unit}`
                  }
                </span>
              );
            })}
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={520}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
          <XAxis
            dataKey="_elapsed"
            tickFormatter={formatElapsed}
            stroke="#555"
            tick={{ fontSize: 11, fill: '#888' }}
            label={{ value: 'Elapsed Time', position: 'insideBottom', offset: -2, fill: '#666', fontSize: 11 }}
          />

          {uniqueAxes.map(({ id, label, orientation }, i) => (
            <YAxis
              key={id}
              yAxisId={id}
              orientation={orientation}
              stroke="#777"
              tick={{ fontSize: 10, fill: '#777' }}
              tickFormatter={(v) => (v != null ? v.toFixed(1) : '')}
              width={axisWidth}
              label={{
                value: label,
                angle: orientation === 'left' ? -90 : 90,
                position: 'insideLeft',
                fill: '#888',
                fontSize: 10,
                dx: orientation === 'left' ? -10 : 10,
              }}
              domain={['auto', 'auto']}
              allowDataOverflow
              hide={uniqueAxes.length > 4 && i >= 4}
            />
          ))}

          <Tooltip
            contentStyle={{ background: '#16213e', border: '1px solid #0f3460', fontSize: 12, color: '#ddd' }}
            labelFormatter={(v) => `T+${formatElapsed(v)}`}
            formatter={(value, name) => {
              const lc = lineDisplayMap[name];
              if (!lc) return [value, name];
              if (value == null) return ['--', lc.displayName];
              return [`${value.toFixed(2)} ${lc.unit}`, lc.displayName];
            }}
          />

          {lineConfigs.map(({ dataKey, color, dash, yAxisId }) => (
            <Line
              key={dataKey}
              type="monotone"
              dataKey={dataKey}
              name={dataKey}
              yAxisId={yAxisId}
              stroke={color}
              strokeDasharray={dash || undefined}
              dot={false}
              strokeWidth={1.5}
              connectNulls
              isAnimationActive={false}
            />
          ))}

          <Brush
            dataKey="_elapsed"
            height={30}
            stroke="#0f3460"
            fill="#16213e"
            tickFormatter={formatElapsed}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
