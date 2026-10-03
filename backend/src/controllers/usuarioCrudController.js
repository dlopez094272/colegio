const UsuarioCrudModel      = require('../models/usuarioCrudModel');
const SeguridadModel        = require('../models/seguridadModel');
const { registrarBitacora } = require('../utils/bitacora');

const usuarioCrudController = {
  async getAll(req, res, next) {
    try {
      const { page, pageSize, search, sortField, sortDir, ...filters } = req.query;
      const [paginado, memberships] = await Promise.all([
        UsuarioCrudModel.getAll({ page, pageSize, search, sortField, sortDir, ...filters }),
        SeguridadModel.getAllMemberships(),
      ]);
      const grupos = memberships.reduce((acc, m) => {
        if (!acc[m.UserName]) acc[m.UserName] = [];
        acc[m.UserName].push({ GroupID: m.GroupID, Label: m.Label });
        return acc;
      }, {});
      const data = paginado.data.map(u => ({ ...u, grupos: grupos[u.codigo] || [] }));
      res.json({ success: true, data, meta: paginado.meta });
    } catch (err) { next(err); }
  },

  async getById(req, res, next) {
    try {
      const usuario = await UsuarioCrudModel.findById(req.params.id);
      if (!usuario) return res.status(404).json({ message: 'No encontrado' });
      const grupos = await SeguridadModel.getMembersByUser(usuario.codigo);
      res.json({ success: true, data: { ...usuario, grupos } });
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const { codigo, password, grupos = [], ...rest } = req.body;
      if (!codigo?.trim() || !password)
        return res.status(400).json({ message: 'Código y contraseña son requeridos' });
      if (password.length < 4)
        return res.status(400).json({ message: 'La contraseña debe tener al menos 4 caracteres' });
      if (await UsuarioCrudModel.codigoExiste(codigo.trim()))
        return res.status(409).json({ message: `El código "${codigo}" ya está en uso` });

      const id = await UsuarioCrudModel.create({ codigo: codigo.trim(), password, ...rest });
      if (grupos.length) await SeguridadModel.setUserGroups(codigo.trim(), grupos);
      const nuevoUsuario = await UsuarioCrudModel.findById(id);
      await registrarBitacora({ tabla: 'usuarios', idregistro: id, accion: 'CREAR', descripcion: `Usuario creado: ${codigo}`, valoresDespues: nuevoUsuario, req });
      res.status(201).json({ success: true, id, data: nuevoUsuario });
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { password, grupos, ...rest } = req.body;

      const antes = await UsuarioCrudModel.findById(id);
      if (!antes) return res.status(404).json({ message: 'No encontrado' });
      if (rest.codigo && await UsuarioCrudModel.codigoExiste(rest.codigo, id))
        return res.status(409).json({ message: `El código "${rest.codigo}" ya está en uso` });

      await UsuarioCrudModel.update(id, rest);
      if (password && password.trim()) await UsuarioCrudModel.changePassword(id, password);
      if (grupos !== undefined) await SeguridadModel.setUserGroups(rest.codigo || antes.codigo, grupos);
      const despues = await UsuarioCrudModel.findById(id);
      await registrarBitacora({ tabla: 'usuarios', idregistro: Number(id), accion: 'MODIFICAR', descripcion: `Usuario modificado: ${despues.codigo}`, valoresAntes: antes, valoresDespues: despues, req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  async toggleActive(req, res, next) {
    try {
      const u = await UsuarioCrudModel.findById(req.params.id);
      if (!u) return res.status(404).json({ message: 'No encontrado' });
      const nuevoActivo = u.activo ? 0 : 1;
      await UsuarioCrudModel.update(req.params.id, { ...u, activo: nuevoActivo });
      await registrarBitacora({ tabla: 'usuarios', idregistro: Number(req.params.id), accion: nuevoActivo ? 'ACTIVAR' : 'INACTIVAR', descripcion: `Usuario ${nuevoActivo ? 'activado' : 'inactivado'}: ${u.codigo}`, valoresAntes: { activo: u.activo }, valoresDespues: { activo: nuevoActivo }, req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  async changePassword(req, res, next) {
    try {
      const { password } = req.body;
      if (!password || password.length < 4)
        return res.status(400).json({ message: 'La contraseña debe tener al menos 4 caracteres' });
      await UsuarioCrudModel.changePassword(req.params.id, password);
      await registrarBitacora({ tabla: 'usuarios', idregistro: Number(req.params.id), accion: 'MODIFICAR', descripcion: 'Contraseña restablecida por administrador', req });
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};

module.exports = usuarioCrudController;
