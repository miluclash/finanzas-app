// Migraciones del esquema de Entreno (versiones 2000–2999). Cada una se aplica una sola vez, en
// orden, dentro de una transacción (ver `core/migrations.ts`). Nunca se edita una migración
// publicada: cualquier cambio va en una migración nueva.
//
// Solo CREATE (e INSERT de datos iniciales): no se puede reconstruir una tabla porque la migración
// corre dentro de la transacción de la cola y ahí no se puede apagar `foreign_keys`.
//
// SQLite exige que la tabla padre de una FOREIGN KEY exista al escribir en la hija (aunque el valor
// sea NULL), así que el orden de las migraciones sigue las referencias: catálogo → planificación →
// sesiones → ajustes → datos iniciales.
import type { Migration } from '../../core/migrations'

const BOOL = (col: string, def: 0 | 1) => `${col} INTEGER NOT NULL DEFAULT ${def} CHECK (${col} IN (0,1))`
const INT = (col: string) => `CHECK (${col} IS NULL OR typeof(${col}) = 'integer')`
const NUM = (col: string) => `CHECK (${col} IS NULL OR typeof(${col}) IN ('integer','real'))`
const NOT_BLANK = (col: string) => `CHECK (length(trim(${col})) > 0)`
const DATE_CHECK = (col: string) => `CHECK (${col} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')`
const NULLABLE_DATE_CHECK = (col: string) =>
  `CHECK (${col} IS NULL OR ${col} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')`
const LOCAL_DT = `'[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]'`
const KINDS = `('GYM','SWIM','HYROX','RUN','OTHER')`

/** ISO local `YYYY-MM-DDTHH:mm` → formato Hevy `5 Nov 2026, 07:05` (NULL si es NULL). */
const HEVY_DATE = (col: string) =>
  `CAST(substr(${col}, 9, 2) AS INTEGER) || ' ' || ` +
  `substr('JanFebMarAprMayJunJulAugSepOctNovDec', (CAST(substr(${col}, 6, 2) AS INTEGER) - 1) * 3 + 1, 3) || ' ' || ` +
  `substr(${col}, 1, 4) || ', ' || substr(${col}, 12, 5)`

