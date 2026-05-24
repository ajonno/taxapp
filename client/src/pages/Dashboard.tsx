import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTaxYear } from '../context/TaxYearContext'
import './Dashboard.css'

interface CategorySummary {
  taxCategory: string | null
  total: number
  claimTotal: number
  count: number
  /** Number of transactions in this category that have at least one attachment. */
  attachedCount?: number
  subTypes: {
    subType: string
    total: number
    claimTotal: number
    count: number
    attachedCount?: number
  }[]
  descriptions: {
    description: string
    total: number
    claimTotal: number
    count: number
    attachedCount?: number
  }[]
}

interface TaxCategory {
  code: string
  name: string
  type: 'income' | 'deduction'
}

function formatTaxYear(year: number) {
  return `FY ${year - 1}-${String(year).slice(2)}`
}

function Dashboard() {
  const navigate = useNavigate()
  const { taxYear, entity, entities } = useTaxYear()

  function getSortedSubTypes(summary: CategorySummary | undefined) {
    return [...(summary?.subTypes || [])].sort((a, b) => {
      const diff = Math.abs(b.claimTotal || b.total) - Math.abs(a.claimTotal || a.total)
      return diff !== 0 ? diff : a.subType.localeCompare(b.subType)
    })
  }

  function getSortedDescriptions(summary: CategorySummary | undefined) {
    return [...(summary?.descriptions || [])].sort((a, b) => {
      const diff = Math.abs(b.claimTotal || b.total) - Math.abs(a.claimTotal || a.total)
      return diff !== 0 ? diff : a.description.localeCompare(b.description)
    })
  }

  function goToCategory(code: string | null) {
    navigate(`/transactions?taxCategory=${code || '_none'}`)
  }

  function goToSubType(code: string, subType: string) {
    // The backend labels missing/null subTypes as "Unspecified" in the
    // dashboard summary. Translate back to the _none magic value so the
    // transactions API filters for docs without a subType.
    const value = subType === 'Unspecified' ? '_none' : subType
    const params = new URLSearchParams({ taxCategory: code, subType: value })
    navigate(`/transactions?${params.toString()}`)
  }

  function goToDescription(code: string, description: string) {
    const params = new URLSearchParams({ taxCategory: code, search: description })
    navigate(`/transactions?${params.toString()}`)
  }

  /**
   * Download every receipt attached to transactions matching the given
   * filter combination. Confirms count with the user first; opens each
   * matching Drive file in a new tab on confirm.
   */
  async function downloadReceiptsForFilter(opts: {
    taxCategory: string
    subType?: string
    description?: string
    /** Used in the confirm dialog, e.g. "computer & software" */
    label: string
    /** Pre-known count for the confirm dialog (saves an extra HEAD). */
    expectedCount?: number
  }) {
    const params = new URLSearchParams()
    if (taxYear) params.set('taxYear', taxYear)
    if (entity) params.set('entity', entity)
    params.set('taxCategory', opts.taxCategory)
    if (opts.subType) params.set('subType', opts.subType)
    if (opts.description) params.set('description', opts.description)

    const n = opts.expectedCount ?? 0
    if (n > 0) {
      if (!confirm(`This will download ${n} file${n === 1 ? '' : 's'} for ${opts.label} as a single ZIP. Continue?`)) {
        return
      }
    }

    // Hit the server-side ZIP endpoint via auth-fetch wrapper so the
    // Firebase token is attached, then trigger one download from the
    // returned blob. Avoids Chrome's multi-file download warning entirely.
    try {
      const res = await fetch(`/api/transactions/meta/receipts-zip?${params}`)
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const body = await res.json()
          if (body?.error) msg = body.error
        } catch {
          /* not JSON */
        }
        alert(`Couldn't build receipts ZIP: ${msg}`)
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const m = cd.match(/filename="?([^"]+)"?/)
      const filename = m ? m[1] : `Receipts_${opts.label.replace(/[^a-z0-9_-]+/gi, '_')}.zip`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
    } catch (err) {
      alert(`Couldn't download receipts: ${(err as Error).message}`)
    }
  }
  const [categorySummary, setCategorySummary] = useState<CategorySummary[]>([])
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([])
  const [cgtSummary, setCgtSummary] = useState<{
    count: number
    totalGains: number
    totalLosses: number
    totalNetCapitalGain: number
  } | null>(null)
  const [incomeEntries, setIncomeEntries] = useState<{
    _id: string
    description: string
    incomeType: string
    amount: number
    payer: string
  }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tax-categories')
      .then((res) => res.json())
      .then((data) => setTaxCategories(data))
      .catch((err) => console.error('Failed to fetch tax categories:', err))
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (taxYear) params.set('taxYear', taxYear)
    if (entity) params.set('entity', entity)

    Promise.all([
      fetch(`/api/transactions/meta/category-summary?${params}`)
        .then((res) => res.json())
        .then((data) => setCategorySummary(data)),
      fetch(`/api/cgt-assets/summary?${params}`)
        .then((res) => res.json())
        .then((data) => setCgtSummary(data)),
      fetch(`/api/income?${params}`)
        .then((res) => res.json())
        .then((data) => setIncomeEntries(data)),
    ])
      .catch((err) => console.error('Failed to fetch summary:', err))
      .finally(() => setLoading(false))
  }, [taxYear, entity])

  const catMap = new Map(taxCategories.map((c) => [c.code, c]))
  const summaryMap = new Map(categorySummary.map((s) => [s.taxCategory, s]))

  const incomeCategories = taxCategories.filter((c) => c.type === 'income')
  const deductionCategories = taxCategories.filter((c) => c.type === 'deduction')

  const uncategorised = summaryMap.get(null)

  const incomeRows = incomeCategories
    .map((c) => ({ ...c, summary: summaryMap.get(c.code) }))
    .filter((r) => r.summary)

  const deductionRows = deductionCategories
    .map((c) => ({ ...c, summary: summaryMap.get(c.code) }))
    .filter((r) => r.summary)

  // Anything in the summary that isn't in our known categories
  const otherRows = categorySummary.filter(
    (s) => s.taxCategory && !catMap.has(s.taxCategory)
  )

  const INCOME_TYPE_LABELS: Record<string, string> = {
    salary: 'Salary / Wages',
    rental: 'Rental Income',
    interest: 'Interest',
    dividend: 'Dividends',
    business: 'Business Income',
    foreign: 'Foreign Income',
    other: 'Other',
  }

  const manualIncomeTotal = incomeEntries.reduce((sum, e) => sum + e.amount, 0)
  const netCGT = cgtSummary?.totalNetCapitalGain || 0
  const totalTransactionIncome = incomeRows.reduce((sum, r) => sum + (r.summary?.total || 0), 0)
  const totalIncome = totalTransactionIncome + manualIncomeTotal + (netCGT > 0 ? netCGT : 0)
  const totalDeductions = deductionRows.reduce((sum, r) => sum + (r.summary?.total || 0), 0)
  const totalClaimDeductions = deductionRows.reduce((sum, r) => sum + (r.summary?.claimTotal || 0), 0)
  const totalTransactions = categorySummary.reduce((sum, r) => sum + r.count, 0)

  const entityLabel = entity
    ? entities.find((e) => e.key === entity)?.label || entity
    : 'All entities'

  const yearLabel = taxYear ? formatTaxYear(Number(taxYear)) : 'All years'

  if (loading) return <p>Loading...</p>

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="dashboard-subtitle-row">
        <p className="dashboard-subtitle">
          {yearLabel} &middot; {entityLabel} &middot; {totalTransactions.toLocaleString()} transactions
        </p>
        <button
          className="btn-report"
          onClick={async () => {
            const qs = new URLSearchParams({
              ...(taxYear ? { taxYear } : {}),
              ...(entity ? { entity } : {}),
            }).toString()
            try {
              const res = await fetch(`/api/reports/tax-summary?${qs}`)
              if (!res.ok) {
                alert(`PDF report failed: HTTP ${res.status}`)
                return
              }
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              window.open(url, '_blank')
              // Revoke after the new tab has had time to load the blob
              setTimeout(() => URL.revokeObjectURL(url), 60_000)
            } catch (err) {
              alert(`PDF report failed: ${(err as Error).message}`)
            }
          }}
        >
          Tax Summary Report
        </button>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h2>Income</h2>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Category</th>
                <th className="col-right">Count</th>
                <th className="col-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {incomeRows.length === 0 && incomeEntries.length === 0 && netCGT <= 0 ? (
                <tr><td colSpan={4} className="empty-cell">No income</td></tr>
              ) : (
                <>
                  {incomeRows.map((r) => {
                    const incAttached = r.summary?.attachedCount ?? 0
                    return (
                    <tr key={r.code} className="clickable-row" onClick={() => goToCategory(r.code)}>
                      <td className="code-cell">{r.code}</td>
                      <td>
                        <div className="label-with-action">
                          <span>{r.name}</span>
                          {incAttached > 0 && (
                            <button
                              className="btn-download-receipts"
                              title={`Download ${incAttached} receipt${incAttached === 1 ? '' : 's'}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                void downloadReceiptsForFilter({
                                  taxCategory: r.code,
                                  label: r.name,
                                  expectedCount: incAttached,
                                })
                              }}
                            >
                              ⬇ Receipts ({incAttached})
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="col-right">{r.summary!.count}</td>
                      <td className="col-right amount-pos">
                        ${r.summary!.total.toFixed(2)}
                      </td>
                    </tr>
                    )
                  })}
                  {incomeEntries.map((e) => (
                    <tr key={e._id} className="clickable-row" onClick={() => navigate('/income')}>
                      <td><span className={`badge badge-income-${e.incomeType}`}>{INCOME_TYPE_LABELS[e.incomeType] || e.incomeType}</span></td>
                      <td>{e.description}</td>
                      <td className="col-right"></td>
                      <td className="col-right amount-pos">
                        ${e.amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {netCGT > 0 && (
                    <tr className="clickable-row" onClick={() => navigate('/cgt')}>
                      <td><span className="badge badge-cgt">CGT</span></td>
                      <td>Net capital gain</td>
                      <td className="col-right"></td>
                      <td className="col-right amount-pos">
                        ${netCGT.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
            {(incomeRows.length > 0 || incomeEntries.length > 0 || netCGT > 0) && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan={3}>Total income</td>
                  <td className="col-right amount-pos">${totalIncome.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="dashboard-card">
          <h2>Deductions</h2>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Category</th>
                <th className="col-right">Count</th>
                <th className="col-right">Total</th>
                <th className="col-right">Claim Total</th>
              </tr>
            </thead>
            <tbody>
              {deductionRows.length === 0 ? (
                <tr><td colSpan={5} className="empty-cell">No deduction transactions</td></tr>
              ) : (
                deductionRows.map((r) => {
                  const showSubTypes = r.code === 'D5'
                  const showDescriptions = r.code === 'D9'
                  const subTypeRows = showSubTypes ? getSortedSubTypes(r.summary) : []
                  const descriptionRows = showDescriptions ? getSortedDescriptions(r.summary) : []
                  const catAttached = r.summary?.attachedCount ?? 0

                  return (
                    <Fragment key={r.code}>
                      <tr className="clickable-row" onClick={() => goToCategory(r.code)}>
                        <td className="code-cell">{r.code}</td>
                        <td>
                          <div className="label-with-action">
                            <span>{r.name}</span>
                            {catAttached > 0 && (
                              <button
                                className="btn-download-receipts"
                                title={`Download ${catAttached} receipt${catAttached === 1 ? '' : 's'}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void downloadReceiptsForFilter({
                                    taxCategory: r.code,
                                    label: r.name,
                                    expectedCount: catAttached,
                                  })
                                }}
                              >
                                ⬇ Receipts ({catAttached})
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="col-right">{r.summary!.count}</td>
                        <td className="col-right amount-neg">
                          ${Math.abs(r.summary!.total).toFixed(2)}
                        </td>
                        <td className="col-right claim-total">
                          ${Math.abs(r.summary!.claimTotal).toFixed(2)}
                        </td>
                      </tr>
                      {subTypeRows.map((subType) => {
                        const subAttached = subType.attachedCount ?? 0
                        return (
                        <tr
                          key={`${r.code}-${subType.subType}`}
                          className="subtype-breakdown-row clickable-row"
                          onClick={() => goToSubType(r.code, subType.subType)}
                        >
                          <td></td>
                          <td className="subtype-breakdown-label">
                            <div className="label-with-action">
                              <span>{subType.subType}</span>
                              {subAttached > 0 && (
                                <button
                                  className="btn-download-receipts"
                                  title={`Download ${subAttached} receipt${subAttached === 1 ? '' : 's'}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void downloadReceiptsForFilter({
                                      taxCategory: r.code,
                                      subType: subType.subType === 'Unspecified' ? '_none' : subType.subType,
                                      label: subType.subType,
                                      expectedCount: subAttached,
                                    })
                                  }}
                                >
                                  ⬇ Receipts ({subAttached})
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="col-right subtype-breakdown-count">{subType.count}</td>
                          <td className="col-right amount-neg">
                            ${Math.abs(subType.total).toFixed(2)}
                          </td>
                          <td className="col-right claim-total">
                            ${Math.abs(subType.claimTotal).toFixed(2)}
                          </td>
                        </tr>
                        )
                      })}
                      {descriptionRows.map((description) => {
                        const descAttached = description.attachedCount ?? 0
                        return (
                        <tr
                          key={`${r.code}-${description.description}`}
                          className="subtype-breakdown-row clickable-row"
                          onClick={() => goToDescription(r.code, description.description)}
                        >
                          <td></td>
                          <td className="subtype-breakdown-label">
                            <div className="label-with-action">
                              <span>{description.description}</span>
                              {descAttached > 0 && (
                                <button
                                  className="btn-download-receipts"
                                  title={`Download ${descAttached} receipt${descAttached === 1 ? '' : 's'}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void downloadReceiptsForFilter({
                                      taxCategory: r.code,
                                      description: description.description,
                                      label: description.description,
                                      expectedCount: descAttached,
                                    })
                                  }}
                                >
                                  ⬇ Receipts ({descAttached})
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="col-right subtype-breakdown-count">{description.count}</td>
                          <td className="col-right amount-neg">
                            ${Math.abs(description.total).toFixed(2)}
                          </td>
                          <td className="col-right claim-total">
                            ${Math.abs(description.claimTotal).toFixed(2)}
                          </td>
                        </tr>
                        )
                      })}
                    </Fragment>
                  )
                })
              )}
            </tbody>
            {deductionRows.length > 0 && (
              <tfoot>
                <tr className="total-row">
                  <td colSpan={3}>Total deductions</td>
                  <td className="col-right amount-neg">${Math.abs(totalDeductions).toFixed(2)}</td>
                  <td className="col-right claim-total">${Math.abs(totalClaimDeductions).toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="dashboard-row">
        {cgtSummary && cgtSummary.count > 0 && (
          <div className="dashboard-card clickable-card" onClick={() => navigate('/cgt')}>
            <h2>Capital Gains</h2>
            <table className="summary-table">
              <tbody>
                <tr>
                  <td>Total gains</td>
                  <td className="col-right amount-pos">${cgtSummary.totalGains.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Total losses</td>
                  <td className="col-right amount-neg">${Math.abs(cgtSummary.totalLosses).toFixed(2)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td>Net capital gain (after discount)</td>
                  <td className={`col-right ${cgtSummary.totalNetCapitalGain >= 0 ? 'amount-pos' : 'amount-neg'}`}>
                    ${cgtSummary.totalNetCapitalGain.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p style={{ fontSize: '0.75rem', color: '#9a9ab0', marginTop: '0.5rem', marginBottom: 0 }}>
              {cgtSummary.count} CGT event{cgtSummary.count !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      <div className="dashboard-footer">
        <div className="net-card">
          <span className="net-label">Net (Income + Deductions)</span>
          <span className={`net-value ${totalIncome + totalDeductions >= 0 ? 'amount-pos' : 'amount-neg'}`}>
            ${(totalIncome + totalDeductions).toFixed(2)}
          </span>
        </div>
        {uncategorised && (
          <div className="uncategorised-card clickable-card" onClick={() => goToCategory(null)}>
            <span className="uncategorised-label">Uncategorised</span>
            <span className="uncategorised-count">{uncategorised.count} transactions</span>
            <span className="uncategorised-total">${uncategorised.total.toFixed(2)}</span>
          </div>
        )}
        {otherRows.length > 0 && otherRows.map((r) => (
          <div key={r.taxCategory} className="uncategorised-card">
            <span className="uncategorised-label">{r.taxCategory}</span>
            <span className="uncategorised-count">{r.count} transactions</span>
            <span className="uncategorised-total">${r.total.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Dashboard
