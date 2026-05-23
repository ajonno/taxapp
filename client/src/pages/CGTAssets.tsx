import { useEffect, useState, useCallback, useRef } from 'react'
import { useTaxYear } from '../context/TaxYearContext'
import { useAuth } from '../auth/AuthContext'
import Attachments from '../components/Attachments'
import './CGTAssets.css'

interface CostItem {
  label: string
  amount: number
}

interface CGTAsset {
  _id: string
  description: string
  assetType: string
  entity: string
  taxYear: number
  acquisitionDate: string
  acquisitionPrice: number
  costBaseItems: CostItem[]
  disposalDate: string
  disposalPrice: number
  disposalCostItems: CostItem[]
  notes: string
  totalCostBase: number
  totalDisposalCosts: number
  netProceeds: number
  capitalGainLoss: number
  heldOverOneYear: boolean
  discountApplicable: boolean
  netCapitalGain: number
}

const ASSET_TYPES = [
  { value: 'property', label: 'Property' },
  { value: 'shares', label: 'Shares' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'other', label: 'Other' },
]

const EMPTY_FORM = {
  description: '',
  assetType: 'property',
  entity: '',
  taxYear: '',
  acquisitionDate: '',
  acquisitionPrice: '',
  costBaseItems: [] as CostItem[],
  disposalDate: '',
  disposalPrice: '',
  disposalCostItems: [] as CostItem[],
  notes: '',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU')
}

function formatAmount(amount: number) {
  const abs = Math.abs(amount).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return amount < 0 ? `-$${abs}` : `$${abs}`
}

function toInputDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toISOString().split('T')[0]
}

