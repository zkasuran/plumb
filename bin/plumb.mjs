#!/usr/bin/env node
import { main } from '../src/cli.mjs';

main(process.argv.slice(2)).then(
  (code) => process.exit(typeof code === 'number' ? code : 0),
  (e) => {
    process.stderr.write(`plumb crashed: ${e?.stack || e}\n`);
    process.exit(2);
  }
);
