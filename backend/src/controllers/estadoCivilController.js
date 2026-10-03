const EstadoCivilModel      = require('../models/estadoCivilModel');
const { registrarBitacora } = require('../utils/bitacora');

const estadoCivilController = {
  // GET /api/estados-civiles?todos=1
  async getAll(req, res, next) {
    try {
      const data = await EstadoCivilModel.getAll({ incluirInactivos: req.query.todos === '1' });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const estado_civil = req.body.estado_civil?.trim();
      if (!estado_civil) return res.status(400).json({ message: 'El estado civil es requerido' });
      if (await EstadoCivilModel.nombreExiste(estado_civil))
        return res.status(409).json({ message: `El estado civil "${estado_civil}" ya existe` });

      const activo = req.body.activo === undefined ? 1 : (req.body.activo ? 1 : 0);
      const id = await EstadoCivilModel.create({ estado_civil, activo });
      await registrarBitacora({ tabla: 'estados_civiles', idregistro: id, accion: 'CREAR', descripcion: `Estado civil creado: ${estado_civil}`, valoresDespues: { estado_civil, activo }, req });
      res.status(201).json({ success: true, id });
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const estado_civil = req.body.estado_civil?.trim();
      if (!estado_civil) return res.status(400).json({ message: 'El estado civil es requerido' });
      const antes = await EstadoCivilModel.findById(id);
      if (!antes) return res.status(404).json({ message: 'Registro no encontrado' });
      if (await EstadoCivilModel.nombreExiste(estado_civil, id))
        return res.status(409).json({ message: `El estado civil "${estado_civil}" ya existe` });

      const activo = req.body.activo === undefined ? antes.activo : (req.body.activo ? 1 : 0);
      await EstadoCivilModel.update(id, { estado_civil, activo });
      await registrarBitacora({ tabla: 'estados_civiles', idregistro: Number(id), accion: 'MODIFICAR', descripcion: `Estado civil modificado: ${estado_civil}`, valoresAntes: antes, valoresDespues: { idestados_civiles: Number(id), estado_civil, activo }, req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const antes = await EstadoCivilModel.findById(id);
      if (!antes) return res.status(404).json({ message: 'Registro no encontrado' });
      if (await EstadoCivilModel.enUso(id))
        return res.status(409).json({ message: 'No se puede eliminar: hay padres de familia o docentes con este estado civil. Puede inactivarlo en su lugar.' });

      await EstadoCivilModel.delete(id);
      await registrarBitacora({ tabla: 'estados_civiles', idregistro: Number(id), accion: 'ELIMINAR', descripcion: `Estado civil eliminado: ${antes.estado_civil}`, valoresAntes: antes, req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};

module.exports = estadoCivilController;
