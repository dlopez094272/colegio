const CategoriaArchivoModel = require('../models/categoriaArchivoModel');
const { registrarBitacora }  = require('../utils/bitacora');

const categoriaArchivoController = {
  // GET /api/categorias-archivos?todos=1
  async getAll(req, res, next) {
    try {
      const data = await CategoriaArchivoModel.getAll({ incluirInactivos: req.query.todos === '1' });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const categoria = req.body.categoria?.trim();
      if (!categoria) return res.status(400).json({ message: 'La categoría es requerida' });
      if (await CategoriaArchivoModel.nombreExiste(categoria))
        return res.status(409).json({ message: `La categoría "${categoria}" ya existe` });

      const activo = req.body.activo === undefined ? 1 : (req.body.activo ? 1 : 0);
      const id = await CategoriaArchivoModel.create({ categoria, activo });
      await registrarBitacora({ tabla: 'categorias_archivos', idregistro: id, accion: 'CREAR', descripcion: `Categoría de archivo creada: ${categoria}`, valoresDespues: { categoria, activo }, req });
      res.status(201).json({ success: true, id });
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const categoria = req.body.categoria?.trim();
      if (!categoria) return res.status(400).json({ message: 'La categoría es requerida' });
      const antes = await CategoriaArchivoModel.findById(id);
      if (!antes) return res.status(404).json({ message: 'Registro no encontrado' });
      if (await CategoriaArchivoModel.nombreExiste(categoria, id))
        return res.status(409).json({ message: `La categoría "${categoria}" ya existe` });

      const activo = req.body.activo === undefined ? antes.activo : (req.body.activo ? 1 : 0);
      await CategoriaArchivoModel.update(id, { categoria, activo });
      await registrarBitacora({ tabla: 'categorias_archivos', idregistro: Number(id), accion: 'MODIFICAR', descripcion: `Categoría de archivo modificada: ${categoria}`, valoresAntes: antes, valoresDespues: { idcategorias_archivos: Number(id), categoria, activo }, req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const antes = await CategoriaArchivoModel.findById(id);
      if (!antes) return res.status(404).json({ message: 'Registro no encontrado' });
      if (await CategoriaArchivoModel.enUso(id))
        return res.status(409).json({ message: 'No se puede eliminar: hay archivos de estudiantes en esta categoría. Puede inactivarla en su lugar.' });

      await CategoriaArchivoModel.delete(id);
      await registrarBitacora({ tabla: 'categorias_archivos', idregistro: Number(id), accion: 'ELIMINAR', descripcion: `Categoría de archivo eliminada: ${antes.categoria}`, valoresAntes: antes, req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};

module.exports = categoriaArchivoController;
