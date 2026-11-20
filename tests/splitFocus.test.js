import { describe, it, expect } from 'vitest'
// REAL shipped logic — no re-implementation.
import { splitFocus } from '../src/lib/surfaceActions.js'

// The work-block picker leads with what is in Course+'s Now lane ("Focus
// now"), across projects, then offers the projects underneath without it.
const task = (id, status = 'icebox') => ({ id, status, doDate: null })
const project = (id, tasks) => ({ id, name: `Project ${id}`, tasks })

describe('splitFocus', () => {
  it('lifts Now-lane tasks out of every project, in project order', () => {
    const r = splitFocus([
      project('a', [task('a1'), task('a2', 'now')]),
      project('b', [task('b1', 'now'), task('b2')]),
    ])
    expect(r.focus.map((f) => f.task.id)).toEqual(['a2', 'b1'])
    expect(r.focus.map((f) => f.projectName)).toEqual(['Project a', 'Project b'])
  })

  it('never offers a focus task a second time under its project', () => {
    const r = splitFocus([project('a', [task('a1'), task('a2', 'now'), task('a3')])])
    expect(r.projects[0].tasks.map((t) => t.id)).toEqual(['a1', 'a3'])
  })

  it('drops a project whose every task is in focus', () => {
    const r = splitFocus([project('a', [task('a1', 'now')]), project('b', [task('b1')])])
    expect(r.projects.map((p) => p.id)).toEqual(['b'])
  })

  it('leaves projects untouched when nothing is in focus', () => {
    const projects = [project('a', [task('a1'), task('a2', 'next')]), project('b', [])]
    const r = splitFocus(projects)
    expect(r.focus).toEqual([])
    expect(r.projects).toEqual(projects)
  })

  it('only the Now lane counts, not next or legacy in_progress', () => {
    const r = splitFocus([project('a', [task('a1', 'next'), task('a2', 'in_progress')])])
    expect(r.focus).toEqual([])
  })

  it('splits loose open tasks the same way', () => {
    const r = splitFocus([], [task('o1', 'now'), task('o2')])
    expect(r.focus.map((f) => f.task.id)).toEqual(['o1'])
    expect(r.focus[0].projectName).toBeNull()
    expect(r.openTasks.map((t) => t.id)).toEqual(['o2'])
  })
})
