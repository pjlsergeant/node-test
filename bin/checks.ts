#!/usr/bin/env node

import args from 'args'

import { eslintCheck, EslintInput } from '../src/checks/eslint/eslint'
import { runEslintBin } from '../src/checks/eslint/run-eslint'
import { jestCheck, JestInput } from '../src/checks/jest/jest'
import { runJestBin } from '../src/checks/jest/run-jest'

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
          const result = await runJestBin()
          const jestInput: JestInput = {
            data: result,
            org: 'null',
            repo: 'null',
            sha: 'null'
          }
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
          const result = await runEslintBin()
          const eslintInput: EslintInput = {
            data: result,
            org: 'null',
            repo: 'null',
            sha: 'null'
          }
          const checkOutput = eslintCheck(eslintInput)
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
