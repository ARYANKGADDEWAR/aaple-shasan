// src/utils/socketEmitter.js
function getIO(req) {
  try { return req?.app?.get('io'); } catch { return null; }
}
function emitToUser(req, userId, event, data) {
  const io = getIO(req);
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, data);
}
function emitToAdmins(req, event, data) {
  const io = getIO(req);
  if (!io) return;
  io.to('room:admins').emit(event, data);
}
function emitToDept(req, dept, event, data) {
  const io = getIO(req);
  if (!io || !dept) return;
  io.to(`dept:${dept}`).emit(event, data);
}
module.exports = { emitToUser, emitToAdmins, emitToDept };
