-- Update existing CalendarLock records: old status 1 (BOOKED) → new status 2 (BOOKED)
-- New mapping: 0=LOCKED, 1=HOLD (new), 2=BOOKED (was 1)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'calendar_locks') THEN
    UPDATE "calendar_locks" SET "status" = 2 WHERE "status" = 1;
  END IF;
END $$;
