-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS charging_data_points CASCADE;
DROP TABLE IF EXISTS realtime_telemetry CASCADE;
DROP TABLE IF EXISTS battery_snapshots CASCADE;
DROP TABLE IF EXISTS charging_sessions CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS monthly_summaries CASCADE;
DROP TABLE IF EXISTS daily_summaries CASCADE;
DROP FUNCTION IF EXISTS cleanup_realtime_telemetry CASCADE;

-- Trip data storage - optimized for aggregation
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  start_location JSONB,
  end_location JSONB,
  distance_km DECIMAL(10, 2) NOT NULL,
  energy_used_kwh DECIMAL(8, 2) NOT NULL,
  energy_efficiency DECIMAL(5, 2),
  average_speed_kmh DECIMAL(6, 2),
  max_speed_kmh DECIMAL(6, 2),
  duration_minutes INT,
  coordinates JSONB,
  avg_temperature_inside DECIMAL(5, 2),
  avg_temperature_outside DECIMAL(5, 2),
  autosteer_km DECIMAL(8, 2),
  adaptive_cruise_km DECIMAL(8, 2),
  start_battery_percent DECIMAL(5, 2),
  end_battery_percent DECIMAL(5, 2),
  harsh_accelerations INT DEFAULT 0,
  harsh_brakings INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT trips_vehicle_time CHECK (end_time > start_time)
);

-- Charging sessions - detailed tracking
CREATE TABLE charging_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  location JSONB,
  charger_type TEXT CHECK (charger_type IN ('home', 'supercharger', 'destination', 'other')),
  energy_added_kwh DECIMAL(8, 2) NOT NULL,
  start_battery_percent DECIMAL(5, 2),
  end_battery_percent DECIMAL(5, 2),
  duration_minutes INT,
  average_power_kw DECIMAL(8, 2),
  max_power_kw DECIMAL(8, 2),
  cost DECIMAL(10, 2),
  cost_per_kwh DECIMAL(8, 4),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT charging_sessions_time CHECK (end_time > start_time)
);

-- Battery snapshots - sampled every 2 minutes for high-precision data
CREATE TABLE battery_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  state_of_charge_percent DECIMAL(5, 2),
  rated_range_km DECIMAL(8, 2),
  usable_range_km DECIMAL(8, 2),
  battery_health_percent DECIMAL(5, 2),
  cell_imbalance DECIMAL(5, 3),
  pack_voltage DECIMAL(8, 2),
  pack_current DECIMAL(8, 2),
  power_kw DECIMAL(8, 2),
  temperature_celsius DECIMAL(5, 2),
  heater_on BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Charging data points - sampled every 30 seconds during charging
CREATE TABLE charging_data_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id TEXT NOT NULL,
  charging_session_id UUID REFERENCES charging_sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  battery_percent DECIMAL(5, 2),
  power_kw DECIMAL(8, 2),
  voltage DECIMAL(8, 2),
  current DECIMAL(8, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily aggregated statistics - for fast queries
CREATE TABLE daily_summaries (
  vehicle_id TEXT NOT NULL,
  date DATE NOT NULL,
  total_distance_km DECIMAL(10, 2),
  total_energy_used_kwh DECIMAL(8, 2),
  total_energy_added_kwh DECIMAL(8, 2),
  average_efficiency_km_per_kwh DECIMAL(5, 2),
  trip_count INT DEFAULT 0,
  charging_session_count INT DEFAULT 0,
  avg_temperature_inside DECIMAL(5, 2),
  avg_temperature_outside DECIMAL(5, 2),
  avg_battery_health DECIMAL(5, 2),
  lowest_battery_percent DECIMAL(5, 2),
  highest_battery_percent DECIMAL(5, 2),
  total_cost DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (vehicle_id, date)
);

-- Monthly aggregated statistics - for trends
CREATE TABLE monthly_summaries (
  vehicle_id TEXT NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  total_distance_km DECIMAL(10, 2),
  total_energy_used_kwh DECIMAL(8, 2),
  total_energy_added_kwh DECIMAL(8, 2),
  average_efficiency_km_per_kwh DECIMAL(5, 2),
  trip_count INT DEFAULT 0,
  charging_session_count INT DEFAULT 0,
  total_cost DECIMAL(10, 2),
  degradation_percent DECIMAL(5, 2),
  data_points INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (vehicle_id, year, month)
);

-- Realtime telemetry - for live dashboard (TTL 24 hours)
CREATE TABLE realtime_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  heading INT,
  speed_kmh DECIMAL(6, 2),
  power_kw DECIMAL(8, 2),
  battery_percent DECIMAL(5, 2),
  temp_inside DECIMAL(5, 2),
  temp_outside DECIMAL(5, 2),
  charge_state TEXT CHECK (charge_state IN ('idle', 'charging', 'driving')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_trips_vehicle_date ON trips(vehicle_id, start_time DESC);
CREATE INDEX idx_trips_efficiency ON trips(vehicle_id, energy_efficiency DESC);
CREATE INDEX idx_trips_distance ON trips(vehicle_id, distance_km DESC);

CREATE INDEX idx_charging_sessions_vehicle_date ON charging_sessions(vehicle_id, start_time DESC);
CREATE INDEX idx_charging_sessions_cost ON charging_sessions(vehicle_id, cost DESC);

CREATE INDEX idx_battery_snapshots_vehicle_time ON battery_snapshots(vehicle_id, timestamp DESC);
CREATE INDEX idx_battery_snapshots_health ON battery_snapshots(vehicle_id, battery_health_percent DESC);

CREATE INDEX idx_charging_data_points_session ON charging_data_points(charging_session_id, timestamp);

CREATE INDEX idx_realtime_telemetry_vehicle_time ON realtime_telemetry(vehicle_id, timestamp DESC);
CREATE INDEX idx_daily_summaries_vehicle_date ON daily_summaries(vehicle_id, date DESC);

-- Cleanup old realtime telemetry (24 hour retention)
CREATE OR REPLACE FUNCTION cleanup_realtime_telemetry()
RETURNS void AS $$
BEGIN
  DELETE FROM realtime_telemetry
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;


