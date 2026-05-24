import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTaxYear } from '../context/TaxYearContext'
import { useAuth } from '../auth/AuthContext'
import Attachments from '../components/Attachments'
import './Transactions.css'

interface Transaction {
  _id: string
  type: string
  source: string
  date: string
  taxYear: number
  amount: number
  currency: string
  description: string
  symbol?: string
  side?: string
  subType?: string
  followUp?: boolean
  taxCategory?: string
  entity?: string
  expensePercent?: number | null
  attachmentCount?: number
}

interface TaxCategory {
  _id: string
  code: string
  name: string
  type: 'income' | 'deduction'
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface Options {
  sources: string[]
  types: string[]
  subTypes: string[]
}

interface SourceInfo {
  key: string
  label: string
  type: string
}

interface SubTypeOption {
  _id: string
  label: string
}

function Transactions() {
  const { taxYear, entity: entityFilter, entities } = useTaxYear()
  const { canEdit } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalNetAmount, setTotalNetAmount] = useState(0)
  const [typeCounts, setTypeCounts] = useState<{ type: string; count: number }[]>([])
  const [options, setOptions] = useState<Options>({ sources: [], types: [], subTypes: [] })
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([])
  const [savedSubTypes, setSavedSubTypes] = useState<string[]>([])
  const [sourceMap, setSourceMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [source, setSource] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [typesOpen, setTypesOpen] = useState(false)
  const typesRef = useRef<HTMLDivElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [subType, setSubType] = useState(() => searchParams.get('subType') || '')
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [filtered, setFiltered] = useState(true)
  const [followUpOnly, setFollowUpOnly] = useState(false)
  const [confirmIgnore, setConfirmIgnore] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get('taxCategory') || '')
  const [page, setPage] = useState(1)
  const [expandedAttachment, setExpandedAttachment] = useState<string | null>(null)
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [savingDescriptionId, setSavingDescriptionId] = useState<string | null>(null)
  const [expensePercentInput, setExpensePercentInput] = useState('')
  const [expenseModal, setExpenseModal] = useState<{
    open: boolean
    value: number | null
    count: number
    status: 'confirm' | 'applying' | 'done'
    result?: number
  }>({ open: false, value: null, count: 0, status: 'confirm' })
  const [undoLabel, setUndoLabel] = useState('')
  const undoStack = useRef<Array<{ label: string; fn: () => Promise<void> }>>([])
  const descriptionInputRef = useRef<HTMLInputElement>(null)

