import { useEffect, useState, useCallback, useRef } from 'react'
import { useTaxYear } from '../context/TaxYearContext'
import { useAuth } from '../auth/AuthContext'
import Attachments from '../components/Attachments'
import './Income.css'

interface IncomeEntry {
  _id: string
  description: string
  incomeType: string
  amount: number
  entity: string
  taxYear: number
  date: string
  payer: string
  notes: string
}

const INCOME_TYPES = [
  { value: 'salary', label: 'Salary / Wages' },
  { value: 'rental', label: 'Rental Income' },
  { value: 'interest', label: 'Interest' },
  { value: 'dividend', label: 'Dividends' },
  { value: 'business', label: 'Business Income' },
  { value: 'foreign', label: 'Foreign Income' },
  { value: 'other', label: 'Other' },
]

const EMPTY_FORM = {
  description: '',
  incomeType: 'salary',
  amount: '',
  entity: '',
  taxYear: '',
  date: '',
  payer: '',
  notes: '',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU')
}

function formatAmount(amount: number) {
  return '$' + amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toInputDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toISOString().split('T')[0]
}

function Income() {
  const { taxYear, entity: globalEntity, entities, taxYears } = useTaxYear()
  const { canEdit } = useAuth()
  const [items, setItems] = useState<IncomeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saveStatus, setSaveStatus] = useState<'' | 'saving' | 'saved'>('')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialLoad = useRef(true)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (taxYear) params.set('taxYear', taxYear)
    if (globalEntity) params.set('entity', globalEntity)
    try {
      const res = await fetch(`/api/income?${params}`)
      const data = await res.json()
      setItems(data)
    } catch (err) {
      console.error('Failed to fetch income:', err)
    } finally {
      setLoading(false)
    }
  }, [taxYear, globalEntity])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  function resetForm() {
    setForm({ ...EMPTY_FORM, entity: globalEntity || '', taxYear: taxYear || '' })
    setEditingId(null)
    setShowForm(false)
    setSaveStatus('')
  }

  function handleAdd() {
    setForm({ ...EMPTY_FORM, entity: globalEntity || '', taxYear: taxYear || '' })
    setEditingId(null)
    setShowForm(true)
  }

  function handleEdit(item: IncomeEntry) {
    setForm({
      description: item.description,
      incomeType: item.incomeType,
      amount: String(item.amount),
      entity: item.entity,
      taxYear: String(item.taxYear),
      date: toInputDate(item.date),
      payer: item.payer || '',
      notes: item.notes || '',
    })
    setEditingId(item._id)
    isInitialLoad.current = true
    setShowForm(true)
  }

  async function handleSave() {
    const body = {
      description: form.description,
      incomeType: form.incomeType,
      amount: Number(form.amount),
      entity: form.entity,
      taxYear: Number(form.taxYear),
      date: form.date,
      payer: form.payer,
      notes: form.notes,
    }

    try {
      const url = editingId ? `/api/income/${editingId}` : '/api/income'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        resetForm()
        fetchItems()
      }
    } catch (err) {
      console.error('Failed to save income:', err)
    }
  }

  // Auto-save when editing
  useEffect(() => {
    if (!editingId) return
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        const body = {
          description: form.description,
          incomeType: form.incomeType,
          amount: Number(form.amount),
          entity: form.entity,
          taxYear: Number(form.taxYear),
          date: form.date,
          payer: form.payer,
          notes: form.notes,
        }
        const res = await fetch(`/api/income/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          setSaveStatus('saved')
          fetchItems()
          setTimeout(() => setSaveStatus(''), 2000)
        }
      } catch (err) {
        console.error('Auto-save failed:', err)
        setSaveStatus('')
      }
    }, 800)

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [form, editingId])

  async function handleDelete(id: string) {
    if (!confirm('Delete this income entry?')) return
    try {
      await fetch(`/api/income/${id}`, { method: 'DELETE' })
      fetchItems()
    } catch (err) {
      console.error('Failed to delete income:', err)
    }
  }

  const canSave =
    form.description.trim() &&
    form.incomeType &&
    form.amount &&
    form.entity &&
    form.taxYear &&
    form.date

  const total = items.reduce((sum, i) => sum + i.amount, 0)

  return (
    <div>
      <h1>Income</h1>
      {!showForm && canEdit && (
        <button className="btn-primary" onClick={handleAdd} style={{ marginBottom: '1rem' }}>
          Add Income
        </button>
      )}

      {showForm && (
        <div className="income-form">
          <h2>{editingId ? 'Edit Income' : 'Add Income'}</h2>

          <div className="income-form-grid">
            <div className="form-group">
              <label>Description</label>
              <input
                type="text"
                placeholder="e.g. Annual salary from Employer Pty Ltd"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Income Type</label>
              <select
                value={form.incomeType}
                onChange={(e) => setForm((f) => ({ ...f, incomeType: e.target.value }))}
              >
                {INCOME_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Amount (gross)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Entity</label>
              <select
                value={form.entity}
                onChange={(e) => setForm((f) => ({ ...f, entity: e.target.value }))}
              >
                <option value="">Select...</option>
                {entities.map((e) => (
                  <option key={e.key} value={e.key}>{e.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Tax Year</label>
              <select
                value={form.taxYear}
                onChange={(e) => setForm((f) => ({ ...f, taxYear: e.target.value }))}
              >
                <option value="">Select...</option>
                {taxYears.map((y) => (
                  <option key={y} value={y}>
                    {y - 1}-{y}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Payer</label>
              <input
                type="text"
                placeholder="e.g. Employer name"
                value={form.payer}
                onChange={(e) => setForm((f) => ({ ...f, payer: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes..."
              rows={2}
            />
          </div>

          {editingId && (
            <Attachments parentId={editingId} parentType="income" />
          )}

          <div className="income-form-actions">
            {!editingId && (
              <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
                Save
              </button>
            )}
            {editingId && saveStatus === 'saving' && (
              <span className="autosave-status">Saving...</span>
            )}
            {editingId && saveStatus === 'saved' && (
              <span className="autosave-status autosave-done">Saved</span>
            )}
            <button className="btn-secondary" onClick={resetForm}>
              {editingId ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : items.length === 0 && !showForm ? (
        <p className="empty-state">No income entries for the selected period.</p>
      ) : items.length > 0 ? (
        <table className="income-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Type</th>
              <th>Payer</th>
              <th className="col-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id}>
                <td className="col-date">{formatDate(item.date)}</td>
                <td>{item.description}</td>
                <td>
                  <span className={`badge badge-${item.incomeType}`}>
                    {INCOME_TYPES.find((t) => t.value === item.incomeType)?.label || item.incomeType}
                  </span>
                </td>
                <td className="col-payer">{item.payer}</td>
                <td className="col-right amount-pos">{formatAmount(item.amount)}</td>
                <td className="col-actions">
                  {canEdit && (
                    <>
                      <button className="btn-edit" onClick={() => handleEdit(item)}>Edit</button>
                      <button className="btn-delete" onClick={() => handleDelete(item._id)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan={4}>Total Income</td>
              <td className="col-right amount-pos">{formatAmount(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      ) : null}
    </div>
  )
}

export default Income
