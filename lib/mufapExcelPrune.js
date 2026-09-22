import path from 'path';

/**
 * Keep only the newest dated MUFAP Excel dumps; delete older ones.
 * Filenames: mufap-nav-YYYY-MM-DD.xlsx
 * @param {string[]} names file basenames in a directory
 * @param {number} keep how many newest dated files to keep
 * @returns {string[]} basenames that should be deleted
 */
export function listMufapExcelToDelete(names, keep = 2) {
  const dated = names
    .map((name) => {
      const m = /^mufap-nav-(\d{4}-\d{2}-\d{2})\.xlsx$/i.exec(name);
      return m ? { name, ymd: m[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.ymd < b.ymd ? 1 : a.ymd > b.ymd ? -1 : 0));

  if (dated.length <= keep) return [];
  return dated.slice(keep).map((x) => x.name);
}

/**
 * @param {{ existsSync: Function, readdirSync: Function, unlinkSync: Function }} fs
 * @param {string} dir
 * @param {number} [keep]
 * @returns {string[]} deleted basenames
 */
export function pruneMufapExcelFiles(fs, dir, keep = 2) {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir);
  const toDelete = listMufapExcelToDelete(names, keep);
  for (const name of toDelete) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* best-effort */
    }
  }
  return toDelete;
}
