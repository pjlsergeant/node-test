#!/usr/bin/env node

import args from 'args'

import { eslintCheck, EslintInput } from '../src/checks/eslint/eslint'
import { runEslint } from '../src/checks/eslint/run-eslint'
import { jestCheck, JestInput } from '../src/checks/jest/jest'
import { runJest, runReactScriptsTest } from '../src/checks/jest/run-jest'
import { auditCheck, AuditInput } from '../src/checks/npm-audit/audit'
import { runNpmAudit } from '../src/checks/npm-audit/run-audit'
const { REPO_NAME, COMMIT_SHA } = process.env

process.env.PATH = `./node_modules/.bin:${process.env.PATH}`

async function main() {
  const commands: {
    [key: string]: {
      desc: string
      fn: (name: string, sub: string[], options: { [key: string]: any }) => void
    }
  } = {
    'jest-ci': {
      desc: 'Runs Jest with CI output',
      fn: async () => {
        try {
          const result = await runJest()
          const jestInput: JestInput = {
            data: result,
            org: 'connectedcars', // TODO: Can we extact this from current env vars?
            repo: REPO_NAME || '',
            sha: COMMIT_SHA || ''
          }
          const checkOutput = jestCheck(jestInput)
          console.log(JSON.stringify(checkOutput, null, 2))
        } catch (error) {
          console.error(error)
        }
      }
    },
    'jest-cra-ci': {
      desc: 'Runs Jest with CI output',
      fn: async () => {
        try {
          const result = await runReactScriptsTest()
          const jestInput: JestInput = {
            data: result,
            org: 'connectedcars', // TODO: Can we extact this from current env vars?
            repo: REPO_NAME || '',
            sha: COMMIT_SHA || ''
          }
          console.log(result)
          const checkOutput = jestCheck(jestInput)
          console.log(JSON.stringify(checkOutput, null, 2))
        } catch (error) {
          console.error(error)
        }
      }
    },
    'eslint-ci': {
      desc: 'Runs Eslint with CI output',
      fn: async () => {
        try {
          const result = await runEslint()
          const eslintInput: EslintInput = {
            data: result,
            org: 'connectedcars', // TODO: Can we extact this from current env vars?
            repo: REPO_NAME || '',
            sha: COMMIT_SHA || ''
          }
          const checkOutput = eslintCheck(eslintInput)
          console.log(JSON.stringify(checkOutput, null, 2))
        } catch (error) {
          console.error(error)
        }
      }
    },
    'audit-ci': {
      desc: 'Runs audit with CI output',
      fn: async () => {
        try {
          const result = await runNpmAudit()
          const auditInput: AuditInput = {
            data: result
          }
          const checkOutput = auditCheck(auditInput)
          console.log(JSON.stringify(checkOutput, null, 2))
        } catch (error) {
          console.error(error)
        }
      }
    }
  }
  for (const cmd in commands) {
    const { desc, fn } = commands[cmd]
    args.command(cmd, desc, fn)
  }

  args.parse(process.argv)

  if (args.sub.length === 0 || !commands[args.sub[0]]) {
    console.log(`Unknown command: "${args.sub[0] || ''}"`)
    process.exit(255)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(255)
})
