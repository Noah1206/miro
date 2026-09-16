import { describe, expect, it } from 'vitest'
import { can, nextStatus, requiresNote } from '../admin/rbac'
describe('admin rbac', () => {
  it('viewer can look but not act', () => { expect(can('viewer', 'reports.view')).toBe(true); expect(can('viewer', 'reports.act')).toBe(false) })
  it('reviewer can act but not manage admins', () => { expect(can('reviewer', 'reports.act')).toBe(true); expect(can('reviewer', 'admins.manage')).toBe(false) })
  it('superadmin can everything', () => { expect(can('superadmin', 'admins.manage')).toBe(true) })
  it('only a superadmin can move a character into or out of 미로', () => {
    expect(can('superadmin', 'characters.manage')).toBe(true)
    expect(can('reviewer', 'characters.manage')).toBe(false); expect(can('viewer', 'characters.manage')).toBe(false)
  })
  it('only a superadmin approves a deposit, though reviewers can look', () => {
    expect(can('reviewer', 'payments.view')).toBe(true); expect(can('reviewer', 'payments.act')).toBe(false)
    expect(can('superadmin', 'payments.act')).toBe(true); expect(can('viewer', 'payments.act')).toBe(false)
  })
})
describe('report transitions', () => {
  it('pending → reviewing → resolved', () => { expect(nextStatus('pending', 'start_review')).toBe('reviewing'); expect(nextStatus('reviewing', 'hide_content')).toBe('resolved') })
  it('a resolved report cannot be resolved again, only reopened', () => { expect(nextStatus('resolved', 'hide_content')).toBeNull(); expect(nextStatus('resolved', 'reopen')).toBe('reviewing') })
  it('restrictions require a policy-violation note', () => { expect(requiresNote('hide_content')).toBe(true); expect(requiresNote('dismiss')).toBe(false) })
})
