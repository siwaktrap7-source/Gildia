
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'guilds.json');

function ensureFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
  }
}

function read() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('[DB] read error', e);
    return [];
  }
}

function write(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[DB] write error', e);
  }
}

function findGuildByMember(guilds, userId) {
  return guilds.find(g => g.owner === userId || g.members.includes(userId) || g.deputies.includes(userId));
}

function findGuildByName(guilds, name) {
  return guilds.find(g => g.name.toLowerCase() === name.toLowerCase());
}

module.exports = { DB_PATH, read, write, findGuildByMember, findGuildByName };
