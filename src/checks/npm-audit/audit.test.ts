/* eslint-disable @typescript-eslint/camelcase */
import { auditCheck } from './audit'
import { auditMultiVuln, auditNoVuln } from './resources/audit-help-text'

describe('checks/audit', () => {
  it('converts successful audit', () => {
    const data = JSON.parse(auditNoVuln)
    const result = auditCheck({
      data
    })
    expect(result).toStrictEqual({
      conclusion: 'success',
      output: {
        title: 'npm audit security report',
        summary: 'Found **0** vulnerabilities in 4982 scanned packages',
        text: ''
      }
    })
  })

  it('converts failed audit', () => {
    const data = JSON.parse(auditMultiVuln)
    const result = auditCheck({
      data
    })
    expect(result).toMatchSnapshot()
  })
})
