import { useEffect, useState } from 'react';
import { supabase } from '../supabase/lib/supabase';
import '../css/financial-reports.css';

const monthsList = [
  { num: 1, name: 'January' }, { num: 2, name: 'February' }, { num: 3, name: 'March' },
  { num: 4, name: 'April' }, { num: 5, name: 'May' }, { num: 6, name: 'June' },
  { num: 7, name: 'July' }, { num: 8, name: 'August' }, { num: 9, name: 'September' },
  { num: 10, name: 'October' }, { num: 11, name: 'November' }, { num: 12, name: 'December' }
];

export default function FinancialReports() {
  const [activeTab, setActiveTab] = useState('monthly');
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);

  // Data
  const [monthlyPayments, setMonthlyPayments] = useState<any[]>([]);
  const [overduePayments, setOverduePayments] = useState<any[]>([]);
  const [annualData, setAnnualData] = useState<Record<number, { total: number, count: number }>>({});
  
  // Metrics
  const [totalCollections, setTotalCollections] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [avgPayment, setAvgPayment] = useState(0);
  const [collectionRate, setCollectionRate] = useState(0);
  const [annualTotal, setAnnualTotal] = useState(0);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchYears();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear]);

  async function fetchYears() {
    const { data } = await supabase.from('payments').select('payment_date').not('payment_date', 'is', null);
    if (data) {
      const years = [...new Set(data.map(p => new Date(p.payment_date!).getFullYear()))];
      if (years.length === 0) years.push(new Date().getFullYear());
      setAvailableYears(years.sort((a, b) => b - a));
    }
  }

  async function fetchData() {
    setIsLoading(true);
    try {
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

      // 1. Fetch Stalls (for lookup maps)
      const { data: stallsData } = await supabase.from('stalls').select('id, stall_number, section_id');
      const { data: sectionsData } = await supabase.from('sections').select('id, section_name');
      
      const stallMap = new Map(stallsData?.map(s => [s.id, s]) || []);
      const sectionMap = new Map(sectionsData?.map(s => [s.id, s]) || []);

      // 2. Fetch Monthly Paid Payments
      const { data: paidData } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'Paid')
        .gte('payment_date', startDate)
        .lte('payment_date', endDate)
        .order('payment_date', { ascending: false });

      if (paidData) {
        const enriched = paidData.map(p => {
          const stall = stallMap.get(p.stall_id);
          const section = stall ? sectionMap.get(stall.section_id) : null;
          return { ...p, stall_number: stall?.stall_number, section_name: section?.section_name };
        });
        setMonthlyPayments(enriched);
        setPaymentCount(enriched.length);
        const total = enriched.reduce((sum, p) => sum + Number(p.amount), 0);
        setTotalCollections(total);
        setAvgPayment(enriched.length > 0 ? total / enriched.length : 0);
      }

      // 3. Fetch Occupied Stalls (Collection Rate)
      const { count: tenantCount } = await supabase.from('stalls').select('*', { count: 'exact', head: true }).eq('status', 'Occupied');
      const tenants = tenantCount || 0;
      setCollectionRate(tenants > 0 ? Math.round(((paidData?.length || 0) / tenants) * 100) : 0);

      // 4. Fetch Overdue Payments
      const { data: overdueData } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'Overdue')
        .order('due_date', { ascending: true });

      if (overdueData) {
        const enrichedOverdue = overdueData.map(o => {
          const stall = stallMap.get(o.stall_id);
          const section = stall ? sectionMap.get(stall.section_id) : null;
          return { ...o, stall_number: stall?.stall_number, section_name: section?.section_name };
        });
        setOverduePayments(enrichedOverdue);
      }

      // 5. Fetch Annual Data
      const { data: annualRaw } = await supabase
        .from('payments')
        .select('amount, payment_date')
        .eq('status', 'Paid')
        .gte('payment_date', `${selectedYear}-01-01`)
        .lte('payment_date', `${selectedYear}-12-31`);

      if (annualRaw) {
        const grouped: Record<number, { total: number, count: number }> = {};
        let runningTotal = 0;

        annualRaw.forEach(p => {
          const month = new Date(p.payment_date!).getMonth() + 1;
          if (!grouped[month]) grouped[month] = { total: 0, count: 0 };
          grouped[month].total += Number(p.amount);
          grouped[month].count += 1;
          runningTotal += Number(p.amount);
        });

        setAnnualData(grouped);
        setAnnualTotal(runningTotal);
      }

    } catch (err) {
      console.error("Error loading financial data:", err);
    } finally {
      setIsLoading(false);
    }
  }

  const exportTable = (tableId: string, filename: string) => {
    const table = document.getElementById(tableId);
    if (!table) return;

    const rows = table.querySelectorAll('tr');
    // FIXED: Explicitly typed as string[]
    const csv: string[] = []; 
    
    rows.forEach(row => {
      const cells = row.querySelectorAll('td, th');
      const rowData: string[] = [];
      cells.forEach(cell => {
        let text = cell.textContent?.trim() || '';
        text = text.replace(/\s+/g, ' ').replace(/[₱,]/g, '');
        rowData.push(`"${text}"`);
      });
      csv.push(rowData.join(','));
    });

    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="content-wrapper">
      <div className="page-header">
        <div>
          <h1>Financial Reports</h1>
          <p>Monitor collections and outstanding balances.</p>
        </div>
      </div>

      {/* Tabs */}
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

      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
          Loading report data...
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {/* MONTHLY TAB */}
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
                    <div className="metric-value">₱{totalCollections.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    <div className="metric-sub">{monthsList[selectedMonth - 1].name} {selectedYear}</div>
                  </div>
                </div>
                <div className="metric-box">
                  <div className="metric-icon purple"><i className="fa-solid fa-receipt"></i></div>
                  <div className="metric-data">
                    <div className="metric-label">Payments Processed</div>
                    <div className="metric-value">{paymentCount}</div>
                    <div className="metric-sub">Transactions this month</div>
                  </div>
                </div>
                <div className="metric-box">
                  <div className="metric-icon green"><i className="fa-solid fa-calculator"></i></div>
                  <div className="metric-data">
                    <div className="metric-label">Average Payment</div>
                    <div className="metric-value">₱{avgPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    <div className="metric-sub">Per transaction</div>
                  </div>
                </div>
                <div className="metric-box">
                  <div className="metric-icon orange"><i className="fa-solid fa-percent"></i></div>
                  <div className="metric-data">
                    <div className="metric-label">Collection Rate</div>
                    <div className="metric-value">{collectionRate}%</div>
                    <div className="metric-sub">Of total tenants</div>
                  </div>
                </div>
              </div>

              <div className="data-panel">
                <div className="data-header">
                  <h2>Collection Details</h2>
                  <button className="btn-secondary" onClick={() => exportTable('monthlyTable', 'monthly-report')}>
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
                        <th>Amount</th>
                        <th>Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyPayments.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No payments found for this period.</td></tr>
                      ) : (
                        monthlyPayments.map(p => (
                          <tr key={p.id}>
                            <td>{new Date(p.payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                            <td><strong>{p.stall_number || '—'}</strong></td>
                            <td>{p.tenant_name || '—'}</td>
                            <td>{p.section_name || '—'}</td>
                            <td style={{ fontWeight: 600, color: '#0f172a' }}>₱{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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

          {/* ANNUAL TAB */}
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
                    <div className="metric-value">₱{annualTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    <div className="metric-sub">For the year {selectedYear}</div>
                  </div>
                </div>
              </div>

              <div className="data-panel">
                <div className="data-header">
                  <h2>Monthly Breakdown</h2>
                  <button className="btn-secondary" onClick={() => exportTable('annualTable', 'annual-report')}>
                    <i className="fa-solid fa-download"></i> Export
                  </button>
                </div>
                <div className="table-responsive">
                  <table id="annualTable">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Payments</th>
                        <th>Total Amount</th>
                        <th>Average per Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthsList.map(m => {
                        const data = annualData[m.num];
                        return (
                          <tr key={m.num}>
                            <td><strong>{m.name}</strong></td>
                            <td>{data?.count || 0}</td>
                            <td>₱{(data?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td>₱{(data ? (data.total / data.count) : 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* OVERDUE TAB */}
          {activeTab === 'overdue' && (
            <div className="report-content active">
              <div className="data-panel">
                <div className="data-header">
                  <h2 style={{ color: '#dc2626' }}><i className="fa-solid fa-exclamation-triangle"></i> Overdue Accounts (25% Penalty)</h2>
                  <button className="btn-secondary" onClick={() => exportTable('overdueTable', 'overdue-report')}>
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
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No overdue accounts found.</td></tr>
                      ) : (
                        overduePayments.map(o => {
                          const daysOverdue = Math.ceil((new Date().getTime() - new Date(o.due_date).getTime()) / (1000 * 3600 * 24));
                          const penalty = Number(o.amount) * 0.25;
                          const totalDue = Number(o.amount) + penalty;

                          return (
                            <tr key={o.id}>
                              <td><strong style={{ color: '#dc2626' }}>{o.stall_number || '—'}</strong></td>
                              <td>{o.tenant_name || '—'}</td>
                              <td>{o.section_name || '—'}</td>
                              <td>₱{Number(o.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td>{new Date(o.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                              <td>{daysOverdue} days</td>
                              <td style={{ color: '#dc2626' }}>+ ₱{penalty.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td><strong style={{ color: '#dc2626' }}>₱{totalDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}