function CGTAssets() {
  const { taxYear, entity: globalEntity, entities, taxYears } = useTaxYear()
  const { canEdit } = useAuth()
  const [assets, setAssets] = useState<CGTAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState(EMPTY_FORM)
  const [saveStatus, setSaveStatus] = useState<'' | 'saving' | 'saved'>('')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialLoad = useRef(true)

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (taxYear) params.set('taxYear', taxYear)
    if (globalEntity) params.set('entity', globalEntity)
    try {
      const res = await fetch(`/api/cgt-assets?${params}`)
      const data = await res.json()
      setAssets(data)
    } catch (err) {
      console.error('Failed to fetch CGT assets:', err)
    } finally {
      setLoading(false)
    }
  }, [taxYear, globalEntity])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  function resetForm() {
    setForm({ ...EMPTY_FORM, entity: globalEntity || '', taxYear: taxYear || '' })
    setEditingId(null)
    setShowForm(false)
  }

  function handleAdd() {
    setForm({ ...EMPTY_FORM, entity: globalEntity || '', taxYear: taxYear || '' })
    setEditingId(null)
    setShowForm(true)
  }

  function handleEdit(asset: CGTAsset) {
    setForm({
      description: asset.description,
      assetType: asset.assetType,
      entity: asset.entity,
      taxYear: String(asset.taxYear),
      acquisitionDate: toInputDate(asset.acquisitionDate),
      acquisitionPrice: String(asset.acquisitionPrice),
      costBaseItems: asset.costBaseItems.length > 0 ? [...asset.costBaseItems] : [],
      disposalDate: toInputDate(asset.disposalDate),
      disposalPrice: String(asset.disposalPrice),
      disposalCostItems: asset.disposalCostItems.length > 0 ? [...asset.disposalCostItems] : [],
      notes: asset.notes || '',
    })
    setEditingId(asset._id)
    isInitialLoad.current = true
    setShowForm(true)
  }

  async function handleSave() {
    const body = {
      description: form.description,
      assetType: form.assetType,
      entity: form.entity,
      taxYear: Number(form.taxYear),
      acquisitionDate: form.acquisitionDate,
      acquisitionPrice: Number(form.acquisitionPrice),
      costBaseItems: form.costBaseItems,
      disposalDate: form.disposalDate,
      disposalPrice: Number(form.disposalPrice),
      disposalCostItems: form.disposalCostItems,
      notes: form.notes,
    }

    try {
      const url = editingId ? `/api/cgt-assets/${editingId}` : '/api/cgt-assets'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        resetForm()
        fetchAssets()
      }
    } catch (err) {
      console.error('Failed to save CGT asset:', err)
    }
  }

  // Auto-save when editing an existing asset
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
          assetType: form.assetType,
          entity: form.entity,
          taxYear: Number(form.taxYear),
          acquisitionDate: form.acquisitionDate,
          acquisitionPrice: Number(form.acquisitionPrice),
          costBaseItems: form.costBaseItems,
          disposalDate: form.disposalDate,
          disposalPrice: Number(form.disposalPrice),
          disposalCostItems: form.disposalCostItems,
          notes: form.notes,
        }
        const res = await fetch(`/api/cgt-assets/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          setSaveStatus('saved')
          fetchAssets()
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
    if (!confirm('Delete this CGT asset?')) return
    try {
      await fetch(`/api/cgt-assets/${id}`, { method: 'DELETE' })
      fetchAssets()
    } catch (err) {
      console.error('Failed to delete CGT asset:', err)
    }
  }

  function updateCostBaseItem(index: number, field: 'label' | 'amount', value: string) {
    setForm((prev) => ({
      ...prev,
      costBaseItems: prev.costBaseItems.map((item, i) =>
        i === index
          ? { ...item, [field]: field === 'amount' ? Number(value) || 0 : value }
          : item
      ),
    }))
  }

  function updateDisposalCostItem(index: number, field: 'label' | 'amount', value: string) {
    setForm((prev) => ({
      ...prev,
      disposalCostItems: prev.disposalCostItems.map((item, i) =>
        i === index
          ? { ...item, [field]: field === 'amount' ? Number(value) || 0 : value }
          : item
      ),
    }))
  }

  // Live preview calculations
  const previewAcqPrice = Number(form.acquisitionPrice) || 0
  const previewCostItems = form.costBaseItems.reduce((s, i) => s + (i.amount || 0), 0)
  const previewTotalCostBase = previewAcqPrice + previewCostItems
  const previewDispPrice = Number(form.disposalPrice) || 0
  const previewDispCosts = form.disposalCostItems.reduce((s, i) => s + (i.amount || 0), 0)
  const previewNetProceeds = previewDispPrice - previewDispCosts
  const previewGainLoss = previewNetProceeds - previewTotalCostBase

  // Totals
  const totalNetCG = assets.reduce((sum, a) => sum + a.netCapitalGain, 0)

  const canSave =
    form.description.trim() &&
    form.assetType &&
    form.entity &&
    form.taxYear &&
    form.acquisitionDate &&
    form.acquisitionPrice &&
    form.disposalDate &&
    form.disposalPrice

  return (
    <div>
      <h1>CGT Assets</h1>
      {!showForm && canEdit && (
        <button className="btn-primary" onClick={handleAdd} style={{ marginBottom: '1rem' }}>
          Add Asset
        </button>
      )}

      {showForm && (
        <div className="cgt-form">
          <h2>{editingId ? 'Edit Asset' : 'Add Asset'}</h2>

          <div className="cgt-form-top">
            <div className="form-group">
              <label>Description</label>
              <input
                type="text"
                placeholder="e.g. 123 Smith St, Sydney"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Asset Type</label>
              <select
                value={form.assetType}
                onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value }))}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
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
              <label>Tax Year (disposal)</label>
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
          </div>

          <div className="cgt-form-grid">
            <div className="cgt-form-section">
              <h3>Acquisition</h3>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={form.acquisitionDate}
                  onChange={(e) => setForm((f) => ({ ...f, acquisitionDate: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Purchase Price</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.acquisitionPrice}
                  onChange={(e) => setForm((f) => ({ ...f, acquisitionPrice: e.target.value }))}
                />
              </div>
              <div className="cost-items">
                <label>Cost Base Items</label>
                {form.costBaseItems.map((item, i) => (
                  <div key={i} className="cost-item-row">
                    <input
                      type="text"
                      placeholder="e.g. Stamp duty"
                      value={item.label}
                      onChange={(e) => updateCostBaseItem(i, 'label', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={item.amount || ''}
                      onChange={(e) => updateCostBaseItem(i, 'amount', e.target.value)}
                    />
                    <button
                      className="btn-remove"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          costBaseItems: f.costBaseItems.filter((_, j) => j !== i),
                        }))
                      }
                    >
                      x
                    </button>
                  </div>
                ))}
                <button
                  className="btn-add-item"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      costBaseItems: [...f.costBaseItems, { label: '', amount: 0 }],
                    }))
                  }
                >
                  + Add cost item
                </button>
              </div>
            </div>

            <div className="cgt-form-section">
              <h3>Disposal</h3>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={form.disposalDate}
                  onChange={(e) => setForm((f) => ({ ...f, disposalDate: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Sale Price</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.disposalPrice}
                  onChange={(e) => setForm((f) => ({ ...f, disposalPrice: e.target.value }))}
                />
              </div>
              <div className="cost-items">
                <label>Disposal Costs</label>
                {form.disposalCostItems.map((item, i) => (
                  <div key={i} className="cost-item-row">
                    <input
                      type="text"
                      placeholder="e.g. Agent commission"
                      value={item.label}
                      onChange={(e) => updateDisposalCostItem(i, 'label', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={item.amount || ''}
                      onChange={(e) => updateDisposalCostItem(i, 'amount', e.target.value)}
                    />
                    <button
                      className="btn-remove"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          disposalCostItems: f.disposalCostItems.filter((_, j) => j !== i),
                        }))
                      }
                    >
                      x
                    </button>
                  </div>
                ))}
                <button
                  className="btn-add-item"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      disposalCostItems: [...f.disposalCostItems, { label: '', amount: 0 }],
                    }))
                  }
                >
                  + Add cost item
                </button>
              </div>
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
            <Attachments parentId={editingId} parentType="cgt-asset" />
          )}

          <div className="cgt-preview">
            <div className="preview-row">
              <span>Total Cost Base</span>
              <span>{formatAmount(previewTotalCostBase)}</span>
            </div>
            <div className="preview-row">
              <span>Net Proceeds</span>
              <span>{formatAmount(previewNetProceeds)}</span>
            </div>
            <div className={`preview-row preview-result ${previewGainLoss >= 0 ? 'amount-pos' : 'amount-neg'}`}>
              <span>Capital {previewGainLoss >= 0 ? 'Gain' : 'Loss'}</span>
              <span>{formatAmount(previewGainLoss)}</span>
            </div>
          </div>

          <div className="cgt-form-actions">
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
      ) : assets.length === 0 && !showForm ? (
        <p className="empty-state">No CGT assets for the selected period.</p>
      ) : assets.length > 0 ? (
        <table className="cgt-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Type</th>
              <th>Acquired</th>
              <th className="col-right">Cost Base</th>
              <th>Disposed</th>
              <th className="col-right">Net Proceeds</th>
              <th className="col-right">Gain/Loss</th>
              <th>Discount</th>
              <th className="col-right">Net CG</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a._id}>
                <td>{a.description}</td>
                <td>
                  <span className={`badge badge-${a.assetType}`}>{a.assetType}</span>
                </td>
                <td className="col-date">{formatDate(a.acquisitionDate)}</td>
                <td className="col-right">{formatAmount(a.totalCostBase)}</td>
                <td className="col-date">{formatDate(a.disposalDate)}</td>
                <td className="col-right">{formatAmount(a.netProceeds)}</td>
                <td className={`col-right ${a.capitalGainLoss >= 0 ? 'amount-pos' : 'amount-neg'}`}>
                  {formatAmount(a.capitalGainLoss)}
                </td>
                <td>{a.discountApplicable ? '50%' : '—'}</td>
                <td className={`col-right ${a.netCapitalGain >= 0 ? 'amount-pos' : 'amount-neg'}`}>
                  {formatAmount(a.netCapitalGain)}
                </td>
                <td className="col-actions">
                  {canEdit && (
                    <>
                      <button className="btn-edit" onClick={() => handleEdit(a)}>Edit</button>
                      <button className="btn-delete" onClick={() => handleDelete(a._id)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan={8}>Total Net Capital Gain</td>
              <td className={`col-right ${totalNetCG >= 0 ? 'amount-pos' : 'amount-neg'}`}>
                {formatAmount(totalNetCG)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      ) : null}
    </div>
  )
}

export default CGTAssets
