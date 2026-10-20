'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePython, runPython } = require('./run_python.cjs');

test('macOS falls back to python3 and invokes paths with spaces without a shell', () => {
  const calls = [];
  const spawn = (exe, args, options) => {
    calls.push({ exe, args, options });
    if (exe === 'python') return { status: 0, stdout: '[2, 7]' };
    return { status: 0, stdout: '[3, 10]' };
  };
  const result = runPython(['课件 with spaces/check.py', 'a b'], {
    env: {}, platform: 'darwin', cwd: '/work', exists: () => false, spawn,
  });
  assert.equal(result, 0);
  const last = calls.at(-1);
  assert.equal(last.exe, 'python3');
  assert.deepEqual(last.args, ['-X', 'utf8', '课件 with spaces/check.py', 'a b']);
  assert.equal(last.options.shell, false);
});

test('Windows launcher and local virtual environment are supported', () => {
  const spawn = exe => exe === 'py' ? { status: 0, stdout: '[3, 14]' } : { status: 1 };
  const options = { env: {}, platform: 'win32', cwd: 'C:\\work', exists: () => false, spawn };
  assert.deepEqual(resolvePython(options), { command: 'py', prefix: ['-3'] });
  const local = resolvePython({ ...options, exists: () => true, spawn: () => ({ status: 0, stdout: '[3, 14]' }) });
  assert.match(local.command, /\.venv[\\/]Scripts[\\/]python\.exe$/);
});

test('explicit or activated interpreters must fail visibly instead of silently falling back', () => {
  for (const env of [{ MATHVIZ_PYTHON: '/custom python' }, { VIRTUAL_ENV: '/active venv' }]) {
    assert.throws(() => resolvePython({ env, exists: () => false, spawn: () => ({ status: 1 }) }), /Python/);
  }
});

test('script failures propagate and missing runtimes have an actionable error', () => {
  let count = 0;
  assert.equal(runPython(['bad.py'], {
    env: { MATHVIZ_PYTHON: '/custom python' },
    spawn: () => ++count === 1 ? { status: 0, stdout: '[3, 12]' } : { status: 7 },
  }), 7);
  assert.throws(() => resolvePython({ env: {}, exists: () => false, spawn: () => ({ error: new Error('missing') }) }), /Python 3\.10/);
});

test('a broken local virtual environment cannot fall back to system Python', () => {
  const calls = [];
  assert.throws(() => resolvePython({
    env: {}, platform: 'darwin', cwd: '/work',
    exists: file => file === '/work/.venv',
    spawn: command => {
      calls.push(command);
      return command === 'python' ? { status: 0, stdout: '[3, 12]' } : { status: 1 };
    },
  }), /selected interpreter/);
  assert.deepEqual(calls, ['/work/.venv/bin/python']);
});
