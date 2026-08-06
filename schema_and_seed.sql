CREATE TABLE IF NOT EXISTS machine_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id INTEGER,
    machine_name VARCHAR(100),
    service_type VARCHAR(50),
    interval_hrs INTEGER,
    interval_days INTEGER,
    notify_1_hrs_before INTEGER,
    notify_2_hrs_before INTEGER,
    notify_1_days_before INTEGER,
    notify_2_days_before INTEGER
);

-- Delete existing configurations to prevent duplicates if script is run multiple times
DELETE FROM machine_config;

-- Insert configurations
INSERT INTO machine_config (machine_id, machine_name, service_type, interval_hrs, interval_days, notify_1_hrs_before, notify_2_hrs_before, notify_1_days_before, notify_2_days_before) VALUES
(1, 'Solar generation', 'Standard', NULL, 10, NULL, NULL, 3, 2),
(2, 'Diesel generator 750KVA', 'Standard', 500, 180, 100, 50, 30, 2),
(3, 'Diesel generator (rent) 750KVA', 'Standard', 500, 180, 100, 50, 30, 2),
(4, 'Diesel generator 400KVA', 'Standard', 500, 180, 100, 50, 30, 2),
(5, 'CSD - 85 / SR. No. - 1067 COMPRESSER - 1 (PH)', 'Half', 3000, 365, 500, 50, 30, 2),
(5, 'CSD - 85 / SR. No. - 1067 COMPRESSER - 1 (PH)', 'Full', 6000, 365, 500, 50, 30, 2),
(6, 'BSD - 75 / SR. No. - 1543 COMPRESSER - 2 (NEW)', 'Half', 3000, 365, 500, 50, 30, 2),
(6, 'BSD - 75 / SR. No. - 1543 COMPRESSER - 2 (NEW)', 'Full', 6000, 365, 500, 50, 30, 2),
(7, 'BSD - 75 / SR. No. - 1343 COMPRESSER - 3 (OLD)', 'Half', 3000, 365, 500, 50, 30, 2),
(7, 'BSD - 75 / SR. No. - 1343 COMPRESSER - 3 (OLD)', 'Full', 6000, 365, 500, 50, 30, 2),
(8, 'Toyota forklift', 'Standard', 500, NULL, 100, 50, NULL, NULL),
(9, 'Voltas forklift', 'Standard', 500, NULL, 100, 50, NULL, NULL),
(10, 'Toyota RT', 'Standard', 500, NULL, 100, 50, NULL, NULL);
