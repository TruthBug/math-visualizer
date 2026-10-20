#!/usr/bin/env node
'use strict';
// Python tools use only stdlib; resolve the interpreter without shell quoting or machine paths.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function resolvePython(options = {}) {
  const { env = process.env, platform = process.platform, cwd = process.cwd(), exists = fs.existsSync, spawn = spawnSync } = options;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const inVenv = dir => paths.join(dir, ...(platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
  const localRoot = paths.join(cwd, '.venv');
  const explicit = env.MATHVIZ_PYTHON || (env.VIRTUAL_ENV && inVenv(env.VIRTUAL_ENV)) || (exists(localRoot) && inVenv(localRoot));
  const candidates = explicit ? [{ command: explicit, prefix: [] }] : [
    { command: 'python', prefix: [] },
    { command: 'python3', prefix: [] },
    ...(platform === 'win32' ? [{ command: 'py', prefix: ['-3'] }] : []),
  ];
  for (const candidate of candidates) {
    const probe = spawn(candidate.command, [...candidate.prefix, '-c', 'import json,sys; print(json.dumps(list(sys.version_info[:2])))'], {
      cwd, env, encoding: 'utf8', shell: false, windowsHide: true, timeout: 10000,
    });
    if (probe.error || probe.status !== 0) continue;
    try {
      const [major, minor] = JSON.parse(probe.stdout.trim());
      if (major === 3 && minor >= 10) return candidate;
    } catch { /* A command alias or unrelated executable is not a Python runtime. */ }
  }
  throw new Error(`Python 3.10+ is required${explicit ? `; selected interpreter is unavailable or unsupported: ${explicit}` : ''}. Install Python or set MATHVIZ_PYTHON to its executable path (without arguments). See references/environment.md.`);
}

function runPython(args, options = {}) {
  const { env = process.env, cwd = process.cwd(), spawn = spawnSync } = options;
  const python = resolvePython(options);
  const result = spawn(python.command, [...python.prefix, '-X', 'utf8', ...args], {
    cwd, env, stdio: 'inherit', shell: false, windowsHide: true,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (require.main === module) {
  try {
    if (process.argv.length < 3) throw new Error('Usage: node scripts/run_python.cjs <script.py | -m module | --version> [arguments...]');
    process.exitCode = runPython(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { resolvePython, runPython };
