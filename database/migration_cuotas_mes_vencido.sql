-- =====================================================================
--  Cuotas mensuales "mes vencido": el cobro de un mes vence el día
--  límite del mes siguiente (Enero, día 5 → vence el 05 de febrero).
--  Los cargos ya generados en inscripciones no cambian (son copia).
-- =====================================================================
USE colegio;

ALTER TABLE cuotas_ciclos
  ADD COLUMN mes_vencido TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Mensual: 1 = cada cobro vence el dia_limite del mes siguiente'
    AFTER dia_limite;