export const MIGRATIONS: Migration[] = [
  {
    version: 2001,
    name: 'entreno: catálogo de ejercicios e importaciones',
    up: `
CREATE TABLE trn_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL ${NOT_BLANK('file_name')},
  file_hash TEXT NOT NULL ${NOT_BLANK('file_hash')},
  imported_at TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('CSV','TSV','XLSX')),
  rows_total INTEGER NOT NULL DEFAULT 0 CHECK (rows_total >= 0),
  workouts_new INTEGER NOT NULL DEFAULT 0 CHECK (workouts_new >= 0),
  workouts_duplicate INTEGER NOT NULL DEFAULT 0 CHECK (workouts_duplicate >= 0),
  workouts_changed INTEGER NOT NULL DEFAULT 0 CHECK (workouts_changed >= 0),
  rows_error INTEGER NOT NULL DEFAULT 0 CHECK (rows_error >= 0),
  exercises_new INTEGER NOT NULL DEFAULT 0 CHECK (exercises_new >= 0)
);
CREATE INDEX trn_imports_hash ON trn_imports(file_hash);

CREATE TABLE trn_muscle_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE ${NOT_BLANK('name')},
  sort_order INTEGER NOT NULL DEFAULT 0,
  ${BOOL('active', 1)}
);

CREATE TABLE trn_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL UNIQUE COLLATE NOCASE ${NOT_BLANK('title')},
  category TEXT CHECK (category IS NULL OR category IN ('STRENGTH','SWIM','HYROX','CARDIO','MOBILITY')),
  measure TEXT NOT NULL DEFAULT 'WEIGHT_REPS'
    CHECK (measure IN ('WEIGHT_REPS','REPS','DURATION','WEIGHT_DURATION','DISTANCE_DURATION','WEIGHT_DISTANCE')),
  ${BOOL('is_bodyweight', 0)},
  ${BOOL('active', 1)},
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE trn_exercise_muscles (
  exercise_id INTEGER NOT NULL REFERENCES trn_exercises(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES trn_muscle_groups(id),
  role TEXT NOT NULL CHECK (role IN ('primary','secondary')),
  PRIMARY KEY (exercise_id, group_id)
);
CREATE UNIQUE INDEX trn_exercise_muscles_one_primary ON trn_exercise_muscles(exercise_id) WHERE role = 'primary';
CREATE INDEX trn_exercise_muscles_group ON trn_exercise_muscles(group_id);

CREATE TABLE trn_exercise_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT NOT NULL UNIQUE COLLATE NOCASE ${NOT_BLANK('alias')},
  exercise_id INTEGER NOT NULL REFERENCES trn_exercises(id) ON DELETE CASCADE
);
CREATE INDEX trn_exercise_aliases_exercise ON trn_exercise_aliases(exercise_id);
`
  },
  {
    version: 2002,
    name: 'entreno: planificación (bloques, rutinas, objetivos y eventos)',
    up: `
CREATE TABLE trn_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL ${NOT_BLANK('name')},
  start_date TEXT NOT NULL ${DATE_CHECK('start_date')},
  end_date TEXT ${NULLABLE_DATE_CHECK('end_date')},
  main_goal TEXT,
  planned_gym INTEGER NOT NULL DEFAULT 4 CHECK (planned_gym >= 0),
  planned_swim INTEGER NOT NULL DEFAULT 2 CHECK (planned_swim >= 0),
  planned_hyrox INTEGER NOT NULL DEFAULT 0 CHECK (planned_hyrox >= 0),
  planned_run INTEGER NOT NULL DEFAULT 0 CHECK (planned_run >= 0),
  planned_other INTEGER NOT NULL DEFAULT 0 CHECK (planned_other >= 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX trn_blocks_start ON trn_blocks(start_date);

CREATE TABLE trn_routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE ${NOT_BLANK('name')},
  kind TEXT NOT NULL DEFAULT 'GYM' CHECK (kind IN ${KINDS}),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  ${BOOL('active', 1)},
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE trn_routine_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id INTEGER NOT NULL REFERENCES trn_routines(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES trn_exercises(id),
  item_order INTEGER NOT NULL CHECK (item_order >= 0),
  target_sets INTEGER CHECK (target_sets IS NULL OR target_sets > 0),
  reps_min INTEGER CHECK (reps_min IS NULL OR reps_min > 0),
  reps_max INTEGER CHECK (reps_max IS NULL OR reps_max > 0),
  target_rpe REAL CHECK (target_rpe IS NULL OR target_rpe BETWEEN 1 AND 10),
  notes TEXT,
  UNIQUE (routine_id, item_order),
  CHECK (reps_min IS NULL OR reps_max IS NULL OR reps_min <= reps_max)
);
CREATE INDEX trn_routine_items_exercise ON trn_routine_items(exercise_id);

CREATE TABLE trn_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL ${NOT_BLANK('name')},
  date TEXT NOT NULL ${DATE_CHECK('date')},
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE trn_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL ${NOT_BLANK('name')},
  type TEXT NOT NULL CHECK (type IN ('E1RM','WEIGHT_REPS','WEEKLY_VOLUME','FREQUENCY','EVENT')),
  target_value REAL,
  target_reps INTEGER CHECK (target_reps IS NULL OR target_reps > 0),
  deadline TEXT ${NULLABLE_DATE_CHECK('deadline')},
  exercise_id INTEGER REFERENCES trn_exercises(id),
  group_id INTEGER REFERENCES trn_muscle_groups(id),
  event_id INTEGER REFERENCES trn_events(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ACHIEVED','ABANDONED')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (type NOT IN ('E1RM','WEIGHT_REPS') OR exercise_id IS NOT NULL),
  CHECK (type <> 'WEIGHT_REPS' OR target_reps IS NOT NULL)
);
CREATE INDEX trn_goals_exercise ON trn_goals(exercise_id);
CREATE INDEX trn_goals_group ON trn_goals(group_id);
`
  },
  {
    version: 2003,
    name: 'entreno: sesiones, series y vista con forma de Hevy',
    up: `
CREATE TABLE trn_workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL ${NOT_BLANK('title')},
  start_time TEXT NOT NULL CHECK (start_time GLOB ${LOCAL_DT}),
  end_time TEXT CHECK (end_time IS NULL OR end_time GLOB ${LOCAL_DT}),
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'GYM' CHECK (kind IN ${KINDS}),
  ${BOOL('kind_manual', 0)},
  block_id INTEGER REFERENCES trn_blocks(id) ON DELETE SET NULL,
  routine_id INTEGER REFERENCES trn_routines(id) ON DELETE SET NULL,
  perceived_effort INTEGER CHECK (perceived_effort IS NULL OR (typeof(perceived_effort) = 'integer' AND perceived_effort BETWEEN 1 AND 10)),
  notes TEXT,
  source TEXT NOT NULL CHECK (source IN ('HEVY','MANUAL')),
  import_id INTEGER REFERENCES trn_imports(id) ON DELETE SET NULL,
  hevy_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_time IS NULL OR end_time >= start_time),
  CHECK ((source = 'HEVY') = (hevy_key IS NOT NULL))
);
CREATE INDEX trn_workouts_start ON trn_workouts(start_time);
CREATE INDEX trn_workouts_block ON trn_workouts(block_id);

CREATE TABLE trn_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES trn_workouts(id) ON DELETE CASCADE,
  exercise_title TEXT NOT NULL ${NOT_BLANK('exercise_title')},
  superset_id TEXT,
  exercise_notes TEXT,
  set_index INTEGER NOT NULL CHECK (typeof(set_index) = 'integer' AND set_index >= 0),
  set_type TEXT NOT NULL DEFAULT 'normal' CHECK (set_type IN ('normal','warmup','dropset','failure')),
  weight_kg REAL ${NUM('weight_kg')},
  reps INTEGER ${INT('reps')} CHECK (reps IS NULL OR reps >= 0),
  distance_km REAL ${NUM('distance_km')} CHECK (distance_km IS NULL OR distance_km >= 0),
  duration_seconds INTEGER ${INT('duration_seconds')} CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  rpe REAL ${NUM('rpe')} CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10),
  exercise_id INTEGER NOT NULL REFERENCES trn_exercises(id),
  exercise_order INTEGER NOT NULL CHECK (typeof(exercise_order) = 'integer' AND exercise_order >= 0),
  notes TEXT,
  UNIQUE (workout_id, exercise_order, set_index)
);
CREATE INDEX trn_sets_exercise ON trn_sets(exercise_id);

CREATE VIEW trn_v_hevy AS
SELECT
  w.title AS title,
  ${HEVY_DATE('w.start_time')} AS start_time,
  ${HEVY_DATE('w.end_time')} AS end_time,
  w.description AS description,
  s.exercise_title AS exercise_title,
  s.superset_id AS superset_id,
  s.exercise_notes AS exercise_notes,
  s.set_index AS set_index,
  s.set_type AS set_type,
  s.weight_kg AS weight_kg,
  s.reps AS reps,
  s.distance_km AS distance_km,
  s.duration_seconds AS duration_seconds,
  s.rpe AS rpe
FROM trn_sets s
JOIN trn_workouts w ON w.id = s.workout_id
ORDER BY w.start_time DESC, w.id DESC, s.exercise_order, s.set_index;
`
  },
  {
    version: 2004,
    name: 'entreno: ajustes y reglas de tipo de sesión',
    up: `
CREATE TABLE trn_settings (
  key TEXT PRIMARY KEY ${NOT_BLANK('key')},
  value TEXT NOT NULL CHECK (json_valid(value))
);

CREATE TABLE trn_kind_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field TEXT NOT NULL CHECK (field IN ('title','exercise')),
  contains TEXT NOT NULL COLLATE NOCASE ${NOT_BLANK('contains')},
  kind TEXT NOT NULL CHECK (kind IN ${KINDS}),
  priority INTEGER NOT NULL DEFAULT 0,
  ${BOOL('active', 1)},
  UNIQUE (field, contains)
);
`
  },
  {
    // Datos iniciales en una migración (y no en `seed`): así se aplican una sola vez por base,
    // también al actualizar una base de finanzas existente y al restaurar una copia de antes de
    // Entreno (restaurar migra la copia, pero no vuelve a sembrar). Si Michael borra un grupo o una
    // regla, no vuelve a aparecer.
    version: 2005,
    name: 'entreno: grupos musculares y reglas de tipo iniciales',
    up: `
INSERT INTO trn_muscle_groups (name, sort_order) VALUES
  ('Pecho', 0), ('Espalda', 1), ('Hombros', 2), ('Bíceps', 3), ('Tríceps', 4), ('Antebrazo', 5),
  ('Cuádriceps', 6), ('Isquiotibiales', 7), ('Glúteos', 8), ('Gemelos', 9), ('Core', 10),
  ('Cuerpo completo', 11);

INSERT INTO trn_kind_rules (field, contains, kind, priority) VALUES
  ('title', 'hyrox', 'HYROX', 110),
  ('title', 'natación', 'SWIM', 100),
  ('title', 'nadar', 'SWIM', 100),
  ('title', 'swim', 'SWIM', 100),
  ('title', 'run', 'RUN', 90),
  ('title', 'correr', 'RUN', 90),
  ('title', 'carrera', 'RUN', 90),
  ('exercise', 'skierg', 'HYROX', 50),
  ('exercise', 'sled', 'HYROX', 50),
  ('exercise', 'wall ball', 'HYROX', 50),
  ('exercise', 'sandbag', 'HYROX', 50),
  ('exercise', 'farmer', 'HYROX', 50),
  ('exercise', 'burpee broad jump', 'HYROX', 50);
`
  }
]
