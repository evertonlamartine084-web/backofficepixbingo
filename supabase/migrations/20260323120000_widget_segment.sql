-- Add widget_segment_id to platform_config to restrict which players see the widget
ALTER TABLE platform_config
  ADD COLUMN IF NOT EXISTS widget_segment_id UUID REFERENCES segments(id) ON DELETE SET NULL;
