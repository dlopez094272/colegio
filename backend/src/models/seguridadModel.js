const { pool } = require('../config/database');

const SeguridadModel = {
  // ─── Grupos ───────────────────────────────────────────────
  async getGroups() {
    const [rows] = await pool.query('SELECT * FROM seguridad_uggroups ORDER BY GroupID');
    return rows;
  },
  async createGroup(label) {
    const [r] = await pool.query('INSERT INTO seguridad_uggroups (Label) VALUES (?)', [label]);
    return r.insertId;
  },
  async updateGroup(id, label) {
    await pool.query('UPDATE seguridad_uggroups SET Label=? WHERE GroupID=?', [label, id]);
  },
  async deleteGroup(id) {
    await pool.query('DELETE FROM seguridad_ugmembers WHERE GroupID=?', [id]);
    await pool.query('DELETE FROM seguridad_ugrights WHERE GroupID=?', [id]);
    await pool.query('DELETE FROM seguridad_uggroups WHERE GroupID=?', [id]);
  },

  // ─── Miembros ─────────────────────────────────────────────
  async getMembersByUser(codigo) {
    const [rows] = await pool.query(
      'SELECT GroupID FROM seguridad_ugmembers WHERE UserName=?', [codigo]
    );
    return rows.map(r => r.GroupID);
  },
  async getAllMemberships() {
    const [rows] = await pool.query(
      `SELECT m.UserName, m.GroupID, g.Label
       FROM seguridad_ugmembers m
       JOIN seguridad_uggroups g ON m.GroupID = g.GroupID`
    );
    return rows;
  },
  async setUserGroups(codigo, groupIds) {
    await pool.query('DELETE FROM seguridad_ugmembers WHERE UserName=?', [codigo]);
    if (groupIds.length > 0) {
      const vals = groupIds.map(gid => [codigo, gid]);
      await pool.query('INSERT IGNORE INTO seguridad_ugmembers (UserName, GroupID) VALUES ?', [vals]);
    }
  },
  async toggleMember(codigo, groupId, add) {
    if (add) {
      await pool.query(
        'INSERT IGNORE INTO seguridad_ugmembers (UserName, GroupID) VALUES (?,?)',
        [codigo, groupId]
      );
    } else {
      await pool.query(
        'DELETE FROM seguridad_ugmembers WHERE UserName=? AND GroupID=?',
        [codigo, groupId]
      );
    }
  },
  async isSuperAdmin(codigo) {
    const [rows] = await pool.query(
      'SELECT 1 FROM seguridad_ugmembers WHERE UserName=? AND GroupID=-1 LIMIT 1',
      [codigo]
    );
    return rows.length > 0;
  },

  // ─── Permisos (derechos por tabla y grupo) ─────────────────
  async getRightsByGroup(groupId) {
    const [rows] = await pool.query(
      'SELECT TableName, AccessMask FROM seguridad_ugrights WHERE GroupID=?',
      [groupId]
    );
    return rows;
  },
  async upsertRight(tableName, groupId, accessMask) {
    await pool.query(
      `INSERT INTO seguridad_ugrights (TableName, GroupID, AccessMask) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE AccessMask=?`,
      [tableName, groupId, accessMask, accessMask]
    );
  },
  async saveGroupRights(groupId, rights) {
    // rights = [{ tableName, mask }]
    for (const r of rights) {
      await this.upsertRight(r.tableName, groupId, r.mask);
    }
  },
  async copyRights(fromGroupId, toGroupId) {
    await pool.query('DELETE FROM seguridad_ugrights WHERE GroupID=?', [toGroupId]);
    await pool.query(
      `INSERT INTO seguridad_ugrights (TableName, GroupID, AccessMask)
       SELECT TableName, ?, AccessMask FROM seguridad_ugrights WHERE GroupID=?`,
      [toGroupId, fromGroupId]
    );
  },

  // Todas las tablas que tienen algún permiso registrado en el sistema
  async getAllTables() {
    const [rows] = await pool.query(
      'SELECT DISTINCT TableName FROM seguridad_ugrights ORDER BY TableName'
    );
    return rows.map(r => r.TableName);
  },
};

module.exports = SeguridadModel;