  /**
   * Fetch the attachments for a tx and open each one in a new tab.
   * For Drive-backed files this lands the user on Drive's viewer with a
   * Download button; for legacy local files it falls back to the server view
   * endpoint.
   */
  async function openAttachmentsForTx(txId: string) {
    try {
      const r = await fetch(
        `/api/attachments?parentId=${txId}&parentType=transaction`,
      )
      if (!r.ok) return
      const attachments = (await r.json()) as Array<{
        _id: string
        driveFileId?: string
        driveWebViewLink?: string
      }>
      if (attachments.length === 0) return
      // Open each in a new tab. Drive's anyone-with-link permission lets the
      // guest see + download even though it's the owner's file.
      for (const a of attachments) {
        const url =
          a.driveWebViewLink ||
          (a.driveFileId
            ? `https://drive.google.com/file/d/${a.driveFileId}/view`
            : `/api/attachments/${a._id}/view`)
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      console.error('Could not open attachment(s):', err)
    }
  }

  function buildFilterParams() {
    const params = new URLSearchParams()
    if (taxYear) params.set('taxYear', taxYear)
    if (source) params.set('source', source)
    if (types.length > 0) params.set('type', types.join(','))
    if (subType) params.set('subType', subType)
    if (search.trim()) params.set('search', search.trim())
    if (!filtered) params.set('filtered', 'off')
    if (followUpOnly) params.set('followUp', 'true')
    if (entityFilter) params.set('entity', entityFilter)
    if (categoryFilter === '_none') params.set('taxCategory', '_none')
    else if (categoryFilter) params.set('taxCategory', categoryFilter)
    return params
  }

  useEffect(() => {
    // Clear URL params after reading them — they were only there to seed
    // the initial filter state (e.g. Dashboard click-through).
    if (
      searchParams.has('taxCategory') ||
      searchParams.has('subType') ||
      searchParams.has('search')
    ) {
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/transactions/meta/options')
      .then((res) => res.json())
      .then((data) => setOptions(data))
      .catch((err) => console.error('Failed to fetch options:', err))
    fetch('/api/tax-categories')
      .then((res) => res.json())
      .then((data) => setTaxCategories(data))
      .catch((err) => console.error('Failed to fetch tax categories:', err))
    fetch('/api/sources')
      .then((res) => res.json())
      .then((data: SourceInfo[]) => {
        const map: Record<string, string> = {}
        data.forEach((s) => { map[s.key] = s.label })
        setSourceMap(map)
      })
      .catch((err) => console.error('Failed to fetch sources:', err))
    fetch('/api/sub-types')
      .then((res) => res.json())
      .then((data: SubTypeOption[]) => {
        setSavedSubTypes(data.map((subType) => subType.label))
      })
      .catch((err) => console.error('Failed to fetch sub-types:', err))
  }, [])

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    const params = buildFilterParams()
    params.set('page', String(page))
    params.set('limit', '50')

    try {
      const res = await fetch(`/api/transactions?${params}`)
      const data = await res.json()
      setTransactions(data.transactions)
      setTotalAmount(data.totalAmount)
      setTotalNetAmount(data.totalNetAmount)
      setPagination(data.pagination)
      setTypeCounts(data.typeCounts || [])
    } catch (err) {
      console.error('Failed to fetch transactions:', err)
    } finally {
      setLoading(false)
    }
  }, [page, taxYear, source, types, subType, search, filtered, followUpOnly, entityFilter, categoryFilter])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [taxYear, source, types, subType, search, filtered, followUpOnly, entityFilter, categoryFilter])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (typesRef.current && !typesRef.current.contains(e.target as Node)) {
        setTypesOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (editingDescriptionId && descriptionInputRef.current) {
      descriptionInputRef.current.focus()
      descriptionInputRef.current.select()
    }
  }, [editingDescriptionId])

  function toggleType(t: string) {
    setTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  function pushUndo(label: string, fn: () => Promise<void>) {
    undoStack.current.push({ label, fn })
    setUndoLabel(label)
  }

  async function handleUndo() {
    const action = undoStack.current.pop()
    if (!action) return
    await action.fn()
    fetchTransactions()
    const prev = undoStack.current[undoStack.current.length - 1]
    setUndoLabel(prev?.label || '')
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function formatAmount(amount: number) {
    const abs = Math.abs(amount).toFixed(2)
    return amount < 0 ? `-$${abs}` : `$${abs}`
  }

  function startDescriptionEdit(t: Transaction) {
    setEditingDescriptionId(t._id)
    setDescriptionDraft(t.description)
  }

  function cancelDescriptionEdit() {
    setEditingDescriptionId(null)
    setDescriptionDraft('')
    setSavingDescriptionId(null)
  }

  function getSubTypeOptions(currentSubType?: string) {
    return Array.from(
      new Set([
        ...savedSubTypes,
        ...(currentSubType ? [currentSubType] : []),
      ])
    ).sort((a, b) => a.localeCompare(b))
  }

  async function handleFollowUp(t: Transaction) {
    try {
      const res = await fetch(`/api/transactions/${t._id}/followup`, { method: 'PATCH' })
      const updated = await res.json()
      setTransactions((prev) =>
        prev.map((tx) =>
          tx.description === t.description ? { ...tx, followUp: updated.followUp } : tx
        )
      )
      pushUndo(`Follow up "${t.description.slice(0, 30)}"`, async () => {
        await fetch(`/api/transactions/${t._id}/followup`, { method: 'PATCH' })
      })
    } catch (err) {
      console.error('Failed to toggle follow-up:', err)
    }
  }

  async function handleCategoryChange(t: Transaction, newCategory: string) {
    const prevCategory = t.taxCategory || ''
    try {
      const res = await fetch(`/api/transactions/${t._id}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxCategory: newCategory || null }),
      })
      const updated = await res.json()
      if (categoryFilter) {
        fetchTransactions()
      } else {
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.description === t.description ? { ...tx, taxCategory: updated.taxCategory } : tx
          )
        )
      }
      const label = newCategory
        ? `Category → ${newCategory}`
        : 'Clear category'
      pushUndo(label, async () => {
        await fetch(`/api/transactions/${t._id}/category`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taxCategory: prevCategory || null }),
        })
      })
    } catch (err) {
      console.error('Failed to set category:', err)
    }
  }

  async function handleEntityChange(t: Transaction, newEntity: string) {
    const prevEntity = t.entity || ''
    try {
      const res = await fetch(`/api/transactions/${t._id}/entity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: newEntity || null }),
      })
      const updated = await res.json()
      if (entityFilter) {
        fetchTransactions()
      } else {
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.source === t.source && tx.description === t.description
              ? { ...tx, entity: updated.entity }
              : tx
          )
        )
      }
      const label = newEntity
        ? `Entity → ${newEntity}`
        : 'Clear entity'
      pushUndo(label, async () => {
        await fetch(`/api/transactions/${t._id}/entity`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity: prevEntity || null }),
        })
      })
    } catch (err) {
      console.error('Failed to set entity:', err)
    }
  }

  async function handleSubTypeChange(t: Transaction, newSubType: string) {
    const prevSubType = t.subType || ''
    try {
      const res = await fetch(`/api/transactions/${t._id}/subtype`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subType: newSubType || null }),
      })
      const updated = await res.json()
      const nextSubType = updated.subType || ''

      if (subType && subType !== nextSubType) {
        fetchTransactions()
      } else {
        setTransactions((prev) =>
          prev.map((tx) =>
            tx._id === t._id ? { ...tx, subType: updated.subType } : tx
          )
        )
      }

      const label = newSubType
        ? `Sub-type → ${newSubType}`
        : 'Clear sub-type'
      pushUndo(label, async () => {
        await fetch(`/api/transactions/${t._id}/subtype`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subType: prevSubType || null }),
        })
      })
    } catch (err) {
      console.error('Failed to set sub-type:', err)
    }
  }

  async function saveDescription(t: Transaction) {
    if (savingDescriptionId === t._id) return

    const nextDescription = descriptionDraft.trim()
    if (!nextDescription || nextDescription === t.description) {
      cancelDescriptionEdit()
      return
    }

    setSavingDescriptionId(t._id)
    const prevDescription = t.description

    try {
      const res = await fetch(`/api/transactions/${t._id}/description`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: nextDescription }),
      })

      if (!res.ok) {
        throw new Error('Failed to update description')
      }

      const updated = await res.json()
      pushUndo(`Description → "${nextDescription.slice(0, 24)}"`, async () => {
        await fetch(`/api/transactions/${t._id}/description`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: prevDescription }),
        })
      })

      setTransactions((prev) =>
        prev.map((tx) =>
          tx._id === t._id ? { ...tx, description: updated.description } : tx
        )
      )
      cancelDescriptionEdit()
      fetchTransactions()
    } catch (err) {
      console.error('Failed to update description:', err)
      setSavingDescriptionId(null)
    }
  }

  async function handleIgnore(t: Transaction) {
    let pattern = t.description
    if (confirmIgnore) {
      const result = prompt(
        'Ignore all transactions matching this pattern:',
        t.description
      )
      if (!result) return
      pattern = result
    }
    try {
      const res = await fetch('/api/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern,
          source: t.source,
          reason: 'Ignored from transactions',
        }),
      })
      const created = await res.json()
      pushUndo(`Ignore "${pattern}"`, async () => {
        await fetch(`/api/filters/${created._id}`, { method: 'DELETE' })
      })
      fetchTransactions()
    } catch (err) {
      console.error('Failed to create filter:', err)
    }
  }

  async function handleDelete(t: Transaction) {
    if (!confirm(`Delete this transaction?\n\n${t.description}`)) return
    try {
      await fetch(`/api/transactions/${t._id}`, { method: 'DELETE' })
      fetchTransactions()
    } catch (err) {
      console.error('Failed to delete transaction:', err)
    }
  }

  async function handleBulkDelete() {
    const count = pagination?.total || 0
    if (!count) return
    if (!confirm(`Delete ${count.toLocaleString()} transactions matching current filters?\n\nThis cannot be undone.`)) return

    try {
      const res = await fetch(`/api/transactions/bulk?${buildFilterParams()}`, { method: 'DELETE' })
      const data = await res.json()
      alert(`Deleted ${data.deleted.toLocaleString()} transactions.`)
      fetchTransactions()
    } catch (err) {
      console.error('Failed to bulk delete:', err)
    }
  }

  function handleApplyExpensePercent() {
    const count = pagination?.total || 0
    if (!count) return
    const value = expensePercentInput.trim() === '' ? null : Number(expensePercentInput)
    if (value !== null && (isNaN(value) || value < 0 || value > 100)) {
      setExpenseModal({ open: true, value: null, count: 0, status: 'confirm' })
      return
    }
    setExpenseModal({ open: true, value, count, status: 'confirm' })
  }

  async function confirmExpensePercent() {
    const { value } = expenseModal
    setExpenseModal((m) => ({ ...m, status: 'applying' }))
    const label = value !== null ? `${value}%` : 'clear'

    try {
      const res = await fetch(`/api/transactions/bulk/expense-percent?${buildFilterParams()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expensePercent: value }),
      })
      const data = await res.json()
      pushUndo(`Expense ${label}`, async () => {
        await fetch(`/api/transactions/bulk/expense-percent?${buildFilterParams()}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expensePercent: 100 }),
        })
      })
      setExpenseModal((m) => ({ ...m, status: 'done', result: data.updated }))
      fetchTransactions()
    } catch (err) {
      console.error('Failed to apply expense percent:', err)
      setExpenseModal((m) => ({ ...m, open: false }))
    }
  }

  return (
    <div>
      <div className="transactions-header">
        <h1>Transactions</h1>
        {pagination && (
          <span className="transactions-count">
            {pagination.total.toLocaleString()} total
          </span>
        )}
        {pagination && pagination.total > 0 && (
          <a
            className="btn-download-csv"
            href={`/api/transactions/export/csv?${buildFilterParams()}`}
            download="transactions.csv"
          >
            Download CSV
          </a>
        )}
      </div>

      <div className="filters">
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {options.sources.map((s) => (
            <option key={s} value={s}>
              {sourceMap[s] || s}
            </option>
          ))}
        </select>
        <div className="multi-select" ref={typesRef}>
          <button
            className="multi-select-btn"
            onClick={() => setTypesOpen((o) => !o)}
          >
            {types.length === 0
              ? 'All types'
              : `${types.length} type${types.length > 1 ? 's' : ''}`}
          </button>
          {typesOpen && (
            <div className="multi-select-dropdown">
              {options.types.map((t) => (
                <label key={t} className="multi-select-item">
                  <input
                    type="checkbox"
                    checked={types.includes(t)}
                    onChange={() => toggleType(t)}
                  />
                  {t}
                </label>
              ))}
              {types.length > 0 && (
                <button
                  className="multi-select-clear"
                  onClick={() => setTypes([])}
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
        {options.subTypes.length > 0 && (
          <select value={subType} onChange={(e) => setSubType(e.target.value)}>
            <option value="">All sub-types</option>
            {options.subTypes.map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        )}
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          <option value="_none">Uncategorised</option>
          <optgroup label="Income">
            {taxCategories
              .filter((c) => c.type === 'income')
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}: {c.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Deductions">
            {taxCategories
              .filter((c) => c.type === 'deduction')
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}: {c.name}
                </option>
              ))}
          </optgroup>
        </select>
        <input
          type="text"
          placeholder="Search description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={`filter-toggle-btn ${filtered ? 'filter-on' : 'filter-off'}`}
          onClick={() => setFiltered((f) => !f)}
        >
          Apply Filters: {filtered ? 'On' : 'Off'}
        </button>
        <button
          className={`filter-toggle-btn ${followUpOnly ? 'followup-filter-on' : 'filter-off'}`}
          onClick={() => setFollowUpOnly((f) => !f)}
        >
          Follow up: {followUpOnly ? 'On' : 'Off'}
        </button>
        <label className="confirm-toggle">
          <input
            type="checkbox"
            checked={confirmIgnore}
            onChange={(e) => setConfirmIgnore(e.target.checked)}
          />
          Confirm ignore
        </label>
        {undoLabel && (
          <button className="undo-btn" onClick={handleUndo}>
            Undo: {undoLabel}
          </button>
        )}
        {canEdit && pagination && pagination.total > 0 && (
          <button className="btn-bulk-delete" onClick={handleBulkDelete}>
            Delete All ({pagination.total.toLocaleString()})
          </button>
        )}
        {pagination && pagination.total > 0 && (
          <div className="expense-percent-group">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder="Expense %"
              value={expensePercentInput}
              onChange={(e) => setExpensePercentInput(e.target.value)}
              className="expense-percent-input"
            />
            <button
              className="btn-expense-apply"
              onClick={handleApplyExpensePercent}
            >
              Apply %
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : transactions.length === 0 ? (
        <p className="empty-state">No transactions match your filters.</p>
      ) : (
        <>
          {typeCounts.length > 0 && (
            <div className="type-summary">
              {typeCounts.map((tc) => (
                <span key={tc.type} className={`type-chip badge-${tc.type.split('-')[0]}`}>
                  {tc.type} <span className="type-chip-count">{tc.count}</span>
                </span>
              ))}
            </div>
          )}

          <table className="transactions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Entity</th>
                <th></th>
                <th>Type</th>
                <th>Sub Type</th>
                <th>Source</th>
                <th>Description</th>
                <th className="col-right">Amount</th>
                <th className="col-right">Expense %</th>
                <th className="col-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
              <React.Fragment key={t._id}>
                <tr
                  className={t.followUp ? 'row-followup' : ''}
                >
                  <td className="col-date">
                    {new Date(t.date).toLocaleDateString('en-AU')}
                  </td>
                  <td>
                    <select
                      className="category-select"
                      value={t.taxCategory || ''}
                      onChange={(e) => handleCategoryChange(t, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={!canEdit}
                    >
                      <option value="">—</option>
                      <optgroup label="Income">
                        {taxCategories
                          .filter((c) => c.type === 'income')
                          .map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code}: {c.name}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Deductions">
                        {taxCategories
                          .filter((c) => c.type === 'deduction')
                          .map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code}: {c.name}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </td>
                  <td>
                    <select
                      className="entity-select"
                      value={t.entity || ''}
                      onChange={(e) => handleEntityChange(t, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={!canEdit}
                    >
                      <option value="">—</option>
                      {entities.map((e) => (
                        <option key={e.key} value={e.key}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {canEdit && (
                      <button
                        className="ignore-btn"
                        onClick={(e) => { e.stopPropagation(); handleIgnore(t) }}
                      >
                        Ignore
                      </button>
                    )}
                    {canEdit && (
                      <button
                        className={`followup-btn ${t.followUp ? 'followup-active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handleFollowUp(t) }}
                      >
                        {t.followUp ? 'Following up...' : 'Follow up'}
                      </button>
                    )}
                    {(t.attachmentCount ?? 0) > 0 ? (
                      <button
                        type="button"
                        className="attach-btn attach-btn-attached attach-attached-badge"
                        title="Open / download attachment"
                        aria-label="Open or download attachment"
                        onClick={(e) => {
                          e.stopPropagation()
                          void openAttachmentsForTx(t._id)
                        }}
                      >
                        ✓ Attached{t.attachmentCount! > 1 ? ` (${t.attachmentCount})` : ''}
                        <span className="paperclip-icon" aria-hidden="true">📎</span>
                      </button>
                    ) : (
                      canEdit && (
                        <button
                          className="attach-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedAttachment(
                              expandedAttachment === t._id ? null : t._id,
                            )
                          }}
                        >
                          Attach
                        </button>
                      )
                    )}
                    {canEdit && (
                      <button
                        className="btn-delete-row"
                        onClick={(e) => { e.stopPropagation(); handleDelete(t) }}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${t.type.split('-')[0]}`}>
                      {t.type}
                    </span>
                  </td>
                  <td>
                    <select
                      className="subtype-select"
                      value={t.subType || ''}
                      onChange={(e) => handleSubTypeChange(t, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={!canEdit}
                    >
                      <option value="">—</option>
                      {getSubTypeOptions(t.subType).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{sourceMap[t.source] || t.source}</td>
                  <td className="col-desc">
                    {editingDescriptionId === t._id ? (
                      <input
                        ref={descriptionInputRef}
                        className="description-input"
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        onBlur={() => saveDescription(t)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveDescription(t)
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            cancelDescriptionEdit()
                          }
                        }}
                        disabled={savingDescriptionId === t._id}
                      />
                    ) : (
                      <div className="description-cell">
                        <button
                          className="description-edit-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            startDescriptionEdit(t)
                          }}
                        >
                          Edit
                        </button>
                        <span
                          className="description-text"
                          onClick={() => startDescriptionEdit(t)}
                          title={t.description}
                        >
                          {t.description}
                        </span>
                      </div>
                    )}
                  </td>
                  <td
                    className={`col-right ${t.amount >= 0 ? 'amount-pos' : 'amount-neg'}`}
                  >
                    {formatAmount(t.amount)}
                  </td>
                  <td className="col-right col-expense-pct">
                    {(t.expensePercent ?? 100)}%
                  </td>
                  <td
                    className={`col-right ${t.amount * (t.expensePercent ?? 100) / 100 >= 0 ? 'amount-pos' : 'amount-neg'}`}
                  >
                    {formatAmount(t.amount * (t.expensePercent ?? 100) / 100)}
                  </td>
                </tr>
                {expandedAttachment === t._id && (
                  <tr className="attachment-row">
                    <td colSpan={11}>
                      <Attachments
                        parentId={t._id}
                        parentType="transaction"
                        onCountChange={(count) => {
                          setTransactions((prev) =>
                            prev.map((tx) =>
                              tx._id === t._id ? { ...tx, attachmentCount: count } : tx
                            )
                          )
                        }}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan={8}>Total ({pagination?.total.toLocaleString()} transactions)</td>
                <td
                  className={`col-right ${totalAmount >= 0 ? 'amount-pos' : 'amount-neg'}`}
                >
                  {formatAmount(totalAmount)}
                </td>
                <td></td>
                <td
                  className={`col-right ${totalNetAmount >= 0 ? 'amount-pos' : 'amount-neg'}`}
                >
                  {formatAmount(totalNetAmount)}
                </td>
              </tr>
            </tfoot>
          </table>

          {pagination && pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="page-info">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {expenseModal.open && (
        <div className="modal-overlay" onClick={() => expenseModal.status !== 'applying' && setExpenseModal((m) => ({ ...m, open: false }))}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {expenseModal.status === 'confirm' && expenseModal.count === 0 ? (
              <>
                <div className="modal-icon modal-icon-warn">!</div>
                <h3 className="modal-title">Invalid Value</h3>
                <p className="modal-text">Expense % must be between 0 and 100.</p>
                <div className="modal-actions">
                  <button className="modal-btn modal-btn-primary" onClick={() => setExpenseModal((m) => ({ ...m, open: false }))}>
                    OK
                  </button>
                </div>
              </>
            ) : expenseModal.status === 'confirm' ? (
              <>
                <div className="modal-icon modal-icon-expense">%</div>
                <h3 className="modal-title">Apply Expense %</h3>
                <p className="modal-text">
                  Set <strong>{expenseModal.value !== null ? `${expenseModal.value}%` : 'clear'}</strong> on{' '}
                  <strong>{expenseModal.count.toLocaleString()}</strong> transaction{expenseModal.count !== 1 ? 's' : ''} matching
                  current filters?
                </p>
                {search.trim() && (
                  <p className="modal-filter-hint">Filter: "{search.trim()}"</p>
                )}
                <div className="modal-actions">
                  <button className="modal-btn modal-btn-secondary" onClick={() => setExpenseModal((m) => ({ ...m, open: false }))}>
                    Cancel
                  </button>
                  <button className="modal-btn modal-btn-primary" onClick={confirmExpensePercent}>
                    Apply
                  </button>
                </div>
              </>
            ) : expenseModal.status === 'applying' ? (
              <>
                <div className="modal-icon modal-icon-expense modal-icon-spin">%</div>
                <h3 className="modal-title">Applying...</h3>
                <p className="modal-text">Updating transactions, please wait.</p>
              </>
            ) : (
              <>
                <div className="modal-icon modal-icon-success">&#10003;</div>
                <h3 className="modal-title">Done</h3>
                <p className="modal-text">
                  Updated <strong>{expenseModal.result?.toLocaleString()}</strong> transaction{expenseModal.result !== 1 ? 's' : ''} to{' '}
                  <strong>{expenseModal.value !== null ? `${expenseModal.value}%` : 'cleared'}</strong>.
                </p>
                <div className="modal-actions">
                  <button className="modal-btn modal-btn-primary" onClick={() => setExpenseModal((m) => ({ ...m, open: false }))}>
                    OK
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Transactions
