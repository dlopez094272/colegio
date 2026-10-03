const FormacionAcademicaModel = require('../models/formacionAcademicaModel');
const { registrarBitacora }   = require('../utils/bitacora');

function leerFormacion(body) {
  return String(body.formacion ?? '').trim().replace(/\s+/g, ' ');
}

const formacionAcademicaController = {
  // GET /api/formaciones-academicas?todos=1
  async getAll(req, res, next) {
    try {
      const data = await FormacionAcademicaModel.getAll({ incluirInactivos: req.query.todos === '1' });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const formacion = leerFormacion(req.body);
      if (!formacion) return res.status(400).json({ message: 'La formación académica es requerida' });
      if (formacion.length > 150) return res.status(400).json({ message: 'La formación académica excede 150 caracteres' });
      if (await FormacionAcademicaModel.nombreExiste(formacion))
        return res.status(409).json({ message: `La formación "${formacion}" ya existe` });

      const activo = req.body.activo === undefined ? 1 : (req.body.activo ? 1 : 0);
      const id = await FormacionAcademicaModel.create({ formacion, activo });
      await registrarBitacora({ tabla: 'formaciones_academicas', idregistro: id, accion: 'CREAR', descripcion: `Formación académica creada: ${formacion}`, valoresDespues: { formacion, activo }, req });
      res.status(201).json({ success: true, id, data: { idformaciones_academicas: id, formacion, activo } });
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const formacion = leerFormacion(req.body);
      if (!formacion) return res.status(400).json({ message: 'La formación académica es requerida' });
      if (formacion.length > 150) return res.status(400).json({ message: 'La formación académica excede 150 caracteres' });
      const antes = await FormacionAcademicaModel.findById(id);
      if (!antes) return res.status(404).json({ message: 'Registro no encontrado' });
      if (await FormacionAcademicaModel.nombreExiste(formacion, id))
        return res.status(409).json({ message: `La formación "${formacion}" ya existe` });

      const activo = req.body.activo === undefined ? antes.activo : (req.body.activo ? 1 : 0);
      await FormacionAcademicaModel.update(id, { formacion, activo });
      await registrarBitacora({ tabla: 'formaciones_academicas', idregistro: Number(id), accion: 'MODIFICAR', descripcion: `Formación académica modificada: ${formacion}`, valoresAntes: antes, valoresDespues: { idformaciones_academicas: Number(id), formacion, activo }, req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const antes = await FormacionAcademicaModel.findById(id);
      if (!antes) return res.status(404).json({ message: 'Registro no encontrado' });
      if (await FormacionAcademicaModel.enUso(id))
        return res.status(409).json({ message: 'No se puede eliminar: hay docentes con esta formación. Puede inactivarla en su lugar.' });

      await FormacionAcademicaModel.delete(id);
      await registrarBitacora({ tabla: 'formaciones_academicas', idregistro: Number(id), accion: 'ELIMINAR', descripcion: `Formación académica eliminada: ${antes.formacion}`, valoresAntes: antes, req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};

module.exports = formacionAcademicaController;
