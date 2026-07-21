import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const errors = []

function read(path) {
  const absolute = resolve(root, path)
  if (!existsSync(absolute)) {
    errors.push(`${path} が存在しません`)
    return ''
  }
  return readFileSync(absolute, 'utf8')
}

function expect(condition, message) {
  if (!condition) errors.push(message)
}

const ci = read('.github/workflows/ci.yml')
const releaseNpm = read('.github/workflows/release-npm.yml')
const dependabot = read('.github/dependabot.yml')

expect(!existsSync(resolve(root, '.github/workflows/lint.yml')), 'lint.ymlをci.ymlへ統合してください')
expect((ci.match(/^\s*runs-on:/gm) ?? []).length === 1, '品質CIを1jobへ統合してください')
expect((ci.match(/actions\/checkout@/g) ?? []).length === 1, 'checkoutは1回だけ実行してください')
expect((ci.match(/actions\/setup-node@/g) ?? []).length === 1, 'Node setupは1回だけ実行してください')
expect((ci.match(/^\s*run: npm ci --ignore-scripts\s*$/gm) ?? []).length === 1, 'npm ciは1回だけ実行してください')
expect((ci.match(/actions\/setup-go@/g) ?? []).length === 1, 'Go setupは1回だけ実行してください')
expect(ci.includes('ready_for_review'), 'Draft PRはReady化時に全CIを実行してください')
expect(ci.includes('merge_group:'), '将来のmerge queueでも同じ品質CIを実行してください')
expect(ci.includes('concurrency:'), 'PR単位concurrencyを設定してください')
expect(ci.includes('node scripts/check-actions-cost-guard.mjs'), 'CI自身からcost guardを実行してください')

for (const gate of [
  'npm run typecheck',
  'npm run test:coverage',
  'npm run build',
  'npm run test:consumer',
  'npm run lint:md',
  'golangci/golangci-lint-action@',
  'go test -race -coverprofile=coverage.out -covermode=atomic ./...',
  'codecov/codecov-action@',
  'yamllint .',
  'ludeeus/action-shellcheck@',
]) {
  expect(ci.includes(gate), `品質ゲート ${gate} を維持してください`)
}

expect(ci.includes('if: failure()'), 'Node coverage artifactは失敗時だけ保存してください')
expect(/retention-days:\s*1/.test(ci), 'Node coverage artifactの保持期間を1日にしてください')
expect(releaseNpm.includes('paths:'), 'npm releaseを配布対象pathへ限定してください')
expect(releaseNpm.includes("'.changeset/**'"), 'changeset変更をrelease対象へ含めてください')
expect((dependabot.match(/groups:/g) ?? []).length === 3, 'npm、Go、Actions更新をgroup化してください')
expect((dependabot.match(/cooldown:/g) ?? []).length === 3, '各ecosystemへcooldownを設定してください')
expect((dependabot.match(/rebase-strategy: disabled/g) ?? []).length === 3, 'Dependabot自動rebaseを停止してください')

if (errors.length) {
  console.error('GitHub Actionsコストガードに失敗しました:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('GitHub Actionsコストガード: OK')
