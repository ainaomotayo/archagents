-- Convert wrapped_dek from TEXT to BYTEA
ALTER TABLE encryption_keys
  ALTER COLUMN wrapped_dek TYPE BYTEA
  USING decode(wrapped_dek, 'base64');
