// Export and import of the whole store. Export uses the File System Access
// save picker when the browser has it, else a download link. Import validates
// the file and shows what would change before anything is replaced.

import { backupFileName } from '../store.js';
import { formatDayMonthYear } from '../dates.js';
import { fromTemplate, h } from '../dom.js';

export async function saveTextFile(text, filename) {
  if (typeof globalThis.showSaveFilePicker === 'function') {
    try {
      const handle = await globalThis.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Fitness backup', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return { method: 'picker', name: handle.name };
    } catch (error) {
      if (error.name === 'AbortError') return { method: 'cancelled', name: filename };
      // Picker not allowed here (e.g. in a frame): fall back to a download.
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = h('a', { href: url, download: filename, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { method: 'download', name: filename };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Rows and notes that explain a store diff in plain words. */
export function describeDiff(diff) {
  const rows = [
    ['Sessions', diff.sessions.current, diff.sessions.incoming],
    ['Sets', diff.sets.current, diff.sets.incoming],
    ['Runs', diff.runs.current, diff.runs.incoming],
    ['Bodyweight', diff.body.current, diff.body.incoming],
  ];
  const parts = [diff.sessions, diff.runs, diff.body];
  const added = parts.reduce((n, p) => n + p.added, 0);
  const changed = parts.reduce((n, p) => n + p.changed, 0);
  const removed = parts.reduce((n, p) => n + p.removed, 0);
  const notes = [];
  if (diff.range?.from === diff.range?.to && diff.range) notes.push(`The backup covers ${formatDayMonthYear(diff.range.from)}.`);
  else if (diff.range) notes.push(`The backup covers ${formatDayMonthYear(diff.range.from)} to ${formatDayMonthYear(diff.range.to)}.`);
  else notes.push('The backup is empty.');
  if (diff.identical) notes.push('It matches what is on this device.');
  else {
    const changes = [];
    if (added) changes.push(`${plural(added, 'new entry', 'new entries')}`);
    if (changed) changes.push(`${plural(changed, 'changed entry', 'changed entries')}`);
    if (changes.length) notes.push(`It brings ${changes.join(' and ')}.`);
    if (removed) notes.push(`${plural(removed, 'entry', 'entries')} on this device ${removed === 1 ? 'is' : 'are'} not in the backup and will be deleted.`);
  }
  return { rows, notes, removed };
}

export class BackupController {
  #ctx;

  /** @param {{ store, sheet, toast }} ctx */
  constructor(ctx) {
    this.#ctx = ctx;
  }

  async export() {
    const { store, toast } = this.#ctx;
    const result = await saveTextFile(store.exportJSON(), backupFileName());
    if (result.method !== 'cancelled') toast.show(`Exported ${result.name}`);
    return result;
  }

  async import(file) {
    const { store, toast } = this.#ctx;
    let text;
    try {
      text = await file.text();
    } catch {
      toast.show('Could not read that file.');
      return { imported: false };
    }
    const result = await store.importJSON(text, { confirm: (preview) => this.#confirm(preview, file.name) }).catch((error) => {
      toast.show(error.message);
      return { imported: false, ok: true };
    });
    if (!result.ok) this.#showErrors(result.errors, file.name);
    else if (result.imported) toast.show('Backup restored.');
    return result;
  }

  #confirm(preview, fileName) {
    const { sheet } = this.#ctx;
    const { el, refs } = fromTemplate('tpl-import');
    const { rows, notes, removed } = describeDiff(preview.diff);
    refs.rows.replaceChildren(
      ...rows.map(([label, current, incoming]) =>
        h('tr', {}, h('th', { scope: 'row', text: label }), h('td', { text: String(current) }), h('td', { text: String(incoming) })),
      ),
    );
    refs.notes.replaceChildren(...notes.map((text) => h('p', { text })));
    refs.warning.textContent = removed
      ? 'Replacing deletes those entries from this device. Export first if you want to keep them.'
      : 'Replacing swaps the log on this device for the backup.';

    return new Promise((resolve) => {
      let decision = false;
      refs.replace.addEventListener('click', () => {
        decision = true;
        sheet.close();
      });
      refs.cancel.addEventListener('click', () => sheet.close());
      sheet.open({ title: 'Restore backup?', subtitle: fileName, content: el, doneLabel: 'Cancel', onClose: () => resolve(decision) });
    });
  }

  #showErrors(errors, fileName) {
    const { el, refs } = fromTemplate('tpl-import-error');
    refs.errors.replaceChildren(...errors.slice(0, 8).map((text) => h('li', { text })));
    if (errors.length > 8) refs.errors.append(h('li', { text: `…and ${errors.length - 8} more` }));
    refs.ok.addEventListener('click', () => this.#ctx.sheet.close());
    this.#ctx.sheet.open({ title: 'This file can’t be imported', subtitle: fileName, content: el });
  }
}
