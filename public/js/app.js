// ==========================================
// GLOBAL STATE
// ==========================================
let rawAdsData = [];
let filteredData = [];
let chartInstances = {
    mainTrend: null,
    pie: null,
    performance: null,
    roi: null
};
let currentSort = { field: null, direction: 'asc' };

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setupEventListeners();
});

function setupEventListeners() {
    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

// ==========================================
// 1. DATA FETCHING
// ==========================================
async function fetchData() {
    const loader = document.getElementById('loadingOverlay');
    loader.style.display = 'block';
    document.getElementById('lastUpdated').innerHTML = '<i class="fas fa-clock"></i> Syncing data...';

    try {
        const response = await fetch('/api/ads');
        const json = await response.json();
        
        // Handle n8n response structure
        if (Array.isArray(json)) {
            rawAdsData = json.map(item => {
                // Handle n8n's nested structure
                if (item.json) {
                    return item.json;
                }
                return item;
            });
        } else if (json.data && Array.isArray(json.data)) {
            rawAdsData = json.data;
        } else if (json.json && Array.isArray(json.json)) {
            rawAdsData = json.json;
        } else {
            // Single object or wrapped
            rawAdsData = [json.json || json];
        }

        // Debug: Log available fields from first item
        if (rawAdsData.length > 0) {
            console.log("Available fields in raw data:", Object.keys(rawAdsData[0]));
            console.log("Sample raw data item:", rawAdsData[0]);
        }

        // Helper function to get field value with multiple fallback options
        const getFieldValue = (ad, possibleNames, defaultValue = 0, type = 'number') => {
            for (const name of possibleNames) {
                if (ad[name] !== undefined && ad[name] !== null && ad[name] !== '') {
                    return type === 'number' ? parseFloat(ad[name]) : ad[name];
                }
            }
            return defaultValue;
        };

        // Clean and normalize data
        rawAdsData = rawAdsData.map(ad => {
            // Try multiple field name variations for leads
            const leads = getFieldValue(ad, [
                'total_leads', 'leads', 'Leads', 'Total Leads', 
                'total_leads_generated', 'leads_generated', 'conversions'
            ], 0, 'number');
            
            // Try multiple field name variations for spend
            const spend = getFieldValue(ad, [
                'total_spend', 'spend', 'Spend', 'Total Spend', 
                'amount_spent', 'cost', 'Cost'
            ], 0, 'number');
            
            // Try multiple field name variations for impressions
            const impressions = getFieldValue(ad, [
                'total_impressions', 'impressions', 'Impressions', 
                'Total Impressions', 'imp'
            ], 0, 'number');
            
            // Try multiple field name variations for clicks
            const clicks = getFieldValue(ad, [
                'clicks', 'Clicks', 'Total Clicks', 'link_clicks', 'linkClicks'
            ], Math.round(impressions * 0.01), 'number');
            
            // Try multiple field name variations for CPL
            const cpl = getFieldValue(ad, [
                'cost_per_lead', 'cpl', 'CPL', 'Cost Per Lead', 
                'cost_per_conversion'
            ], (leads > 0 ? spend / leads : 0), 'number');
            
            return {
                ...ad,
                total_spend: spend,
                total_leads: Math.round(leads), // Ensure it's an integer
                total_impressions: Math.round(impressions),
                clicks: Math.round(clicks),
                cost_per_lead: cpl,
                roas: parseFloat(ad.roas || ad.ROAS || ad.roi || 0),
                ad_name: ad.ad_name || ad['Ad Name'] || ad.adName || 'Unnamed Ad',
                campaign_name: ad.campaign_name || ad['Campaign Name'] || ad.campaignName || 'Unnamed Campaign',
                ad_id: ad.ad_id || ad.adId || ad.id || Math.random().toString(36).substr(2, 9),
                performance_category: ad.performance_category || ad.performance || ad.status || 'Unknown'
            };
        });

        console.log("Raw Data Sample:", rawAdsData[0]);
        console.log("Normalized Data:", rawAdsData);
        const totalLeads = rawAdsData.reduce((sum, ad) => sum + ad.total_leads, 0);
        console.log("Total Leads Found:", totalLeads);
        
        // Show leads breakdown by ad
        console.log("Leads per ad:", rawAdsData.map(ad => ({
            ad_name: ad.ad_name,
            total_leads: ad.total_leads,
            original_fields: {
                total_leads: ad.total_leads || 'not found',
                leads: ad.leads || 'not found',
                'Leads': ad['Leads'] || 'not found'
            }
        })));
        
        if (totalLeads === 0) {
            console.warn("⚠️ WARNING: No leads found! Check if the field name in Google Sheets matches one of: total_leads, leads, Leads, Total Leads, total_leads_generated, leads_generated, conversions");
        }

        if (!rawAdsData.length) {
            showToast("No data received from n8n.", "warning");
            return;
        }

        filteredData = [...rawAdsData];
        updateDashboard(filteredData);
        
        const now = new Date();
        document.getElementById('lastUpdated').innerHTML = 
            `<i class="fas fa-check-circle" style="color: var(--success);"></i> Last synced: ${now.toLocaleTimeString()}`;

        showToast("Data loaded successfully!", "success");

    } catch (error) {
        console.error("Fetch error:", error);
        showToast("Failed to connect to Dashboard Server", "error");
        document.getElementById('lastUpdated').innerHTML = 
            `<i class="fas fa-exclamation-circle" style="color: var(--danger);"></i> Connection failed`;
    } finally {
        loader.style.display = 'none';
    }
}

// ==========================================
// 2. DASHBOARD UPDATE
// ==========================================
function updateDashboard(data) {
    if (!data || data.length === 0) return;

    // Calculate comprehensive metrics
    const metrics = calculateMetrics(data);
    
    // Update KPIs
    updateKPIs(metrics);
    
    // Render components
    renderCharts(data);
    renderCampaignComparison(data);
    renderTable(data);
    renderInsights(data, metrics);
    
    // Update campaign filter
    updateCampaignFilter(data);
    
    // Update table count
    document.getElementById('tableCount').textContent = `Showing ${data.length} ads`;
}

// ==========================================
// 3. METRICS CALCULATION
// ==========================================
function calculateMetrics(data) {
    let totalSpend = 0;
    let totalLeads = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalROAS = 0;
    let activeAds = 0;

    data.forEach(ad => {
        totalSpend += ad.total_spend || 0;
        totalLeads += ad.total_leads || 0;
        totalImpressions += ad.total_impressions || 0;
        totalClicks += ad.clicks || 0;
        totalROAS += ad.roas || 0;
        if (ad.total_leads > 0) activeAds++;
    });

    const avgCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const convRate = totalClicks > 0 ? (totalLeads / totalClicks) * 100 : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgROAS = data.length > 0 ? totalROAS / data.length : 0;

    return {
        totalSpend,
        totalLeads,
        totalImpressions,
        totalClicks,
        avgCPL,
        convRate,
        ctr,
        avgROAS,
        activeAds
    };
}

// ==========================================
// 4. KPI UPDATES
// ==========================================
function updateKPIs(metrics) {
    animateValue("totalSpend", metrics.totalSpend, "₹");
    animateValue("totalLeads", metrics.totalLeads, "");
    animateValue("cpl", metrics.avgCPL, "₹");
    animateValue("totalImpressions", metrics.totalImpressions, "");
    animateValue("totalClicks", metrics.totalClicks, "");
    animateValue("avgROAS", metrics.avgROAS, "", "x");
    
    document.getElementById('conversionRate').textContent = metrics.convRate.toFixed(2) + '%';
    document.getElementById('ctr').textContent = metrics.ctr.toFixed(2) + '%';
    
    // Add change indicators (simulated - you can enhance with historical data)
    updateChangeIndicators();
}

function updateChangeIndicators() {
    // Simulated change indicators - replace with actual historical comparison
    const changes = [
        { id: 'spendChange', value: '+12.5%', positive: true },
        { id: 'leadsChange', value: '+8.3%', positive: true },
        { id: 'cplChange', value: '-4.2%', positive: true },
        { id: 'convChange', value: '+2.1%', positive: true },
        { id: 'impressionsChange', value: '+15.7%', positive: true },
        { id: 'clicksChange', value: '+9.4%', positive: true },
        { id: 'roasChange', value: '+6.8%', positive: true },
        { id: 'ctrChange', value: '-3.2%', positive: false }
    ];

    changes.forEach(change => {
        const el = document.getElementById(change.id);
        if (el) {
            el.textContent = change.value;
            el.className = `kpi-change ${change.positive ? 'positive' : 'negative'}`;
            el.innerHTML = `${change.positive ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>'} ${change.value}`;
        }
    });
}

// ==========================================
// 5. CHARTS RENDERING
// ==========================================
function renderCharts(data) {
    renderMainTrendChart(data);
    renderPieChart(data);
    renderPerformanceChart(data);
    renderROIChart(data);
}

function renderMainTrendChart(data) {
    const ctx = document.getElementById('mainTrendChart');
    if (!ctx) return;

    const sortBy = document.getElementById('chartSort')?.value || 'spend';
    let sorted = [...data].sort((a, b) => {
        if (sortBy === 'spend') return b.total_spend - a.total_spend;
        if (sortBy === 'leads') return b.total_leads - a.total_leads;
        if (sortBy === 'cpl') return (a.cost_per_lead || 0) - (b.cost_per_lead || 0);
        return 0;
    }).slice(0, 10);

    const labels = sorted.map(d => {
        const name = d.ad_name || 'Unnamed';
        return name.length > 20 ? name.substring(0, 20) + '...' : name;
    });
    const spendData = sorted.map(d => d.total_spend);
    const leadsData = sorted.map(d => d.total_leads);

    if (chartInstances.mainTrend) {
        chartInstances.mainTrend.destroy();
    }

    chartInstances.mainTrend = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Spend (₹)',
                    data: spendData,
                    backgroundColor: 'rgba(37, 99, 235, 0.8)',
                    borderRadius: 8,
                    order: 2
                },
                {
                    label: 'Leads Generated',
                    data: leadsData,
                    type: 'line',
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1',
                    order: 1,
                    pointRadius: 5,
                    pointBackgroundColor: '#10b981'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        callback: function(value) {
                            return '₹' + value.toLocaleString();
                        }
                    }
                },
                y1: {
                    position: 'right',
                    beginAtZero: true,
                    grid: {
                        drawOnChartArea: false
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// ==========================================
// 6. TABLE RENDERING & FILTERING
// ==========================================
function renderTable(data) {
    const tbody = document.getElementById('adsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 40px; color: var(--text-light);">No ads found</td></tr>';
        return;
    }

    data.forEach(ad => {
        const perf = (ad.performance_category || '').toLowerCase();
        const isGood = perf.includes('yes') || perf.includes('good') || perf.includes('performing');
        const isBad = perf.includes('wasted') || perf.includes('bad') || perf.includes('no') || perf.includes('poor');
        
        let statusColor = 'gray';
        let statusText = ad.performance_category || 'Unknown';
        if (isGood) {
            statusColor = 'green';
            statusText = 'Performing Well';
        } else if (isBad) {
            statusColor = 'red';
            statusText = 'Needs Optimization';
        }

        const ctr = ad.total_impressions > 0 ? ((ad.clicks / ad.total_impressions) * 100).toFixed(2) : '0.00';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <span class="status-dot ${statusColor}"></span>
                <span style="font-size: 12px;">${statusText}</span>
            </td>
            <td>
                <strong style="display: block; margin-bottom: 4px;">${escapeHtml(ad.ad_name)}</strong>
                <small style="color: var(--text-light); font-size: 11px;">${escapeHtml(ad.campaign_name)}</small>
            </td>
            <td class="text-right">₹${ad.total_spend.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
            <td class="text-right">${ad.total_impressions.toLocaleString()}</td>
            <td class="text-right">${ad.clicks.toLocaleString()}</td>
            <td class="text-right"><strong>${ad.total_leads}</strong></td>
            <td class="text-right">₹${ad.cost_per_lead.toFixed(2)}</td>
            <td class="text-right">${ad.roas.toFixed(2)}x</td>
            <td class="text-center">
                <button class="action-btn" onclick="showDetails('${ad.ad_id}')">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterTable() {
    const searchTerm = document.getElementById('tableSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';

    filteredData = rawAdsData.filter(ad => {
        const matchesSearch = 
            (ad.ad_name || '').toLowerCase().includes(searchTerm) ||
            (ad.campaign_name || '').toLowerCase().includes(searchTerm);
        
        const perf = (ad.performance_category || '').toLowerCase();
        const isGood = perf.includes('yes') || perf.includes('good') || perf.includes('performing');
        const isBad = perf.includes('wasted') || perf.includes('bad') || perf.includes('no') || perf.includes('poor');
        
        let matchesStatus = true;
        if (statusFilter === 'good') {
            matchesStatus = isGood;
        } else if (statusFilter === 'bad') {
            matchesStatus = isBad;
        }

        return matchesSearch && matchesStatus;
    });

    renderTable(filteredData);
    updateDashboard(filteredData);
    document.getElementById('tableCount').textContent = `Showing ${filteredData.length} ads`;
}

function sortTable(field) {
    if (!field) {
        field = document.getElementById('sortBy')?.value || 'spend';
    }

    // Toggle sort direction if clicking same field
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }

    filteredData.sort((a, b) => {
        let aVal, bVal;
        
        switch(field) {
            case 'spend':
                aVal = a.total_spend;
                bVal = b.total_spend;
                break;
            case 'leads':
                aVal = a.total_leads;
                bVal = b.total_leads;
                break;
            case 'cpl':
                aVal = a.cost_per_lead || 0;
                bVal = b.cost_per_lead || 0;
                break;
            case 'roas':
                aVal = a.roas || 0;
                bVal = b.roas || 0;
                break;
            case 'impressions':
                aVal = a.total_impressions;
                bVal = b.total_impressions;
                break;
            case 'clicks':
                aVal = a.clicks;
                bVal = b.clicks;
                break;
            case 'ad_name':
                aVal = (a.ad_name || '').toLowerCase();
                bVal = (b.ad_name || '').toLowerCase();
                break;
            case 'status':
                const aPerf = (a.performance_category || '').toLowerCase();
                const bPerf = (b.performance_category || '').toLowerCase();
                aVal = aPerf.includes('good') ? 1 : aPerf.includes('bad') ? -1 : 0;
                bVal = bPerf.includes('good') ? 1 : bPerf.includes('bad') ? -1 : 0;
                break;
            default:
                return 0;
        }

        if (typeof aVal === 'string') {
            return currentSort.direction === 'asc' ? 
                aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }

        return currentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    renderTable(filteredData);
}

function filterByCampaign() {
    const campaign = document.getElementById('campaignFilter')?.value || 'all';
    
    if (campaign === 'all') {
        filteredData = [...rawAdsData];
    } else {
        filteredData = rawAdsData.filter(ad => ad.campaign_name === campaign);
    }

    renderTable(filteredData);
    updateDashboard(filteredData);
    document.getElementById('tableCount').textContent = `Showing ${filteredData.length} ads`;
}

function updateCampaignFilter(data) {
    const select = document.getElementById('campaignFilter');
    if (!select) return;

    const campaigns = [...new Set(data.map(ad => ad.campaign_name).filter(Boolean))];
    const currentValue = select.value;

    select.innerHTML = '<option value="all">All Campaigns</option>' +
        campaigns.map(camp => `<option value="${escapeHtml(camp)}">${escapeHtml(camp)}</option>`).join('');

    if (currentValue && campaigns.includes(currentValue)) {
        select.value = currentValue;
    }
}

function applyDateFilter() {
    // This would filter by date if date fields are available
    // For now, just refresh the view
    filterTable();
}

// ==========================================
// 8. INSIGHTS & RECOMMENDATIONS
// ==========================================
function renderInsights(data, metrics) {
    const container = document.getElementById('aiInsights');
    if (!container || !data.length) return;

    const insights = [];

    // Top performer
    const topPerformer = data.reduce((prev, curr) => 
        (curr.total_leads > prev.total_leads) ? curr : prev, data[0]);
    
    if (topPerformer && topPerformer.total_leads > 0) {
        insights.push({
            type: 'positive',
            icon: 'fa-trophy',
            title: 'Top Performing Ad',
            message: `"${topPerformer.ad_name}" is generating ${topPerformer.total_leads} leads with a CPL of ₹${topPerformer.cost_per_lead.toFixed(2)}. Consider increasing budget by 20-30% to scale this success.`
        });
    }

    // Worst performer
    const worstPerformer = data
        .filter(ad => ad.total_leads > 0 && ad.cost_per_lead > 0)
        .reduce((prev, curr) => {
            const prevCPL = prev.cost_per_lead || Infinity;
            const currCPL = curr.cost_per_lead || Infinity;
            return currCPL > prevCPL ? curr : prev;
        }, null);

    if (worstPerformer && worstPerformer.cost_per_lead > metrics.avgCPL * 1.5) {
        insights.push({
            type: 'negative',
            icon: 'fa-exclamation-triangle',
            title: 'Optimization Opportunity',
            message: `"${worstPerformer.ad_name}" has a CPL of ₹${worstPerformer.cost_per_lead.toFixed(2)} (${((worstPerformer.cost_per_lead / metrics.avgCPL - 1) * 100).toFixed(0)}% above average). Review creative, audience targeting, or consider pausing.`
        });
    }

    // High spend, low leads
    const highSpendLowLeads = data
        .filter(ad => ad.total_spend > metrics.totalSpend / data.length && ad.total_leads === 0)
        .sort((a, b) => b.total_spend - a.total_spend)[0];

    if (highSpendLowLeads) {
        insights.push({
            type: 'warning',
            icon: 'fa-dollar-sign',
            title: 'Budget Alert',
            message: `"${highSpendLowLeads.ad_name}" has spent ₹${highSpendLowLeads.total_spend.toFixed(2)} with 0 leads. Immediate review recommended.`
        });
    }

    // Best ROI
    const bestROI = data
        .filter(ad => ad.roas > 0)
        .reduce((prev, curr) => (curr.roas > prev.roas) ? curr : prev, null);

    if (bestROI && bestROI.roas > 2) {
        insights.push({
            type: 'info',
            icon: 'fa-chart-line',
            title: 'High ROI Campaign',
            message: `"${bestROI.ad_name}" shows excellent ROI at ${bestROI.roas.toFixed(2)}x. This indicates strong conversion quality. Consider replicating this strategy.`
        });
    }

    // Overall performance
    if (metrics.avgCPL > 0 && metrics.avgCPL < 50) {
        insights.push({
            type: 'positive',
            icon: 'fa-check-circle',
            title: 'Strong Overall Performance',
            message: `Your average CPL of ₹${metrics.avgCPL.toFixed(2)} is excellent. The campaign is generating quality leads efficiently.`
        });
    }

    container.innerHTML = insights.map(insight => `
        <div class="insight-item ${insight.type}">
            <strong><i class="fas ${insight.icon}"></i> ${insight.title}</strong>
            <p>${insight.message}</p>
        </div>
    `).join('');
}

// ==========================================
// 9. MODAL & DETAILS
// ==========================================
function showDetails(adId) {
    const ad = rawAdsData.find(a => a.ad_id == adId || a.ad_id === adId);
    if (!ad) {
        showToast("Ad details not found", "error");
        return;
    }

    const metrics = {
        ctr: ad.total_impressions > 0 ? ((ad.clicks / ad.total_impressions) * 100).toFixed(2) : '0.00',
        convRate: ad.clicks > 0 ? ((ad.total_leads / ad.clicks) * 100).toFixed(2) : '0.00',
        revenue: ad.roas > 0 ? (ad.total_spend * ad.roas).toFixed(2) : 'N/A'
    };

    document.getElementById('modalTitle').textContent = ad.ad_name || 'Ad Details';
    document.getElementById('modalBody').innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px;">
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">Total Spend</small>
                <h3 style="margin-top: 8px; color: var(--primary);">₹${ad.total_spend.toLocaleString(undefined, {maximumFractionDigits: 2})}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">Leads Generated</small>
                <h3 style="margin-top: 8px; color: var(--success);">${ad.total_leads}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">Cost Per Lead</small>
                <h3 style="margin-top: 8px; color: var(--primary);">₹${ad.cost_per_lead.toFixed(2)}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">ROAS</small>
                <h3 style="margin-top: 8px; color: var(--accent);">${ad.roas.toFixed(2)}x</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">Impressions</small>
                <h3 style="margin-top: 8px; color: var(--primary);">${ad.total_impressions.toLocaleString()}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">CTR</small>
                <h3 style="margin-top: 8px; color: var(--primary);">${metrics.ctr}%</h3>
            </div>
        </div>
        <div style="margin-bottom: 20px;">
            <strong style="display: block; margin-bottom: 8px; color: var(--primary);">Campaign:</strong>
            <p style="color: var(--text-main);">${escapeHtml(ad.campaign_name || 'N/A')}</p>
        </div>
        ${ad.justification ? `
        <div style="margin-bottom: 20px;">
            <strong style="display: block; margin-bottom: 8px; color: var(--primary);">Justification:</strong>
            <p style="color: var(--text-main); line-height: 1.6;">${escapeHtml(ad.justification)}</p>
        </div>
        ` : ''}
        ${ad.recommendation ? `
        <div style="margin-bottom: 20px;">
            <strong style="display: block; margin-bottom: 8px; color: var(--primary);">Recommendation:</strong>
            <p style="color: var(--text-main); line-height: 1.6;">${escapeHtml(ad.recommendation)}</p>
        </div>
        ` : ''}
        <div style="padding: 12px; background: var(--accent-light); border-radius: 8px; border-left: 4px solid var(--accent);">
            <small style="color: var(--accent); font-weight: 600;">Performance Status:</small>
            <p style="margin-top: 4px; color: var(--primary); font-weight: 600;">${ad.performance_category || 'Unknown'}</p>
        </div>
    `;
    
    document.getElementById('detailModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('detailModal').style.display = 'none';
}

// ==========================================
// 10. EXPORT FUNCTIONALITY
// ==========================================
function exportToCSV() {
    if (!filteredData.length) {
        showToast("No data to export", "warning");
        return;
    }

    const headers = ['Ad Name', 'Campaign', 'Spend', 'Impressions', 'Clicks', 'Leads', 'CPL', 'ROAS', 'Performance'];
    const rows = filteredData.map(ad => [
        ad.ad_name || '',
        ad.campaign_name || '',
        ad.total_spend || 0,
        ad.total_impressions || 0,
        ad.clicks || 0,
        ad.total_leads || 0,
        ad.cost_per_lead || 0,
        ad.roas || 0,
        ad.performance_category || ''
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `meta-ads-data-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("Data exported successfully!", "success");
}

// ==========================================
// 11. UTILITIES
// ==========================================
function animateValue(id, value, prefix = "", suffix = "") {
    const obj = document.getElementById(id);
    if (!obj) return;

    const formatted = typeof value === 'number' 
        ? (Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2))
        : value;
    
    obj.textContent = prefix + formatted + suffix;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Make functions globally available
window.fetchData = fetchData;
window.showDetails = showDetails;
window.closeModal = closeModal;
window.filterTable = filterTable;
window.sortTable = sortTable;
window.filterByCampaign = filterByCampaign;
window.applyDateFilter = applyDateFilter;
window.updateCharts = updateCharts;
window.exportToCSV = exportToCSV;
