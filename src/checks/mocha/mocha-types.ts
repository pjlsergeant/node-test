interface MochaData {
  stats: Stats
  tests: MochaTest[]
  failures: MochaTest[]
  passes?: MochaTest[]
  pending?: MochaTest[]
}

interface MochaTest {
  title?: string
  fullTitle?: string
  duration: number
  currentRetry: number
  err: MochaError
}

interface MochaError {
  message?: string
  stack?: string
  errorMode?: string
  parent?: MochaParent
  name?: string
  hasSerializedErrorMessage?: boolean
  fullTitle?: string
  title?: string
}

interface MochaParent {
  errorMode: string
  parent: MochaParent | null
  name: string
  label?: string
}

interface Stats {
  suites: number
  tests: number
  passes: number
  pending: number
  failures: number
  start?: string
  end?: string
  duration?: number
}
