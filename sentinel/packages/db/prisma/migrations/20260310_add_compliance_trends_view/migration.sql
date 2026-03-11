-- Materialized view for pre-aggregated compliance trends (30/60/90 day windows)
CREATE MATERIALIZED VIEW IF NOT EXISTS compliance_trends AS
SELECT
  s.org_id,
  s.framework_id,
  -- 30-day window
  AVG(CASE WHEN s.date >= CURRENT_DATE - INTERVAL '30 days' THEN s.score END) AS avg_score_30d,
  MIN(CASE WHEN s.date >= CURRENT_DATE - INTERVAL '30 days' THEN s.score END) AS min_score_30d,
  MAX(CASE WHEN s.date >= CURRENT_DATE - INTERVAL '30 days' THEN s.score END) AS max_score_30d,
  COUNT(CASE WHEN s.date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) AS sample_count_30d,
  -- 60-day window
  AVG(CASE WHEN s.date >= CURRENT_DATE - INTERVAL '60 days' THEN s.score END) AS avg_score_60d,
  MIN(CASE WHEN s.date >= CURRENT_DATE - INTERVAL '60 days' THEN s.score END) AS min_score_60d,
  MAX(CASE WHEN s.date >= CURRENT_DATE - INTERVAL '60 days' THEN s.score END) AS max_score_60d,
  COUNT(CASE WHEN s.date >= CURRENT_DATE - INTERVAL '60 days' THEN 1 END) AS sample_count_60d,
  -- 90-day window
  AVG(s.score) AS avg_score_90d,
  MIN(s.score) AS min_score_90d,
  MAX(s.score) AS max_score_90d,
  COUNT(*) AS sample_count_90d
FROM compliance_snapshots s
WHERE s.date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY s.org_id, s.framework_id;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS compliance_trends_org_framework_idx
  ON compliance_trends (org_id, framework_id);
