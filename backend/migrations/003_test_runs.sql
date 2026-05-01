-- Migration 003: test_runs table
-- Tracks pytest run history for the admin test-runner UI.
-- This table is also created automatically by ensure_schema() on server startup.
-- Run this manually if you need the table before the first restart.

CREATE TABLE IF NOT EXISTS auth.test_runs (
    id              SERIAL PRIMARY KEY,
    run_uuid        UUID         NOT NULL,
    triggered_by    INT          REFERENCES auth.users(id) ON DELETE SET NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'queued',   -- queued | running | succeeded | failed
    suite           VARCHAR(100) NOT NULL DEFAULT 'all',
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    duration_s      DOUBLE PRECISION,
    total_tests     INT,
    passed          INT,
    failed          INT,
    skipped         INT,
    summary         TEXT,         -- e.g. "2 failed, 40 passed in 30.5s"
    error_message   TEXT,         -- set if run itself errored (not test failures)
    output_path     TEXT,         -- absolute path to test_artifacts/{uuid}/output.txt
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS test_runs_uuid_idx
    ON auth.test_runs (run_uuid);

CREATE INDEX IF NOT EXISTS test_runs_created_idx
    ON auth.test_runs (created_at DESC);
