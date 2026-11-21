import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import compat from 'eslint-plugin-compat';

export default tseslint.config(
  { ignores: ['dist/', 'android/', 'ios/', 'node_modules/', 'screens/out/', 'playwright-report/', 'test-results/', '.claude/', 'store/'] }, // cloud_43: store/ = CD's listing tools (S327_feast_draw.mjs), not app code - not mirrored, not linted
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  // A-46 / A-47: every API of the app's own code must exist on the engine floor (package.json browserslist = Chrome 89);
  // a newer one fails the lint (CI build) - use a fallback or a polyfill in src/app/polyfills.ts. ES built-ins included.
  {
    files: ['src/**/*.{ts,tsx}'],
    ...compat.configs['flat/recommended'],
    rules: {
      'compat/compat': 'error',
      // the static methods the compat data misses (measured cloud_16: AbortSignal.timeout passed it) - newer than the floor
      'no-restricted-properties': ['error',
        ...[['AbortSignal', 'timeout', 'Chrome 103 - use timeoutSignal() (src/data/api/timeout.ts)'], ['AbortSignal', 'any', 'Chrome 116'],
          ['Object', 'groupBy', 'Chrome 117'], ['Map', 'groupBy', 'Chrome 117'], ['Promise', 'withResolvers', 'Chrome 119'],
          ['Array', 'fromAsync', 'Chrome 121'], ['Promise', 'try', 'Chrome 128'], ['URL', 'canParse', 'Chrome 120'], ['URL', 'parse', 'Chrome 126'],
          ['crypto', 'randomUUID', 'Chrome 92 - use uuidV4() (src/data/repo/cast.ts)']]
          .map(([object, property, why]) => ({ object, property, message: `A-46/A-47: newer than the engine floor (${why}).` }))],
      // A-48: the DATA of Intl is versioned too - time-zone names added after the floor's ICU throw RangeError (the white screen of the
      // reference phone, Chrome 98: `Europe/Kyiv` = tzdata 2022b). The compat data does not see strings; this does.
      'no-restricted-syntax': ['error',
        { selector: 'Literal[value=/^(Europe\\/Kyiv|America\\/Ciudad_Juarez|Pacific\\/Kanton)$/]', message: 'A-48: a time-zone name newer than the engine floor\'s tzdata - use the old name (Europe/Kiev = KYIV_TZ in src/data/live/streams.ts).' }],
    },
    settings: { lintAllEsApis: true, polyfills: ['Array.at', 'Object.hasOwn'] },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
