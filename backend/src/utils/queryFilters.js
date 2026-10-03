// Utilidades genéricas para "filtros avanzados + ordenamiento" sobre listados
// paginados. Usado por ventas, compras, inventario (entradas/salidas/traslados),
// productos, asociados (clientes/proveedores) y caja.
//
// fieldDefs: whitelist de campos filtrables, ej:
//   { nit: { column: 'v.nit', type: 'text' },
//     anulado: { column: 'v.anulado', type: 'exact', coalesce: true },
//     total: { column: 'v.total', type: 'number' },
//     fecha: { column: 'v.fecha', type: 'date' } }
//
// type: 'text' (LIKE), 'exact' (=), 'number'/'date' (rango `${key}_desde`/`${key}_hasta`),
//       'sql' (condición libre en `sql` con un único `?`, ej. un EXISTS sobre una tabla N:M)

function buildFiltrosCondiciones(filtros, fieldDefs, conditions, params) {
  for (const [key, def] of Object.entries(fieldDefs)) {
    if (def.type === 'sql') {
      const value = filtros[key];
      if (value === undefined || value === null || value === '') continue;
      conditions.push(def.sql);
      params.push(value);
    } else if (def.type === 'in') {
      const value = filtros[key];
      if (value === undefined || value === null || value === '') continue;
      const vals = String(value).split(',').map(v => v.trim()).filter(Boolean);
      if (!vals.length) continue;
      conditions.push(`${def.column} IN (${vals.map(() => '?').join(',')})`);
      params.push(...vals);
    } else if (def.type === 'text' || def.type === 'exact') {
      const value = filtros[key];
      if (value === undefined || value === null || value === '') continue;
      if (def.type === 'text') {
        conditions.push(`${def.column} LIKE ?`);
        params.push(`%${value}%`);
      } else if (def.coalesce) {
        conditions.push(`COALESCE(${def.column}, 0) = ?`);
        params.push(Number(value));
      } else {
        conditions.push(`${def.column} = ?`);
        params.push(value);
      }
    } else {
      // number | date → rango _desde / _hasta
      const desde = filtros[`${key}_desde`];
      const hasta = filtros[`${key}_hasta`];
      const col = def.type === 'date' ? `DATE(${def.column})` : def.column;
      if (desde !== undefined && desde !== null && desde !== '') {
        conditions.push(`${col} >= ?`);
        params.push(desde);
      }
      if (hasta !== undefined && hasta !== null && hasta !== '') {
        conditions.push(`${col} <= ?`);
        params.push(hasta);
      }
    }
  }
}

// sortFields: whitelist { claveOrden: 'columna o alias SQL' }
// defaultColumn: columna usada cuando no hay sortField o no está en el whitelist
// defaultDir: dirección usada cuando no se especifica sortField (ej. 'DESC' para
// listados por ID más reciente primero, 'ASC' para listados alfabéticos)
function buildOrderBy(sortField, sortDir, sortFields, defaultColumn, defaultDir = 'DESC') {
  const usaDefault = !sortFields[sortField];
  const orderColumn = sortFields[sortField] || defaultColumn;
  const orderDir     = usaDefault ? defaultDir : (String(sortDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC');
  const tiebreak      = orderColumn !== defaultColumn ? `, ${defaultColumn} ${defaultDir}` : '';
  return `ORDER BY ${orderColumn} ${orderDir}${tiebreak}`;
}

// Condición de búsqueda "por palabras" para campos de texto libre (ej.
// descripción de productos): exige que cada palabra del término buscado
// aparezca en la columna, sin importar el orden ni palabras intermedias.
// Así "CANASTA FTP" encuentra "CANASTA CGL FTP" (con LIKE simple no matchea,
// porque exige que "CANASTA FTP" sea subcadena exacta y contigua).
function buildWordsLikeCondition(column, search) {
  const words = String(search || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return {
    sql: `(${words.map(() => `${column} LIKE ?`).join(' AND ')})`,
    params: words.map(w => `%${w}%`),
  };
}

module.exports = { buildFiltrosCondiciones, buildOrderBy, buildWordsLikeCondition };
