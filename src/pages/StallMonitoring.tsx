import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/lib/supabase';
import '../css/stall-monitoring.css';

interface Stall {
  id: number;
  stall_number: string;
  status: string;
  monthly_rent: number;
  tenant_name: string | null;
  contact_number: string | null;
  section_name: string | null;
  payment_status: string;
  due_date: string | null;
}

interface OverduePayment {
  id: number;
  stall_number: string;
  tenant_name: string | null;
  section_name: string | null;
  amount: number;
  due_date: string;
  penalty: number;
  grace_period_days: number; // 🛑 ADDED THIS
}

export default function StallMonitoring() {
  const navigate = useNavigate();

  const [stalls, setStalls] = useState<Stall[]>([]);
  const [overdueList, setOverdueList] = useState<OverduePayment[]>([]);
  const [sections, setSections] = useState<string[]>([]);

  const [totalStalls, setTotalStalls] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);

    try {
      const [
        { data: stallsData, error: stallsError },
        { data: tenantsData, error: tenantsError },
        { data: sectionsData, error: sectionsError },
        { data: paymentsData, error: paymentsError }
      ] = await Promise.all([
        supabase.from('stalls').select('*'),
        supabase.from('tenants').select('*').eq('status', 'active'),
        supabase.from('sections').select('*'),
        supabase.from('payments').select('*').order('due_date', { ascending: true })
      ]);

      if (stallsError) throw stallsError;
      if (tenantsError) throw tenantsError;
      if (sectionsError) throw sectionsError;
      if (paymentsError) throw paymentsError;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const mappedStalls: Stall[] = (stallsData || []).map((stall) => {
        const activeTenant = tenantsData?.find(
          (tenant) => tenant.stall_id === stall.id
        );

        const stallPayments = (paymentsData || []).filter(
          (payment) => payment.stall_id === stall.id
        );

        // Find the oldest unpaid bill due today or earlier.
        const currentDueBill = stallPayments.find((payment) => {
          if (payment.status === 'Paid') return false;

          const dueDate = new Date(payment.due_date);
          dueDate.setHours(0, 0, 0, 0);

          return dueDate <= today;
        });

        // If there is no current bill, find the nearest future bill.
        const nextBill = stallPayments.find((payment) => {
          if (payment.status === 'Paid') return false;

          const dueDate = new Date(payment.due_date);
          dueDate.setHours(0, 0, 0, 0);

          return dueDate > today;
        });

        const activeBill = currentDueBill || nextBill;
        const section = sectionsData?.find(
          (item) => item.id === stall.section_id
        );

        let paymentStatus = 'Available';

        if (stall.status === 'Occupied' && activeTenant) {
          if (!activeBill) {
            paymentStatus = 'Paid';
          } else {
            const dueDate = new Date(activeBill.due_date);
            const graceDays = activeBill.grace_period_days || 3;

            const penaltyStartDate = new Date(dueDate);
            penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);
            penaltyStartDate.setHours(0, 0, 0, 0);

            paymentStatus = today > penaltyStartDate ? 'Overdue' : 'Pending';
          }
        }

        return {
          id: stall.id,
          stall_number: stall.stall_number,
          status: stall.status,
          monthly_rent: stall.monthly_rent,
          tenant_name: activeTenant?.full_name || null,
          contact_number: activeTenant?.contact_number || null,
          section_name: section?.section_name || null,
          payment_status: paymentStatus,
          due_date: activeBill?.due_date || null
        };
      });

      setStalls(mappedStalls);
      setTotalStalls(mappedStalls.length);
      setPaidCount(
        mappedStalls.filter((stall) => stall.payment_status === 'Paid').length
      );
      setUnpaidCount(
        mappedStalls.filter((stall) => stall.payment_status === 'Pending').length
      );
      setOverdueCount(
        mappedStalls.filter((stall) => stall.payment_status === 'Overdue').length
      );

      // Build the overdue accounts list.
      const dynamicOverdue = (paymentsData || []).filter((payment) => {
        if (payment.status === 'Paid') return false;

        const dueDate = new Date(payment.due_date);
        const graceDays = payment.grace_period_days || 3;

        const penaltyStartDate = new Date(dueDate);
        penaltyStartDate.setDate(penaltyStartDate.getDate() + graceDays);
        penaltyStartDate.setHours(0, 0, 0, 0);

        return today > penaltyStartDate;
      });

      const mappedOverdue: OverduePayment[] = dynamicOverdue.map((payment) => {
        const stall = stallsData?.find(
          (item) => item.id === payment.stall_id
        );
        const section = sectionsData?.find(
          (item) => item.id === stall?.section_id
        );

        return {
          id: payment.id,
          stall_number: stall?.stall_number || '—',
          tenant_name: payment.tenant_name || null,
          section_name: section?.section_name || null,
          amount: payment.amount,
          due_date: payment.due_date,
          penalty: payment.penalty || 0,
          grace_period_days: payment.grace_period_days || 3 // 🛑 SAVED TO STATE
        };
      });

      setOverdueList(mappedOverdue);
      setSections([
        ...new Set((sectionsData || []).map((section) => section.section_name))
      ]);
    } catch (error) {
      console.error('Error fetching stall monitoring data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredStalls = stalls.filter((stall) => {
    const search = searchQuery.toLowerCase().trim();

    const matchesSearch =
      (stall.tenant_name || '').toLowerCase().includes(search) ||
      stall.stall_number.toLowerCase().includes(search);

    const matchesSection =
      sectionFilter === 'all' || stall.section_name === sectionFilter;

    const matchesStatus =
      statusFilter === 'all' || stall.status === statusFilter;

    return matchesSearch && matchesSection && matchesStatus;
  });

  const exportTable = () => {
    const headers = [
      'Stall #',
      'Tenant',
      'Section',
      'Contact',
      'Monthly Rent',
      'Payment Status'
    ];

    const csvRows = [headers.join(',')];

    filteredStalls.forEach((stall) => {
      const row = [
        stall.stall_number,
        stall.tenant_name || '—',
        stall.section_name || '—',
        stall.contact_number || '—',
        stall.monthly_rent,
        stall.payment_status
      ];

      csvRows.push(
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      );
    });

    const blob = new Blob([csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `stall-monitoring-${new Date()
      .toISOString()
      .split('T')[0]}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount: number) =>
    amount.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  return (
    <div className="content-wrapper stall-monitoring-page">
      <div className="page-header">
        <div>
          <h1>Stall Monitoring</h1>
          <p>Monitor rent payments and stall statuses.</p>
        </div>

        <div className="header-tools">
          <div className="input-with-icon">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input
              type="text"
              placeholder="Search tenant or stall..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search tenant or stall"
            />
          </div>

          <button className="btn-secondary" onClick={exportTable}>
            <i className="fa-solid fa-download" aria-hidden="true"></i>
            Export
          </button>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric-box">
          <div className="metric-icon blue">
            <i className="fa-solid fa-store" aria-hidden="true"></i>
          </div>
          <div className="metric-data">
            <div className="metric-label">Total Stalls</div>
            <div className="metric-value">{totalStalls}</div>
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-icon green">
            <i className="fa-solid fa-check-circle" aria-hidden="true"></i>
          </div>
          <div className="metric-data">
            <div className="metric-label">Paid</div>
            <div className="metric-value">{paidCount}</div>
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-icon orange">
            <i className="fa-solid fa-clock" aria-hidden="true"></i>
          </div>
          <div className="metric-data">
            <div className="metric-label">Unpaid</div>
            <div className="metric-value">{unpaidCount}</div>
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-icon red">
            <i className="fa-solid fa-exclamation-triangle" aria-hidden="true"></i>
          </div>
          <div className="metric-data">
            <div className="metric-label">Overdue</div>
            <div className="metric-value">{overdueCount}</div>
          </div>
        </div>
      </div>

      <div className="data-panel">
        <div className="data-header">
          <h2>Stall Directory</h2>

          <div className="filters">
            <select
              value={sectionFilter}
              onChange={(event) => setSectionFilter(event.target.value)}
              aria-label="Filter by section"
            >
              <option value="all">All Sections</option>
              {sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by stall status"
            >
              <option value="all">All Status</option>
              <option value="Occupied">Occupied</option>
              <option value="Vacant">Available</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          {isLoading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading stalls...</p>
            </div>
          ) : (
            <table id="stallsTable">
              <thead>
                <tr>
                  <th>Stall #</th>
                  <th>Tenant</th>
                  <th>Section</th>
                  <th>Contact</th>
                  <th>Monthly Rent</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredStalls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      No stalls found.
                    </td>
                  </tr>
                ) : (
                  filteredStalls.map((stall) => {
                    let badgeClass = 'status-available';

                    if (stall.payment_status === 'Paid') {
                      badgeClass = 'status-paid';
                    } else if (stall.payment_status === 'Overdue') {
                      badgeClass = 'status-overdue';
                    } else if (stall.payment_status === 'Pending') {
                      badgeClass = 'status-pending';
                    }

                    return (
                      <tr key={stall.id}>
                        <td>
                          <strong>{stall.stall_number}</strong>
                        </td>
                        <td>{stall.tenant_name || '—'}</td>
                        <td>{stall.section_name || '—'}</td>
                        <td>{stall.contact_number || '—'}</td>
                        <td>₱{formatCurrency(stall.monthly_rent)}</td>

                        <td>
                          <span className={`status-badge ${badgeClass}`}>
                            {stall.payment_status}
                          </span>

                          {stall.status === 'Occupied' &&
                            stall.payment_status !== 'Paid' &&
                            stall.due_date && (
                              <div className="sub-text">
                                Due:{' '}
                                {new Date(stall.due_date).toLocaleDateString(
                                  'en-US',
                                  { month: 'short', day: 'numeric' }
                                )}
                              </div>
                            )}
                        </td>

                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="btn-action"
                              title="View"
                              aria-label={`View stall ${stall.stall_number}`}
                              onClick={() =>
                                navigate(
                                  `/stall-details?stall=${encodeURIComponent(
                                    stall.stall_number
                                  )}`
                                )
                              }
                            >
                              <i className="fa-solid fa-eye" aria-hidden="true"></i>
                            </button>

                            {/* ALWAYS render the second button slot to maintain grid structure */}
                            <button
                              type="button"
                              className={`btn-action reminder ${(!stall.tenant_name || stall.payment_status !== 'Pending') ? 'is-hidden' : ''}`}
                              title="Send Reminder"
                              aria-label={`Send reminder for stall ${stall.stall_number}`}
                              onClick={() =>
                                navigate(`/send-reminder?stall=${stall.id}`)
                              }
                              disabled={!stall.tenant_name || stall.payment_status !== 'Pending'}
                            >
                              <i className="fa-solid fa-bell" aria-hidden="true"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {!isLoading && overdueList.length > 0 && (
        <div className="data-panel overdue-panel">
          <div className="data-header overdue-header">
            <h2>
              <i
                className="fa-solid fa-exclamation-triangle"
                aria-hidden="true"
              ></i>
              Overdue Accounts (25% Penalty Applied)
            </h2>
          </div>

          <div className="table-responsive">
            <table className="overdue-table">
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
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {overdueList.map((overdue) => {
                  const dueDate = new Date(overdue.due_date);
                  // 🛑 FIX: Use the exact grace period from the database
                  const graceDays = overdue.grace_period_days; 

                  const penaltyStartDate = new Date(dueDate);
                  penaltyStartDate.setDate(
                    penaltyStartDate.getDate() + graceDays
                  );
                  penaltyStartDate.setHours(0, 0, 0, 0);

                  const todayForCalc = new Date();
                  todayForCalc.setHours(0, 0, 0, 0);

                  const diffTime =
                    todayForCalc.getTime() - penaltyStartDate.getTime();

                  const daysOverdue = Math.max(
                    0,
                    Math.floor(diffTime / (1000 * 60 * 60 * 24))
                  );

                  const penalty = overdue.amount * 0.25;
                  const totalDue = overdue.amount + penalty;

                  return (
                    <tr key={overdue.id}>
                      <td>
                        <strong className="overdue-stall-number">
                          {overdue.stall_number}
                        </strong>
                      </td>
                      <td>{overdue.tenant_name || '—'}</td>
                      <td>{overdue.section_name || '—'}</td>
                      <td>₱{formatCurrency(overdue.amount)}</td>
                      <td>
                        {dueDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td>{daysOverdue} days</td>
                      <td className="penalty-amount">
                        + ₱{formatCurrency(penalty)}
                      </td>
                      <td>
                        <strong className="total-due">
                          ₱{formatCurrency(totalDue)}
                        </strong>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="btn-action"
                            title="View"
                            aria-label={`View overdue stall ${overdue.stall_number}`}
                            onClick={() =>
                              navigate(
                                `/stall-details?stall=${encodeURIComponent(
                                  overdue.stall_number
                                )}`
                              )
                            }
                          >
                            <i
                              className="fa-solid fa-eye"
                              aria-hidden="true"
                            ></i>
                          </button>

                          <button
                            type="button"
                            className="btn-action reminder"
                            title="Send Notice"
                            aria-label={`Send overdue notice for stall ${overdue.stall_number}`}
                            onClick={() =>
                              navigate(`/send-notice?payment=${overdue.id}`)
                            }
                          >
                            <i
                              className="fa-solid fa-envelope"
                              aria-hidden="true"
                            ></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}