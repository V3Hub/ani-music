import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  // 忽略产物 / 自动生成文件
  ignores: [
    'components.d.ts',
    'dist',
    'public',
  ],
  // 启用 Prettier 格式化 HTML（index.html 等非 Vue 单文件组件）
  formatters: true,
  // 贴近 Vue 社区的轻量风格
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: false,
    trailingComma: 'none',
    bracketSpacing: true,
    arrowParens: 'always',
  },
  rules: {
    // 控制台允许 warn/error/info
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'no-debugger': 'error',
    // Vue 组件名允许单字
    'vue/multi-word-component-names': 'off',
    // script 在上 / template 在下保持灵活（antfu 默认 script 上）
    'vue/block-order': 'off',
    // 单行元素允许不换行
    'vue/singleline-html-element-content-newline': 'off',
    // 允许空 catch
    'no-empty': ['error', { allowEmptyCatch: true }],
    // 关闭 perfectionist 排序（对日常开发干扰大，可按需开启）
    'perfectionist/sort-imports': 'off',
    'perfectionist/sort-named-imports': 'off',
    'perfectionist/sort-named-exports': 'off',
    // JSON/YAML key 排序关（tsconfig / package 的顺序不必强制）
    'jsonc/sort-keys': 'off',
    'yaml/sort-keys': 'off',
    // pnpm workspace yaml 设置不强制（pnpm/yaml-enforce-settings）
    'pnpm/yaml-enforce-settings': 'off',
    // antfu 的 if-newline / reasonable-newline 过于严格
    'antfu/if-newline': 'off',
    'antfu/reasonable-newline': 'off',
    // import 空行
    'import/newline-after-import': 'off',
    // ts 空对象类型
    'ts/no-empty-object-type': 'off',
    // brace-style 用 1tbs 即可
    'style/brace-style': ['error', '1tbs'],
  },
})
