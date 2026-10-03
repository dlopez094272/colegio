const BitacoraModel = require('../models/bitacoraModel');

const bitacoraController = {

  // GET /api/bitacora?tabla=&idregistro=&page=&pageSize=
  async getByRegistro(req, res, next) {
    try {
      const { tabla, idregistro, page, pageSize } = req.query;
      if (!tabla || !idregistro)
        return res.status(400).json({ success: false, message: 'Parámetros tabla e idregistro requeridos' });

      const result = await BitacoraModel.getByRegistro(tabla, Number(idregistro), { page, pageSize });
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  },

  // GET /api/bitacora/all
  async getAll(req, res, next) {
    try {
      const { tabla, accion, idusuarios, fecha_desde, fecha_hasta, search, page, pageSize } = req.query;
      const result = await BitacoraModel.getAll({ tabla, accion, idusuarios, fecha_desde, fecha_hasta, search, page, pageSize });
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  },
};

module.exports = bitacoraController;
