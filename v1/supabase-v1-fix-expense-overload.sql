-- =====================================================================
-- Fix: «طرح المصروفات من الخزنة مش شغال»
-- ---------------------------------------------------------------------
-- supabase-v1-finance-source-edit.sql added a 5-arg add_company_expense_v1
-- (with p_paid_from) via CREATE OR REPLACE — but that created a NEW
-- overload and left the old 4-arg add_company_expense_v1(date,text,numeric,text)
-- in place. PostgREST then routed the client's call to the old function,
-- which ignores paid_from, so every expense saved as 'external' and never
-- booked a treasury 'out' (the safe balance never moved).
--
-- Dropping the stale 4-arg overload leaves only the paid_from-aware version.
-- A stale client that still sends 4 args keeps working (p_paid_from defaults
-- to 'external'); the current client sends p_paid_from='treasury' and the
-- confirmed expense now reduces the safe balance. Applied live 2026-07-20.
-- =====================================================================

drop function if exists add_company_expense_v1(date, text, numeric, text);
