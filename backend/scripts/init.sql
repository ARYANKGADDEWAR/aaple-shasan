-- AAPLE SHASAN — PostgreSQL Schema v1.0
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TYPE user_role AS ENUM ('citizen', 'admin', 'superadmin', 'auditor');
CREATE TYPE dept_type AS ENUM ('PWD', 'NMC', 'GramPanchayat', 'RevenueDeskTahsildar', 'SDMDesk');
CREATE TYPE proposal_status AS ENUM ('pending_review', 'ai_routed', 'dossier_compiled', 'under_admin_review', 'revision_requested', 'sanctioned', 'rejected', 'archived');
CREATE TYPE vote_type AS ENUM ('upvote', 'downvote');
CREATE TYPE otp_purpose AS ENUM ('login', 'register', 'aadhaar_verify', 'password_reset', 'dbt_confirm');
CREATE TYPE notification_type AS ENUM ('proposal_update', 'vote_milestone', 'dbt_credit', 'system', 'sanction');
CREATE TYPE dbt_status AS ENUM ('pending', 'processing', 'credited', 'failed', 'refunded');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(15) NOT NULL UNIQUE,
  phone_verified BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  role user_role NOT NULL DEFAULT 'citizen',
  dept dept_type,
  department_designation VARCHAR(200),
  aadhaar_hash VARCHAR(64) UNIQUE,
  aadhaar_verified BOOLEAN DEFAULT FALSE,
  aadhaar_verified_at TIMESTAMPTZ,
  ward_constituency VARCHAR(200),
  district VARCHAR(100),
  taluka VARCHAR(100),
  pincode VARCHAR(10),
  profile_photo_url TEXT,
  password_hash TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_locked BOOLEAN DEFAULT FALSE,
  failed_login_attempts INT DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,
  civic_royalty_balance NUMERIC(12,2) DEFAULT 0.00,
  total_royalties_earned NUMERIC(12,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref_number VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  region VARCHAR(300) NOT NULL,
  ward VARCHAR(200),
  district VARCHAR(100),
  taluka VARCHAR(100),
  pincode VARCHAR(10),
  detected_dept dept_type,
  ai_confidence NUMERIC(5,2),
  ai_classification_raw JSONB,
  ai_dossier_text TEXT,
  ai_budget_estimate NUMERIC(14,2),
  ai_processed_at TIMESTAMPTZ,
  submitted_by UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  upvote_count INT DEFAULT 0,
  downvote_count INT DEFAULT 0,
  vote_threshold INT DEFAULT 50,
  threshold_met BOOLEAN DEFAULT FALSE,
  threshold_met_at TIMESTAMPTZ,
  assigned_dept dept_type,
  assigned_admin UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ,
  status proposal_status DEFAULT 'pending_review',
  status_updated_at TIMESTAMPTZ DEFAULT NOW(),
  sanctioned_by UUID REFERENCES users(id),
  sanctioned_at TIMESTAMPTZ,
  sanction_note TEXT,
  project_code VARCHAR(100),
  rejected_by UUID REFERENCES users(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  attachment_urls JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  vote vote_type NOT NULL,
  critique_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, user_id)
);

CREATE TABLE otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(15),
  email VARCHAR(255),
  otp_hash VARCHAR(64) NOT NULL,
  purpose otp_purpose NOT NULL,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  device_info JSONB,
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dbt_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  proposal_id UUID REFERENCES proposals(id),
  amount NUMERIC(12,2) NOT NULL,
  transaction_ref VARCHAR(100) UNIQUE,
  pfms_ref VARCHAR(100),
  status dbt_status DEFAULT 'pending',
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  credited_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES users(id),
  proposal_id UUID NOT NULL REFERENCES proposals(id),
  action VARCHAR(100) NOT NULL,
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  type notification_type NOT NULL,
  title VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(200) NOT NULL,
  resource VARCHAR(100),
  resource_id UUID,
  ip_address INET,
  user_agent TEXT,
  request_data JSONB,
  response_code INT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE system_config (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposals_dept ON proposals(assigned_dept);
CREATE INDEX idx_proposals_submitted_by ON proposals(submitted_by);
CREATE INDEX idx_proposals_threshold ON proposals(threshold_met, status);
CREATE INDEX idx_proposals_created ON proposals(created_at DESC);
CREATE INDEX idx_proposals_search ON proposals USING gin(to_tsvector('english', title || ' ' || description));
CREATE INDEX idx_votes_proposal ON votes(proposal_id);
CREATE INDEX idx_votes_user ON votes(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id, revoked);
CREATE INDEX idx_otps_phone ON otps(phone, purpose, used);
CREATE INDEX idx_dbt_user ON dbt_transactions(user_id);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);

