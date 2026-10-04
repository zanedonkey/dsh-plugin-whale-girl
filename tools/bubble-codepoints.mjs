import fs from 'node:fs';
import { MESSAGES } from '../src/i18n.js';
const points = new Set();
for (const dictionary of Object.values(MESSAGES)) for (const [key, text] of Object.entries(dictionary)) {
  if (!/^(state|working|celebrate|error|interaction)\./.test(key) && key !== 'pet.greeting') continue;
  for (const character of text) points.add(character.codePointAt(0));
}
fs.mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../artifacts/bubble-codepoints.json', import.meta.url), JSON.stringify([...points].sort((a, b) => a - b)));
