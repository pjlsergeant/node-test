import { RunProcess } from '../../unix/run-process'

function matchToObj(match: RegExpExecArray): TscData {
  return {
    file: match[1],
    line: parseInt(match[2], 10),
    col: parseInt(match[3], 10),
    errorCode: match[4],
    message: match[5] ? match[5] : ''
  }
}

export function parseTsc(output: string): TscData[] {
  const messages = output.split('\n')

  const tscErrorRegex = /^((?:[\w-]+\/)*[\w.-]+)\((\d+),(\d+)\): error (TS\d+): (.*)/

  const errors: TscData[] = []

  messages.forEach(msg => {
    const matched = tscErrorRegex.exec(msg)
    if (matched !== null) {
      errors.push(matchToObj(matched))
    } else if (errors.length > 0) {
      // this is a continuation of the previous error
      errors[errors.length - 1].message += '\n' + msg
    }
  })
  return errors
}

export async function runTsc(): Promise<TscData[]> {
  const cmd = new RunProcess('tsc', ['--pretty', 'false', '--noErrorTruncation'])
  const data: Buffer[] = []
  cmd.stdout?.on('data', chunk => {
    data.push(chunk)
  })
  await cmd.waitForStarted()
  await cmd.waitForExit()

  const compileResult = Buffer.concat(data).toString('utf8')

  if (compileResult === null) {
    process.exit(-1)
  }

  return parseTsc(compileResult)
}
