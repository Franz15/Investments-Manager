import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'scripts/**', 'backups/**', 'uploads/**', 'data/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // La base de código usa console de forma intencionada para logging de servidor.
      'no-console': 'off',
      // Avisar (no romper) sobre variables sin usar; ignorar args con prefijo _.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Deuda preexistente: degradadas a warning para tener un baseline verde.
      // Conviene ir arreglándolas y volver a subirlas a "error".
      'no-empty': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
