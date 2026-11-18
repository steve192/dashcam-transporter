// eslint-config-love is the renamed successor of eslint-config-standard-with-typescript.
import love from 'eslint-config-love'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default [
  {
    ignores: ['dist/', 'test/']
  },
  {
    ...love,
    files: ['src/**/*.ts'],
    languageOptions: {
      ...love.languageOptions,
      parserOptions: {
        ...love.languageOptions.parserOptions,
        // import.meta.dirname needs Node.js 20.11, the build runs on 18.
        tsconfigRootDir: path.dirname(fileURLToPath(import.meta.url))
      }
    },
    rules: {
      ...love.rules,
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  }
]
