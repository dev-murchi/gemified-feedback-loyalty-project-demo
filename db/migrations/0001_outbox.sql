-- Transactional outbox (ADR-005, SDD 6.1 OUTBOX): written in the same transaction as the change
-- that produced the event, claimed and marked by the outbox relay.
CREATE TABLE outbox (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL,
  published_at timestamptz,
  -- The lease of the relay that claimed the record: other relays skip it until this time. A relay
  -- that dies leaves its records to be claimed again once the lease has ended.
  claimed_until timestamptz
);

-- The relay claims unpublished records oldest first (SDD 6.1 index table); the lease is checked on
-- the rows this index returns.
CREATE INDEX outbox_unpublished_idx ON outbox (created_at, id)
  WHERE published_at IS NULL;
