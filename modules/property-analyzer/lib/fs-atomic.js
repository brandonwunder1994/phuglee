const fs = require('fs');
const path = require('path');

function tmpPathFor(targetPath) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  return path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
}

function cleanupTmp(tmpPath) {
  try {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  } catch (_) {}
}

function writeFileAtomic(targetPath, content, encoding = 'utf8') {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = tmpPathFor(targetPath);
  try {
    fs.writeFileSync(tmp, content, encoding);
    fs.renameSync(tmp, targetPath);
  } catch (err) {
    cleanupTmp(tmp);
    throw err;
  }
}

function writeFileAtomicBuffer(targetPath, buffer) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = tmpPathFor(targetPath);
  try {
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, targetPath);
  } catch (err) {
    cleanupTmp(tmp);
    throw err;
  }
}

module.exports = { writeFileAtomic, writeFileAtomicBuffer };