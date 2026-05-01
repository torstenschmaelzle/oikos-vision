-- Migration 004: crawler.building_classifications table
-- Stores per-building classification results written by the crawler.

CREATE SCHEMA IF NOT EXISTS crawler;

CREATE TABLE IF NOT EXISTS crawler.building_classifications (
    bdg_egid                BIGINT          PRIMARY KEY,
    stn_label               TEXT,
    adr_number              TEXT,
    zip_label               TEXT,
    com_name                TEXT,
    com_canton              VARCHAR(2),
    adr_easting             DOUBLE PRECISION,
    adr_northing            DOUBLE PRECISION,
    gwr_bdg_category        TEXT,
    gwr_bdg_name            TEXT,
    main_category           TEXT,
    sub_category            TEXT,
    is_commercial           BOOLEAN         NOT NULL DEFAULT FALSE,
    is_public               BOOLEAN         NOT NULL DEFAULT FALSE,
    is_mixed_use            BOOLEAN         NOT NULL DEFAULT FALSE,
    confidence_score        DOUBLE PRECISION,
    classification_source   TEXT,
    source_details          JSONB           NOT NULL DEFAULT '{}',
    matched_keywords        JSONB           NOT NULL DEFAULT '[]',
    crawl_status            TEXT            NOT NULL DEFAULT 'done',
    error_message           TEXT,
    crawled_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bldg_class_canton_idx
    ON crawler.building_classifications (com_canton);

CREATE INDEX IF NOT EXISTS bldg_class_status_idx
    ON crawler.building_classifications (crawl_status);
