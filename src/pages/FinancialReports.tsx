import { useEffect, useState } from 'react';
import { supabase } from '../supabase/lib/supabase';
import '../css/financial-reports.css';

const monthsList = [
  { num: 1, name: 'January' }, { num: 2, name: 'February' }, { num: 3, name: 'March' },
  { num: 4, name: 'April' }, { num: 5, name: 'May' }, { num: 6, name: 'June' },
  { num: 7, name: 'July' }, { num: 8, name: 'August' }, { num: 9, name: 'September' },
  { num: 10, name: 'October' }, { num: 11, name: 'November' }, { num: 12, name: 'December' }
];

const formatCurrency = (amount: number) => {
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
};

const formatDisplayDate = (dateString: string | null | undefined) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    timeZone: 'UTC' 
  });
};

const formatExportDate = (dateString: string | null | undefined) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function FinancialReports() {
  const [activeTab, setActiveTab] = useState('monthly');

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);

  const [monthlyPayments, setMonthlyPayments] = useState<any[]>([]);
  const [overduePayments, setOverduePayments] = useState<any[]>([]);
  const [annualData, setAnnualData] = useState<
    Record<number, { rent: number; penalty: number; total: number; count: number }>
  >({});

  const [metrics, setMetrics] = useState({
    totalCollections: 0,
    totalPenalties: 0,
    paymentCount: 0,
    avgPayment: 0,
    collectionRate: 0,
    annualTotal: 0,
    annualPenaltyTotal: 0,
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchYears();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear]);

  async function fetchYears() {
    const { data } = await supabase.from('payments').select('month_covered').not('month_covered', 'is', null);
    if (data) {
      const years = [...new Set(data.map(p => new Date(p.month_covered!).getFullYear()))];
      if (years.length === 0) years.push(new Date().getFullYear());
      setAvailableYears(years.sort((a, b) => b - a));
    }
  }

  async function fetchData() {
    setIsLoading(true);
    try {
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

      const { data: stallsData } = await supabase.from('stalls').select('id, stall_number, section_id');
      const { data: sectionsData } = await supabase.from('sections').select('id, section_name');
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('stall_id, full_name, registration_date')
        .eq('status', 'active');

      const stallMap = new Map(stallsData?.map(s => [s.id, s]) || []);
      const sectionMap = new Map(sectionsData?.map(s => [s.id, s]) || []);
      const tenantMap = new Map(tenantsData?.map(t => [t.stall_id, t]) || []);

      const { data: paidData } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'Paid')
        .gte('payment_date', startDate)
        .lte('payment_date', endDate)
        .order('payment_date', { ascending: false });

      let totalCollections = 0;
      let totalPenalties = 0;
      let paymentCount = 0;
      let avgPayment = 0;

      if (paidData) {
        const enriched = paidData.map(p => {
          const stall = stallMap.get(p.stall_id);
          const section = stall ? sectionMap.get(stall.section_id) : null;
          const tenantInfo = tenantMap.get(p.stall_id);
          const baseAmount = Number(p.amount) || 0;
          const penalty = Number(p.penalty) || 0;
          const totalPaid = baseAmount + penalty;

          totalCollections += totalPaid;
          totalPenalties += penalty;

          return {
            ...p,
            stall_number: stall?.stall_number,
            section_name: section?.section_name,
            display_tenant_name: tenantInfo?.full_name || p.tenant_name,
            base_amount: baseAmount,
            penalty,
            total_paid: totalPaid,
          };
        });

        paymentCount = enriched.length;
        avgPayment = paymentCount > 0 ? totalCollections / paymentCount : 0;
        setMonthlyPayments(enriched);
      } else {
        setMonthlyPayments([]);
      }

      const { count: tenantCount } = await supabase
        .from('stalls')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Occupied');
      const totalOccupied = tenantCount || 0;
      const collectionRate = totalOccupied > 0 ? Math.round(((paidData?.length || 0) / totalOccupied) * 100) : 0;

      const { data: pendingBills } = await supabase
        .from('payments')
        .select('*')
        .in('status', ['Pending', 'Overdue']);

      let overdueList: any[] = [];
      if (pendingBills) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dynamicOverdue = pendingBills.map(o => {
          const tenantInfo = tenantMap.get(o.stall_id);
          const fixedDay = tenantInfo?.registration_date ? new Date(tenantInfo.registration_date).getDate() : 5;
          
          const startObj = new Date(o.month_covered);
          startObj.setDate(fixedDay);
          const endObj = new Date(startObj);
          endObj.setMonth(endObj.getMonth() + 1);

          const graceDays = o.grace_period_days || 3;
          const penaltyStartDate = new Date(endObj);
          penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);

          if (today > penaltyStartDate) {
            const alreadyPaid = Number(o.amount_paid) || 0;
            const baseAmount = Number(o.amount);
            const remainingBeforePenalty = Math.max(0, baseAmount - alreadyPaid);
            
            const penaltyAmount = o.penalty || (remainingBeforePenalty * 0.25);
            const daysLate = Math.ceil((today.getTime() - penaltyStartDate.getTime()) / (1000 * 3600 * 24));

            return {
              ...o,
              status: 'Overdue',
              penalty: penaltyAmount,
              total_due: baseAmount + penaltyAmount,
              days_late: daysLate,
              penalty_start_date: penaltyStartDate,
            };
          }
          return null;
        }).filter(Boolean);

        overdueList = dynamicOverdue.map(o => {
          if (!o) return null;
          const stall = stallMap.get(o.stall_id);
          const section = stall ? sectionMap.get(stall.section_id) : null;
          const tenantInfo = tenantMap.get(o.stall_id);

          return {
            ...o,
            stall_number: stall?.stall_number,
            section_name: section?.section_name,
            display_tenant_name: tenantInfo?.full_name || o.tenant_name,
          };
        }).filter(Boolean);

        overdueList.sort((a, b) => new Date(a!.due_date).getTime() - new Date(b!.due_date).getTime());
      }
      setOverduePayments(overdueList);

      const { data: annualRaw } = await supabase
        .from('payments')
        .select('amount, penalty, month_covered')
        .eq('status', 'Paid')
        .gte('payment_date', `${selectedYear}-01-01`)
        .lte('payment_date', `${selectedYear}-12-31`);

      let annualTotal = 0;
      let annualPenaltyTotal = 0;
      const grouped: Record<number, { rent: number; penalty: number; total: number; count: number }> = {};

      if (annualRaw) {
        annualRaw.forEach(p => {
          if (!p.month_covered) return;
          const month = new Date(p.month_covered).getMonth() + 1;
          const rent = Number(p.amount) || 0;
          const penalty = Number(p.penalty) || 0;
          const total = rent + penalty;

          if (!grouped[month]) grouped[month] = { rent: 0, penalty: 0, total: 0, count: 0 };
          grouped[month].rent += rent;
          grouped[month].penalty += penalty;
          grouped[month].total += total;
          grouped[month].count += 1;

          annualTotal += total;
          annualPenaltyTotal += penalty;
        });
      }

      setAnnualData(grouped);
      
      setMetrics({
        totalCollections,
        totalPenalties,
        paymentCount,
        avgPayment,
        collectionRate,
        annualTotal,
        annualPenaltyTotal
      });

    } catch (err) {
      console.error('Error loading financial data:', err);
    } finally {
      setIsLoading(false);
    }
  }

  const exportTable = (filename: string, data: any[], columns: string[]) => {
    const csv: string[] = ['\uFEFF'];
    csv.push(columns.join(','));

    data.forEach(row => {
      const rowData = columns.map(col => {
        let val = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
        return `"${val.replace(/"/g, '""')}"`;
      });
      csv.push(rowData.join(','));
    });

    const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleExportMonthly = () => {
    const exportData = monthlyPayments.map(p => ({
      Date: formatExportDate(p.payment_date),
      'Stall #': p.stall_number || '',
      Tenant: p.display_tenant_name || '',
      Section: p.section_name || '',
      Rent: p.base_amount.toFixed(2),
      Penalty: p.penalty > 0 ? p.penalty.toFixed(2) : '-',
      Total: p.total_paid.toFixed(2),
      Reference: p.receipt_number || `PAY-${p.id}`
    }));
    const cols = ['Date', 'Stall #', 'Tenant', 'Section', 'Rent', 'Penalty', 'Total', 'Reference'];
    exportTable('monthly-report', exportData, cols);
  };

  const handleExportAnnual = () => {
    const exportData = monthsList.map(m => {
      const data = annualData[m.num];
      const total = data?.total || 0;
      const count = data?.count || 0;
      const penalty = data?.penalty || 0;
      return {
        Month: m.name,
        Payments: count,
        Rent: (data?.rent || 0).toFixed(2),
        Penalty: penalty > 0 ? penalty.toFixed(2) : '-',
        Total: total.toFixed(2),
        'Average per Payment': (count > 0 ? total / count : 0).toFixed(2)
      };
    });
    const cols = ['Month', 'Payments', 'Rent', 'Penalty', 'Total', 'Average per Payment'];
    exportTable('annual-report', exportData, cols);
  };

  const handleExportOverdue = () => {
    const exportData = overduePayments.map(o => ({
      'Stall #': o.stall_number || '',
      Tenant: o.display_tenant_name || '',
      Section: o.section_name || '',
      'Amount Due': Number(o.amount).toFixed(2),
      'Due Date': formatExportDate(o.due_date),
      'Days Overdue': o.days_late,
      Penalty: Number(o.penalty).toFixed(2),
      'Total Due': Number(o.total_due).toFixed(2)
    }));
    const cols = ['Stall #', 'Tenant', 'Section', 'Amount Due', 'Due Date', 'Days Overdue', 'Penalty', 'Total Due'];
    exportTable('overdue-report', exportData, cols);
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#f8fafc' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>Loading report data...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      <div className="page-header">
        <div>
          <h1>Financial Reports</h1>
          <p>Monitor collections and outstanding balances.</p>
        </div>
      </div>

      <div className="report-tabs">
        <button className={`tab-btn ${activeTab === 'monthly' ? 'active' : ''}`} onClick={() => setActiveTab('monthly')}>
          <i className="fa-solid fa-calendar-day"></i> Monthly Report
        </button>
        <button className={`tab-btn ${activeTab === 'annual' ? 'active' : ''}`} onClick={() => setActiveTab('annual')}>
          <i className="fa-solid fa-chart-line"></i> Annual Report
        </button>
        <button className={`tab-btn ${activeTab === 'overdue' ? 'active' : ''}`} onClick={() => setActiveTab('overdue')}>
          <i className="fa-solid fa-exclamation-triangle"></i> Overdue Accounts
        </button>
      </div>

      {activeTab === 'monthly' && (
        <div className="report-content active">
          <div className="filter-bar">
            <div className="filter-item">
              <label>Month</label>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}>
                {monthsList.map(m => <option key={m.num} value={m.num}>{m.name}</option>)}
              </select>
            </div>
            <div className="filter-item">
              <label>Year</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="metric-row">
            <div className="metric-box">
              <div className="metric-icon blue"><i className="fa-solid fa-coins"></i></div>
              <div className="metric-data">
                <div className="metric-label">Total Collections</div>
                <div className="metric-value">{formatCurrency(metrics.totalCollections)}</div>
                <div className="metric-sub">
                  {monthsList[selectedMonth - 1].name} {selectedYear}
                  {metrics.totalPenalties > 0 && ` (incl. ${formatCurrency(metrics.totalPenalties)} penalty)`}
                </div>
              </div>
            </div>
            <div className="metric-box">
              <div className="metric-icon purple"><i className="fa-solid fa-receipt"></i></div>
              <div className="metric-data">
                <div className="metric-label">Payments Processed</div>
                <div className="metric-value">{metrics.paymentCount}</div>
                <div className="metric-sub">Transactions this month</div>
              </div>
            </div>
            <div className="metric-box">
              <div className="metric-icon green"><i className="fa-solid fa-calculator"></i></div>
              <div className="metric-data">
                <div className="metric-label">Average Payment</div>
                <div className="metric-value">{formatCurrency(metrics.avgPayment)}</div>
                <div className="metric-sub">Per transaction (incl. penalty)</div>
              </div>
            </div>
            <div className="metric-box">
              <div className="metric-icon orange"><i className="fa-solid fa-percent"></i></div>
              <div className="metric-data">
                <div className="metric-label">Collection Rate</div>
                <div className="metric-value">{metrics.collectionRate}%</div>
                <div className="metric-sub">Of total tenants</div>
              </div>
            </div>
          </div>

          <div className="data-panel">
            <div className="data-header">
              <h2>Collection Details</h2>
              <button className="btn-secondary" onClick={handleExportMonthly}>
                <i className="fa-solid fa-download"></i> Export
              </button>
            </div>
            <div className="table-responsive">
              <table id="monthlyTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Stall #</th>
                    <th>Tenant</th>
                    <th>Section</th>
                    <th>Rent</th>
                    <th>Penalty</th>
                    <th>Total</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyPayments.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                        No payments found for this period.
                      </td>
                    </tr>
                  ) : (
                    monthlyPayments.map(p => (
                      <tr key={p.id}>
                        <td>{formatDisplayDate(p.payment_date)}</td>
                        <td><strong>{p.stall_number || '—'}</strong></td>
                        <td>{p.display_tenant_name || '—'}</td>
                        <td>{p.section_name || '—'}</td>
                        <td>{formatCurrency(p.base_amount)}</td>
                        <td style={{ color: p.penalty > 0 ? '#dc2626' : 'inherit' }}>
                          {p.penalty > 0 ? `+ ${formatCurrency(p.penalty)}` : '—'}
                        </td>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>
                          {formatCurrency(p.total_paid)}
                        </td>
                        <td><span className="badge-ref">{p.receipt_number || `PAY-${p.id}`}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'annual' && (
        <div className="report-content active">
          <div className="filter-bar">
            <div className="filter-item">
              <label>Year</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="metric-row">
            <div className="metric-box" style={{ gridColumn: 'span 2' }}>
              <div className="metric-icon blue"><i className="fa-solid fa-chart-line"></i></div>
              <div className="metric-data">
                <div className="metric-label">Annual Total Collections</div>
                <div className="metric-value">{formatCurrency(metrics.annualTotal)}</div>
                <div className="metric-sub">
                  For the year {selectedYear}
                  {metrics.annualPenaltyTotal > 0 && ` (incl. ${formatCurrency(metrics.annualPenaltyTotal)} penalty)`}
                </div>
              </div>
            </div>
          </div>

          <div className="data-panel">
            <div className="data-header">
              <h2>Monthly Breakdown</h2>
              <button className="btn-secondary" onClick={handleExportAnnual}>
                <i className="fa-solid fa-download"></i> Export
              </button>
            </div>
            <div className="table-responsive">
              <table id="annualTable">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Payments</th>
                    <th>Rent</th>
                    <th>Penalty</th>
                    <th>Total</th>
                    <th>Average per Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {monthsList.map(m => {
                    const data = annualData[m.num];
                    const total = data?.total || 0;
                    const count = data?.count || 0;
                    const penalty = data?.penalty || 0;

                    return (
                      <tr key={m.num}>
                        <td><strong>{m.name}</strong></td>
                        <td>{count}</td>
                        <td>{formatCurrency(data?.rent || 0)}</td>
                        <td style={{ color: penalty > 0 ? '#dc2626' : 'inherit' }}>
                          {penalty > 0 ? `+ ${formatCurrency(penalty)}` : '—'}
                        </td>
                        <td><strong>{formatCurrency(total)}</strong></td>
                        <td>{formatCurrency(count > 0 ? total / count : 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'overdue' && (
        <div className="report-content active">
          <div className="data-panel">
            <div className="data-header">
              <h2 style={{ color: '#dc2626' }}>
                <i className="fa-solid fa-exclamation-triangle"></i> Overdue Accounts (25% Penalty)
              </h2>
              <button className="btn-secondary" onClick={handleExportOverdue}>
                <i className="fa-solid fa-download"></i> Export
              </button>
            </div>
            <div className="table-responsive">
              <table id="overdueTable">
                <thead>
                  <tr>
                    <th>Stall #</th>
                    <th>Tenant</th>
                    <th>Section</th>
                    <th>Amount Due</th>
                    <th>Due Date</th>
                    <th>Days Overdue</th>
                    <th>Penalty</th>
                    <th>Total Due</th>
                  </tr>
                </thead>
                <tbody>
                  {overduePayments.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                        No overdue accounts found.
                      </td>
                    </tr>
                  ) : (
                    overduePayments.map(o => (
                      <tr key={o.id}>
                        <td><strong style={{ color: '#dc2626' }}>{o.stall_number || '—'}</strong></td>
                        <td>{o.display_tenant_name || '—'}</td>
                        <td>{o.section_name || '—'}</td>
                        <td>{formatCurrency(Number(o.amount))}</td>
                        <td>{formatDisplayDate(o.due_date)}</td>
                        <td>{o.days_late} days</td>
                        <td style={{ color: '#dc2626' }}>
                          + {formatCurrency(Number(o.penalty))}
                        </td>
                        <td>
                          <strong style={{ color: '#dc2626' }}>
                            {formatCurrency(Number(o.total_due))}
                          </strong>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}