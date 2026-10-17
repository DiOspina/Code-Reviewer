-- Database initialization script for Agent Reviewer
-- This runs automatically when PostgreSQL container starts

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create custom types
DO $$ BEGIN
    CREATE TYPE analysis_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE finding_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE finding_category AS ENUM ('security', 'performance', 'maintainability', 'style', 'bug', 'duplication', 'antipattern');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Set timezone
SET timezone = 'America/Bogota';

-- Create indexes for better performance (will be created by Alembic/SQLAlchemy)
-- This script mainly ensures extensions are available

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE agent_reviewer TO agent_reviewer;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO agent_reviewer;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO agent_reviewer;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO agent_reviewer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO agent_reviewer;