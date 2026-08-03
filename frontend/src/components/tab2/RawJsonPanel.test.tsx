import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useState } from 'react'
import { RawJsonPanel, parseRecipeText, serializeRecipe } from './RawJsonPanel'

afterEach(cleanup)

const DOC = serializeRecipe({ steps: [], table: { targetTableNames: [], sourceTableNames: [] } })

/** The panel's edit text is CONTROLLED by its parent (so toggling the `{ raw
 * JSON }` dropdown shut can't discard a half-written document). This host
 * stands in for `ETLModifier`'s own `rawText` state. */
function Host({ onApply, json = DOC, readOnly = false, metadata = null }: {
  onApply: (next: unknown) => void
  json?: string
  readOnly?: boolean
  metadata?: React.ReactNode
}) {
  const [text, setText] = useState<string | null>(null)
  return (
    <RawJsonPanel json={json} readOnly={readOnly} onApply={onApply as never}
      metadata={metadata} text={text} onTextChange={setText} />
  )
}

function renderPanel(overrides: { json?: string; readOnly?: boolean; metadata?: React.ReactNode } = {}) {
  const onApply = vi.fn()
  const utils = render(<Host onApply={onApply} {...overrides} />)
  return { ...utils, onApply }
}

const editor = () => screen.getByTestId('raw-json-editor') as HTMLTextAreaElement

describe('parseRecipeText', () => {
  it('accepts a JSON object', () => {
    expect(parseRecipeText('{"steps":[]}')).toEqual({ ok: true, value: { steps: [] } })
  })

  it('rejects malformed JSON with the parser\'s own message', () => {
    const r = parseRecipeText('{"steps":')
    expect(r.ok).toBe(false)
    expect((r as { message: string }).message).toBeTruthy()
  })

  // JSON.parse accepts all four of these; every one would break the adapters
  // downstream in a much less legible place than this panel.
  it.each([['[]', 'an array'], ['null', 'null'], ['42', 'number'], ['"x"', 'string']])(
    'rejects %s — a recipe document must be an object', (text, description) => {
      const r = parseRecipeText(text)
      expect(r.ok).toBe(false)
      expect((r as { message: string }).message).toContain(description)
    })
})

describe('RawJsonPanel', () => {
  it('shows the serialized document in an editable textarea', () => {
    renderPanel()
    expect(editor().value).toBe(DOC)
    expect(editor().readOnly).toBe(false)
  })

  it('typing does NOT touch the draft — Apply is what commits', () => {
    const { onApply } = renderPanel()

    fireEvent.change(editor(), { target: { value: '{"steps":[{"target":{"name":"T"}}]}' } })
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByText('unapplied edits')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Apply'))
    expect(onApply).toHaveBeenCalledWith({ steps: [{ target: { name: 'T' } }] })
  })

  it('malformed JSON reports the error, disables Apply and leaves the draft alone', () => {
    const { onApply } = renderPanel()

    fireEvent.change(editor(), { target: { value: '{"steps": [' } })

    expect(screen.getByText(/The draft is untouched until this parses/)).toBeInTheDocument()
    expect(screen.getByText('Apply')).toBeDisabled()
    fireEvent.click(screen.getByText('Apply'))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('Revert drops local edits and re-mirrors the incoming document', () => {
    renderPanel()

    fireEvent.change(editor(), { target: { value: '{"steps":[]}' } })
    expect(editor().value).toBe('{"steps":[]}')

    fireEvent.click(screen.getByText('Revert'))
    expect(editor().value).toBe(DOC)
    expect(screen.queryByText('unapplied edits')).not.toBeInTheDocument()
  })

  it('mirrors an upstream change while untouched, but never overwrites edits in progress', () => {
    const next = serializeRecipe({ steps: [{ target: { name: 'FROM_CANVAS' } }] })
    const onApply = vi.fn()
    const { rerender } = render(<Host onApply={onApply} />)

    // Untouched: a canvas edit lands in the panel straight away.
    rerender(<Host onApply={onApply} json={next} />)
    expect(editor().value).toBe(next)

    // Being edited: a further upstream change must NOT wipe what is being typed.
    fireEvent.change(editor(), { target: { value: '{"mine":1}' } })
    rerender(<Host onApply={onApply} json={DOC} />)
    expect(editor().value).toBe('{"mine":1}')
  })

  // The `{ raw JSON }` button unmounts this panel every time it is toggled
  // shut, which is why the edit text lives in the PARENT. Pinned here because
  // the failure mode — losing a long hand-written document to a stray click on
  // the button that opened it — is silent and unrecoverable.
  it('keeps unapplied text across an unmount, because the parent owns it', () => {
    const onApply = vi.fn()
    function Toggler() {
      const [text, setText] = useState<string | null>(null)
      const [open, setOpen] = useState(true)
      return (
        <>
          <button onClick={() => setOpen(o => !o)}>toggle</button>
          {open && (
            <RawJsonPanel json={DOC} readOnly={false} onApply={onApply}
              metadata={null} text={text} onTextChange={setText} />
          )}
        </>
      )
    }
    render(<Toggler />)

    fireEvent.change(editor(), { target: { value: '{"wip":1}' } })
    fireEvent.click(screen.getByText('toggle'))   // panel unmounts
    expect(screen.queryByTestId('raw-json-editor')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('toggle'))   // and back

    expect(editor().value).toBe('{"wip":1}')
    expect(screen.getByText('unapplied edits')).toBeInTheDocument()
  })

  it('readOnly (viewing an archived version) shows the document but offers no way to commit it', () => {
    renderPanel({ readOnly: true })

    expect(editor().readOnly).toBe(true)
    expect(screen.queryByText('Apply')).not.toBeInTheDocument()
    expect(screen.queryByText('Revert')).not.toBeInTheDocument()
  })

  it('renders the caller-supplied metadata block above the editor', () => {
    renderPanel({ metadata: <div>PATH_BLOCK</div> })
    expect(screen.getByText('PATH_BLOCK')).toBeInTheDocument()
  })
})
