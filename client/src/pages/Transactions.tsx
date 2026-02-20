import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTaxYear } from '../context/TaxYearContext'
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

function Transactions() {
  const { taxYear, entity: entityFilter, entities } = useTaxYear()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [totalAmount, setTotalAmount] = useState(0)
  const [typeCounts, setTypeCounts] = useState<{ type: string; count: number }[]>([])
  const [options, setOptions] = useState<Options>({ sources: [], types: [], subTypes: [] })
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([])
  const [sourceMap, setSourceMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [source, setSource] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [typesOpen, setTypesOpen] = useState(false)
  const typesRef = useRef<HTMLDivElement>(null)
  const [subType, setSubType] = useState('')
  const [search, setSearch] = useState('')
  const [filtered, setFiltered] = useState(true)
  const [followUpOnly, setFollowUpOnly] = useState(false)
  const [confirmIgnore, setConfirmIgnore] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get('taxCategory') || '')
  const [page, setPage] = useState(1)
  const [expandedAttachment, setExpandedAttachment] = useState<string | null>(null)
  const [undoLabel, setUndoLabel] = useState('')
  const undoStack = useRef<Array<{ label: string; fn: () => Promise<void> }>>([])

  useEffect(() => {
    // Clear URL params after reading them
    if (searchParams.has('taxCategory')) {
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
  }, [])

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', '50')
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

    try {
      const res = await fetch(`/api/transactions?${params}`)
      const data = await res.json()
      setTransactions(data.transactions)
      setTotalAmount(data.totalAmount)
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

  return (
    <div>
      <div className="transactions-header">
        <h1>Transactions</h1>
        {pagination && (
          <span className="transactions-count">
            {pagination.total.toLocaleString()} total
          </span>
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
                    <button
                      className="ignore-btn"
                      onClick={(e) => { e.stopPropagation(); handleIgnore(t) }}
                    >
                      Ignore
                    </button>
                    <button
                      className={`followup-btn ${t.followUp ? 'followup-active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleFollowUp(t) }}
                    >
                      {t.followUp ? 'Following up...' : 'Follow up'}
                    </button>
                    <button
                      className="attach-btn"
                      onClick={(e) => { e.stopPropagation(); setExpandedAttachment(expandedAttachment === t._id ? null : t._id) }}
                    >
                      Attach
                    </button>
                  </td>
                  <td>
                    <span className={`badge badge-${t.type.split('-')[0]}`}>
                      {t.type}
                    </span>
                  </td>
                  <td>
                    {t.subType && (
                      <span className={`badge badge-side-${t.subType.toLowerCase()}`}>
                        {t.subType}
                      </span>
                    )}
                  </td>
                  <td>{sourceMap[t.source] || t.source}</td>
                  <td className="col-desc">{t.description}</td>
                  <td
                    className={`col-right ${t.amount >= 0 ? 'amount-pos' : 'amount-neg'}`}
                  >
                    {formatAmount(t.amount)}
                  </td>
                </tr>
                {expandedAttachment === t._id && (
                  <tr className="attachment-row">
                    <td colSpan={9}>
                      <Attachments parentId={t._id} parentType="transaction" />
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
    </div>
  )
}

export default Transactions
