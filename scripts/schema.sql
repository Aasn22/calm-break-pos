CREATE TABLE IF NOT EXISTS cb_users (
 id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,
 role text NOT NULL CHECK (role IN ('customer','staff','operator','manager')),
 allergies text NOT NULL DEFAULT '', password_hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS cb_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES cb_users(id) ON DELETE CASCADE,
 surface text NOT NULL CHECK (surface IN ('customer','operations')), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS cb_login_attempts (email text PRIMARY KEY, attempts integer NOT NULL, reset_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS cb_products (
 id uuid PRIMARY KEY, name text NOT NULL, category text NOT NULL CHECK (category IN ('Café','Shop')),
 price integer NOT NULL CHECK (price > 0), minutes integer NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
 escalation_minutes integer NOT NULL CHECK (escalation_minutes BETWEEN 1 AND 1440), active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS cb_orders (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES cb_users(id), created_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL, version integer NOT NULL DEFAULT 1, request_key uuid NOT NULL, UNIQUE(user_id, request_key)
);
CREATE INDEX IF NOT EXISTS cb_orders_user ON cb_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cb_sessions_expiry ON cb_sessions(expires_at);
INSERT INTO cb_products(id,name,category,price,minutes,escalation_minutes) VALUES
 ('00000000-0000-4000-8000-000000000001','Cappuccino','Café',450,8,5),
 ('00000000-0000-4000-8000-000000000002','Iced matcha','Café',525,8,5),
 ('00000000-0000-4000-8000-000000000003','Avocado toast','Café',875,20,5),
 ('00000000-0000-4000-8000-000000000004','Blueberry muffin','Café',350,5,5),
 ('00000000-0000-4000-8000-000000000005','Chicken wrap','Café',925,20,5),
 ('00000000-0000-4000-8000-000000000006','Sparkling water','Shop',225,3,5),
 ('00000000-0000-4000-8000-000000000007','Phone cable','Shop',850,3,5),
 ('00000000-0000-4000-8000-000000000008','Green glow juice','Café',600,10,5)
ON CONFLICT (id) DO NOTHING;
