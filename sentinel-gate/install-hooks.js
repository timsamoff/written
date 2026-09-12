#!/usr/bin/env node
// ==========================================================================
// Sentinel Gate-Check — hook installer
// ==========================================================================
// .git/hooks/ is never tracked by git, so the hook scripts live in this
// tracked directory (sentinel-gate/hooks/) and must be copied into
// .git/hooks/ to actually run. Run this once after cloning, or again any
// time a hook file here changes:
//
//   node sentinel-gate/install-hooks.js

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const hooksSrc = path.join(__dirname, 'hooks');
const hooksDest = path.join(repoRoot, '.git', 'hooks');

const hookNames = ['commit-msg', 'pre-commit', 'pre-push'];

for (const name of hookNames) {
    const src = path.join(hooksSrc, name);
    const dest = path.join(hooksDest, name);
    fs.copyFileSync(src, dest);
    try {
        fs.chmodSync(dest, 0o755);
    } catch (e) {
        // chmod can no-op on some Windows filesystems; git-bash still
        // honors the executable shebang line for hook invocation there.
    }
    console.log(`Installed ${name} -> ${dest}`);
}

console.log('\nDone. Hooks are active for this local clone (hooks are never pushed/pulled by git).');
