module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'chore', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci'
    ]],
    'scope-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 72]
  }
};