-- Vote count trigger
CREATE OR REPLACE FUNCTION update_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE proposals SET
    upvote_count = (SELECT COUNT(*) FROM votes WHERE proposal_id = COALESCE(NEW.proposal_id, OLD.proposal_id) AND vote = 'upvote'),
    downvote_count = (SELECT COUNT(*) FROM votes WHERE proposal_id = COALESCE(NEW.proposal_id, OLD.proposal_id) AND vote = 'downvote'),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.proposal_id, OLD.proposal_id);
  UPDATE proposals SET
    threshold_met = TRUE,
    threshold_met_at = NOW(),
    status = CASE WHEN status = 'ai_routed' THEN 'dossier_compiled' ELSE status END
  WHERE id = COALESCE(NEW.proposal_id, OLD.proposal_id)
    AND upvote_count >= vote_threshold AND threshold_met = FALSE;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vote_counts
AFTER INSERT OR UPDATE OR DELETE ON votes
FOR EACH ROW EXECUTE FUNCTION update_vote_counts();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_proposals_updated BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_votes_updated BEFORE UPDATE ON votes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed
INSERT INTO system_config (key, value) VALUES
  ('vote_threshold', '50'),
  ('civic_royalty_amount', '1000'),
  ('max_proposals_per_user_per_day', '3'),
  ('ai_confidence_threshold', '75'),
  ('maintenance_mode', 'false'),
  ('dbt_enabled', 'true');

INSERT INTO users (full_name, email, phone, phone_verified, email_verified, role, is_active, password_hash)
VALUES ('System Administrator', 'admin@aapleshasan.gov.in', '9000000000', TRUE, TRUE, 'superadmin', TRUE,
  crypt('Admin@123', gen_salt('bf', 12)));

-- Rate limit log table (referenced in security middleware)
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id BIGSERIAL PRIMARY KEY,
  ip_address INET NOT NULL,
  endpoint VARCHAR(200),
  triggered_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit_log(ip_address, triggered_at DESC);

-- Additional seed proposals for demo
INSERT INTO users (full_name, email, phone, phone_verified, email_verified, role, dept,
                   department_designation, is_active, aadhaar_verified, password_hash)
VALUES
  ('Commissioner Mahesh Patil', 'pwd.admin@aapleshasan.gov.in', '9000000001',
   TRUE, TRUE, 'admin', 'PWD', 'Executive Engineer', TRUE, TRUE,
   crypt('Admin@123', gen_salt('bf', 12))),
  ('Officer Sunita Deshmukh', 'nmc.admin@aapleshasan.gov.in', '9000000002',
   TRUE, TRUE, 'admin', 'NMC', 'Municipal Commissioner', TRUE, TRUE,
   crypt('Admin@123', gen_salt('bf', 12))),
  ('Rahul Deshpande', 'rahul@gmail.com', '9876543210',
   TRUE, TRUE, 'citizen', NULL, NULL, TRUE, TRUE,
   crypt('Test@123', gen_salt('bf', 12)));

-- Seed demo proposals
WITH citizen AS (SELECT id FROM users WHERE phone = '9876543210' LIMIT 1)
INSERT INTO proposals
  (ref_number, title, description, region, ward, district, detected_dept, assigned_dept,
   ai_confidence, submitted_by, upvote_count, downvote_count, threshold_met, threshold_met_at, status)
SELECT
  'MH/NMC/2025-26/00001',
  'Restoration of Blocked Stormwater Drainage Network — Dharampeth Ward',
  'The stormwater drainage lines in Dharampeth Ward 7 have been completely blocked due to years of uncleared debris and encroachment. During the last monsoon season, water logging persisted for over 96 hours causing significant property damage. I propose an immediate de-silting drive followed by concrete lining of 2.3 km of the main drainage canal.',
  'Ward 7, Dharampeth, Nagpur',
  'Ward 7',
  'Nagpur',
  'NMC',
  'NMC',
  91.5,
  id,
  73,
  8,
  TRUE,
  NOW() - INTERVAL '2 days',
  'dossier_compiled'
FROM citizen;

WITH citizen AS (SELECT id FROM users WHERE phone = '9876543210' LIMIT 1)
INSERT INTO proposals
  (ref_number, title, description, region, ward, district, detected_dept, assigned_dept,
   ai_confidence, submitted_by, upvote_count, downvote_count, threshold_met, threshold_met_at, status)
SELECT
  'MH/GP/2025-26/00002',
  'Solar-Powered Drip Irrigation Pilot — Waifad Village Agricultural Land',
  'Approximately 240 acres of agricultural land in Waifad village rely on monsoon-dependent rain-fed farming. Groundwater levels have dropped by 18 feet over the last decade. I propose a Gram Panchayat-administered solar drip irrigation network covering 120 acres in Phase 1, reducing water consumption by 40%.',
  'Waifad Village, Narkhed Taluka',
  NULL,
  'Nagpur',
  'GramPanchayat',
  'GramPanchayat',
  88.2,
  id,
  58,
  4,
  TRUE,
  NOW() - INTERVAL '1 day',
  'dossier_compiled'
FROM citizen;
