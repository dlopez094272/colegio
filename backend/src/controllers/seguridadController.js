const SeguridadModel = require('../models/seguridadModel');
const UsuarioCrudModel = require('../models/usuarioCrudModel');

// Tablas del sistema incluidas en el módulo de permisos: debe reflejar
// exactamente los módulos que usan checkPermiso (backend) o permisos.tiene
// (frontend) en el código actual. No agregar nombres "por si acaso".
const SYSTEM_TABLES = [
  'usuarios',
  'padres', 'estudiantes', 'docentes',
  'estructura_academica', 'inscripciones', 'cuotas', 'pagos',
  'estados_civiles', 'categorias_archivos', 'formaciones_academicas',
  'bitacora',
];

const seguridadController = {
  // ─── Grupos ───────────────────────────────────────────────
  async getGroups(req, res, next) {
    try {
      const groups = await SeguridadModel.getGroups();
      res.json({ success: true, data: groups });
    } catch (err) { next(err); }
  },
  async createGroup(req, res, next) {
    try {
      const { label } = req.body;
      if (!label) return res.status(400).json({ message: 'Nombre del grupo requerido' });
      const id = await SeguridadModel.createGroup(label);
      res.status(201).json({ success: true, id });
    } catch (err) { next(err); }
  },
  async updateGroup(req, res, next) {
    try {
      await SeguridadModel.updateGroup(req.params.id, req.body.label);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
  async deleteGroup(req, res, next) {
    try {
      if (req.params.id == -1) return res.status(400).json({ message: 'No se puede eliminar el grupo de Super Administrador' });
      await SeguridadModel.deleteGroup(req.params.id);
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // ─── Usuarios con membresías (vista del módulo Seguridad) ──
  async getUsersWithGroups(req, res, next) {
    try {
      const { page, pageSize, search, sortField, sortDir } = req.query;
      const [paginado, allGroups, memberships] = await Promise.all([
        UsuarioCrudModel.getAll({ page, pageSize, search, sortField, sortDir }),
        SeguridadModel.getGroups(),
        SeguridadModel.getAllMemberships(),
      ]);
      const memberMap = memberships.reduce((acc, m) => {
        if (!acc[m.UserName]) acc[m.UserName] = new Set();
        acc[m.UserName].add(m.GroupID);
        return acc;
      }, {});
      const data = paginado.data.map(u => ({
        ...u,
        groups: allGroups.map(g => ({
          GroupID: g.GroupID,
          Label:   g.Label,
          member:  !!(memberMap[u.codigo]?.has(g.GroupID)),
        })),
      }));
      res.json({ success: true, data, meta: paginado.meta, groups: allGroups });
    } catch (err) { next(err); }
  },

  async toggleMember(req, res, next) {
    try {
      const { codigo, groupId, add } = req.body;
      await SeguridadModel.toggleMember(codigo, groupId, add);
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  // ─── Permisos ──────────────────────────────────────────────
  async getTables(req, res, next) {
    try {
      const tables = [...SYSTEM_TABLES].sort();
      res.json({ success: true, data: tables });
    } catch (err) { next(err); }
  },

  async getRights(req, res, next) {
    try {
      const rights = await SeguridadModel.getRightsByGroup(req.params.groupId);
      const map = rights.reduce((acc, r) => { acc[r.TableName] = r.AccessMask; return acc; }, {});
      const tables = [...SYSTEM_TABLES].sort();
      const data = tables.map(t => ({ tableName: t, mask: map[t] || '' }));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  async saveRights(req, res, next) {
    try {
      const { groupId } = req.params;
      const { rights } = req.body; // [{ tableName, mask }]
      await SeguridadModel.saveGroupRights(groupId, rights);
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  async copyRights(req, res, next) {
    try {
      const { fromGroupId, toGroupId } = req.body;
      if (toGroupId == -1) return res.status(400).json({ message: 'No se pueden sobreescribir los permisos del Super Admin' });
      await SeguridadModel.copyRights(fromGroupId, toGroupId);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};

module.exports = seguridadController;
