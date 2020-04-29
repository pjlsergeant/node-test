/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/camelcase */
import { CheckResult } from '../checks-common'
import { AuditData, Vulnerabilities } from './audit-types'

export interface AuditInput {
  data: AuditData
}

const getSummary = (problems: Vulnerabilities, totalDependencies: number): string => {
  let summary = `Found **${problems.all}** vulnerabilities`
  if (problems.all > 0) {
    const details = []
    for (const key in problems) {
      if (key === 'all') {
        continue
      }
      if (problems[key] > 0) {
        details.push(`**${problems[key]}** ${key}`)
      }
    }
    summary += ` (${details.join(', ')})`
  }
  summary += ` in ${totalDependencies} scanned packages`
  return summary
}

interface SeverityMap {
  [name: string]: number
}

const severities: SeverityMap = {
  critical: 5,
  high: 4,
  moderate: 3,
  low: 2,
  info: 1
}

const getText = (data: AuditData): string => {
  const advisories = Object.values(data.advisories)
  advisories.sort((a: any, b: any) => severities[b.severity] - severities[a.severity])
  const entries: string[] = []
  for (const advisory of advisories) {
    const severity = advisory.severity.substr(0, 1).toUpperCase() + advisory.severity.substr(1)
    let entry = `## ${severity}: ${advisory.title}\n`
    const overview = advisory.overview.replace(/\r/g, '')
    entry += `${overview}\n\n`
    const id = advisory.id
    const url = advisory.url
    entry += `[Read about advisory ${id} at nodesecurity.io](${url})\n\n`
    entry += `#### ${advisory.module_name} (${advisory.vulnerable_versions})\n`
    for (const finding of advisory.findings) {
      for (const path of finding.paths) {
        const dev = finding.dev ? '**DEV:**' : ''
        entry += ` - ${dev} \`${path.replace(/>/g, '` > `')}\`\n`
      }
    }
    const recommendation = advisory.recommendation.replace(/\r/g, '')
    entry += `\n#### Recommendation\n${recommendation}`
    entries.push(entry)
  }
  return entries.join('\n\n')
}

export const auditCheck = ({ data }: AuditInput): CheckResult => {
  const problems = {
    all: 0,
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0
  }
  let totalDependencies = 0
  if (data.metadata) {
    if (data.metadata.vulnerabilities) {
      Object.assign(problems, data.metadata.vulnerabilities)
      problems.all = Object.values(problems).reduce((sum, val) => sum + val, 0)
    }
    if (data.metadata.totalDependencies) {
      totalDependencies = data.metadata.totalDependencies
    }
  }
  return {
    conclusion: problems.all === 0 ? 'success' : 'neutral',
    output: {
      title: 'npm audit security report',
      summary: getSummary(problems, totalDependencies),
      text: getText(data)
    }
  }
}
