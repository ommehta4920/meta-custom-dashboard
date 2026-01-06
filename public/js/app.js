// ==========================================
// GLOBAL STATE
// ==========================================
let rawAdsData = [];
let rawCampaignData = [];
let filteredData = [];
let filteredCampaignData = [];
let currentPage = 'overview';
let chartInstances = {
    mainTrend: null,
    pie: null,
    performance: null,
    roi: null,
    adsTrend: null,
    campaignPie: null,
    campaignROI: null,
    campaignPerformance: null
};
let currentSort = { field: null, direction: 'asc' };
let adsCurrentSort = { field: null, direction: 'asc' };
let campaignCurrentSort = { field: null, direction: 'asc' };

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    fetchCampaignData();
    setupEventListeners();
    showPage('overview');
});

function setupEventListeners() {
    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

async function fetchCampaignData() {
    try {
        console.log('Fetching campaign data from backend...');

        const response = await fetch('/api/campaigns');

        if (!response.ok) {
            throw new Error(`Campaign API error: ${response.status}`);
        }

        const json = await response.json();

        // Normalize n8n-style responses
        rawCampaignData = Array.isArray(json)
            ? json.map(item => item.json ?? item)
            : [];

        filteredCampaignData = [...rawCampaignData];

        console.log('Campaign data loaded:', rawCampaignData.length);
        console.log('Sample campaign:', rawCampaignData[0]);

        // If user is on Campaign page → render immediately
        if (currentPage === 'campaigns') {
            updateDashboard(filteredData);
        }

    } catch (error) {
        console.error('Failed to fetch campaign data:', error);
        rawCampaignData = [];
        filteredCampaignData = [];
    }
}


// ==========================================
// PAGE NAVIGATION
// ==========================================
function showPage(page) {
    currentPage = page;

    // Hide all pages
    document.querySelectorAll('.page-content').forEach(p => {
        p.style.display = 'none';
    });

    // Show selected page
    const pageElement = document.getElementById(page + 'Page');
    if (pageElement) {
        pageElement.style.display = 'block';
    }

    // Update navigation active state
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.remove('active');
    });

    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach((link, index) => {
        if (link.getAttribute('onclick')?.includes(`'${page}'`)) {
            link.parentElement.classList.add('active');
        }
    });

    // Update dashboard for current page
    if (filteredData.length > 0) {
        updateDashboard(filteredData);
    }
}

// ==========================================
// 1. DATA FETCHING
// ==========================================
async function fetchData() {
    const loader = document.getElementById('loadingOverlay');
    loader.style.display = 'flex';
    document.getElementById('lastUpdated').innerHTML = '<i class="fas fa-clock"></i> Syncing data...';

    try {
        const response = await fetch('/api/ads');

        // Check if response is ok
        if (!response.ok) {
            // Try to get error details from response
            let errorData = {};
            try {
                errorData = await response.json();
            } catch (e) {
                // If response is not JSON, create error from status
                errorData = {
                    error: `Server returned ${response.status}: ${response.statusText}`,
                    details: "Unable to parse error response"
                };
            }

            const error = new Error(errorData.error || `Server returned ${response.status}: ${response.statusText}`);
            error.errorData = errorData;
            throw error;
        }

        const json = await response.json();

        // Handle n8n response structure
        if (Array.isArray(json)) {
            rawAdsData = json.map(item => {
                // Handle n8n's nested structure
                if (item && item.json) {
                    return item.json;
                }
                return item;
            }).filter(item => item != null); // Filter out null/undefined items
        } else if (json.data && Array.isArray(json.data)) {
            rawAdsData = json.data.filter(item => item != null); // Filter out null/undefined items
        } else if (json.json && Array.isArray(json.json)) {
            rawAdsData = json.json.filter(item => item != null); // Filter out null/undefined items
        } else {
            // Single object or wrapped
            const singleItem = json.json || json;
            rawAdsData = singleItem != null ? [singleItem] : [];
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

        // Clean and normalize data - filter out null/undefined items first
        rawAdsData = rawAdsData.filter(ad => ad != null).map(ad => {
            try {
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
                    'total_clicks', 'clicks', 'Clicks', 'Total Clicks',
                    'link_clicks', 'linkClicks', 'totalClicks'
                ], Math.round(impressions * 0.01), 'number');

                // Try multiple field name variations for CPL
                const cpl = getFieldValue(ad, [
                    'cost_per_lead', 'cpl', 'CPL', 'Cost Per Lead',
                    'cost_per_conversion'
                ], (leads > 0 ? spend / leads : 0), 'number');

                // Ensure cost_per_lead is always a valid number
                const safeCpl = (cpl != null && !isNaN(cpl) && isFinite(cpl)) ? cpl : (leads > 0 ? spend / leads : 0);

                // Get campaign name with multiple fallbacks (handle empty strings)
                let campaignName = getFieldValue(ad, [
                    'campaign_name', 'Campaign Name', 'campaignName', 'Campaign',
                    'campaign', 'Campaign_Name', 'campaign_name', 'CampaignName'
                ], '', 'string');
                // If campaign_name is empty string, try to get from adset or use default
                if (!campaignName || campaignName.trim() === '') {
                    campaignName = getFieldValue(ad, [
                        'adset_name', 'Adset Name', 'adsetName', 'Adset_Name',
                        'ad_set_name', 'Ad Set Name'
                    ], 'Unnamed Campaign', 'string');
                }
                // Final fallback
                if (!campaignName || campaignName.trim() === '') {
                    campaignName = 'Unnamed Campaign';
                }

                // Get performance category with multiple fallbacks
                const performanceCategory = getFieldValue(ad, [
                    'Performing Ad', 'performing_ad', 'Performing_Ad', 'performingAd',
                    'performance_category', 'Performance Category', 'performanceCategory',
                    'performance', 'Performance', 'status', 'Status',
                    'Performance_Status', 'performance_status', 'PerformanceStatus'
                ], 'Unknown', 'string');

                // Get ad name with multiple fallbacks
                const adName = getFieldValue(ad, [
                    'ad_name', 'Ad Name', 'adName', 'Ad_Name',
                    'name', 'Name', 'ad', 'Ad'
                ], 'Unnamed Ad', 'string');

                // Get ad ID with multiple fallbacks
                const adId = getFieldValue(ad, [
                    'ad_id', 'Ad ID', 'adId', 'Ad_Id',
                    'id', 'Id', 'ID', '_id'
                ], Math.random().toString(36).substr(2, 9), 'string');

                return {
                    ...ad, // Keep all original fields first
                    // Normalized numeric fields
                    total_spend: spend || 0,
                    total_leads: Math.round(leads) || 0,
                    total_impressions: Math.round(impressions) || 0,
                    clicks: Math.round(clicks) || 0,
                    // Also preserve total_clicks if it exists
                    total_clicks: ad.total_clicks || Math.round(clicks) || 0,
                    cost_per_lead: safeCpl,
                    roas: parseFloat(ad.roas || ad.ROAS || ad.roi || ad.ROI || 0),
                    // Normalized string fields - these will override original if they exist
                    ad_name: adName,
                    campaign_name: campaignName,
                    ad_id: adId,
                    performance_category: performanceCategory,
                    // Preserve original fields that might be useful
                    adset_name: ad.adset_name || ad.adsetName || ad['Adset Name'] || '',
                    justification: ad.Justification || ad.justification || '',
                    recommendation: ad.Recommendation || ad.recommendation || '',
                    objective: ad.objective || ad.Objective || '',
                    ctr: ad.ctr || ad.CTR || 0,
                    cpc: ad.cpc || ad.CPC || 0,
                    cpm: ad.cpm || ad.CPM || 0,
                    conversion_rate: ad.conversion_rate || ad.Conversion_Rate || ad['Conversion Rate'] || 0,
                    // Date fields - preserve as-is (might be strings, Date objects, or timestamps)
                    start_date: ad.start_date || ad.startDate || ad['Start Date'] || ad.Start_Date || null,
                    stop_date: ad.stop_date || ad.stopDate || ad['Stop Date'] || ad.Stop_Date || null,
                    // Ad metadata fields
                    ad_created_time: ad.ad_created_time || ad.adCreatedTime || ad['Ad Created Time'] || ad.ad_created_time || null,
                    effective_status: ad.effective_status || ad.effectiveStatus || ad['Effective Status'] || ad.Effective_Status || 'UNKNOWN'
                };
            } catch (error) {
                console.error('Error normalizing ad data:', error);
                console.error('Problematic ad data:', ad);
                // Return a minimal valid object to prevent crashes
                return {
                    ...ad,
                    total_spend: 0,
                    total_leads: 0,
                    total_impressions: 0,
                    clicks: 0,
                    cost_per_lead: 0,
                    roas: 0,
                    ad_name: ad.ad_name || ad['Ad Name'] || 'Error processing ad',
                    campaign_name: ad.campaign_name || ad['Campaign Name'] || 'Unknown',
                    ad_id: ad.ad_id || ad.id || Math.random().toString(36).substr(2, 9),
                    performance_category: 'Unknown',
                    start_date: ad.start_date || null,
                    stop_date: ad.stop_date || null,
                    ad_created_time: ad.ad_created_time || null,
                    effective_status: ad.effective_status || 'UNKNOWN'
                };
            }
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
        applyFilters();

        const now = new Date();
        document.getElementById('lastUpdated').innerHTML =
            `<i class="fas fa-check-circle" style="color: var(--success);"></i> Last synced: ${now.toLocaleTimeString()}`;

        showToast("Data loaded successfully!", "success");

    } catch (error) {
        console.error("Fetch error:", error);
        console.error("Error stack:", error.stack);
        console.error("Error name:", error.name);
        console.error("Error code:", error.code);

        let errorMessage = "Failed to connect to Dashboard Server";
        let errorDetails = "";

        // Check if error has response (from our server)
        if (error.message) {
            // Check if it's a server error response
            if (error.message.includes('Server returned')) {
                errorMessage = error.message;
                if (error.errorData && error.errorData.details) {
                    errorDetails = error.errorData.details;
                }
            } else if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
                errorMessage = "Cannot connect to server";
                errorDetails = "Please make sure the dashboard server is running on port 3000. Check the terminal/console for server errors.";
            } else {
                errorDetails = error.message;
            }
        }

        // Check for network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = "Network Error";
            errorDetails = "Unable to reach the server. Please check:\n1. Server is running (npm start)\n2. Server is on port 3000\n3. No firewall blocking the connection";
        }

        // If error was thrown with error data, extract it
        if (error.errorData) {
            const errorData = error.errorData;
            errorMessage = errorData.error || errorMessage;
            errorDetails = errorData.details || errorData.message || errorDetails;

            // Provide user-friendly messages based on error type
            if (errorData.code === 'ECONNREFUSED') {
                errorMessage = "Cannot connect to n8n webhook";
                errorDetails = "The n8n server appears to be unreachable. Please check the server configuration.";
            } else if (errorData.code === 'ETIMEDOUT' || errorData.code === 'ECONNABORTED') {
                errorMessage = "Request timed out";
                errorDetails = "The n8n webhook did not respond in time. Please try again.";
            } else if (errorData.code === 'ENOTFOUND') {
                errorMessage = "Invalid webhook URL";
                errorDetails = "Could not resolve the n8n webhook hostname. Please check the URL configuration.";
            }
        }

        console.error("Error details:", errorMessage, errorDetails);
        const fullErrorMessage = errorMessage + (errorDetails ? ": " + errorDetails : "");
        showToast(fullErrorMessage, "error");
        document.getElementById('lastUpdated').innerHTML =
            `<i class="fas fa-exclamation-circle" style="color: var(--danger);"></i> ${errorMessage}`;
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

    // Update based on current page
    if (currentPage === 'overview') {
        // For overview, aggregate both ads and campaign data
        const campaignData = aggregateCampaignData(data);
        const combinedMetrics = {
            ...metrics,
            totalCampaigns: campaignData.length,
            totalAds: data.length
        };
        updateKPIs(combinedMetrics);
        renderCharts(data, campaignData);
        renderCampaignComparison(data);
        renderTable(data);
        renderInsights(data, combinedMetrics);
        document.getElementById('tableCount').textContent = `Showing ${data.length} ads across ${campaignData.length} campaigns`;
    } else if (currentPage === 'ads') {
        updateAdsKPIs(metrics);
        renderAdsCharts(data);
        renderAdsTable(data);
        document.getElementById('adsTableCount').textContent = `Showing ${data.length} ads`;
    } else if (currentPage === 'campaigns') {
        // Use campaign data if available, otherwise aggregate from ads
        let campaignData = [];
        if (rawCampaignData && rawCampaignData.length > 0) {
            campaignData = filteredCampaignData.length > 0 ? filteredCampaignData : rawCampaignData;
        } else {
            campaignData = aggregateCampaignData(data);
        }

        updateCampaignKPIs(campaignData);
        renderCampaignCharts(campaignData);
        renderCampaignComparison(campaignData);
        const sortedCampaigns = [...campaignData].sort((a, b) => (b.total_spend || b.spend || 0) - (a.total_spend || a.spend || 0));
        renderCampaignWiseTable(sortedCampaigns);
        document.getElementById('campaignTableCount').textContent = `Showing ${campaignData.length} campaigns`;
    }

    // Update campaign filter
    updateCampaignFilter(data);
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

    let roasCount = 0;
    data.filter(ad => ad != null).forEach(ad => {
        totalSpend += ad.total_spend || 0;
        totalLeads += ad.total_leads || 0;
        totalImpressions += ad.total_impressions || 0;
        totalClicks += ad.clicks || ad.total_clicks || 0;
        if (ad.roas && ad.roas > 0) {
            totalROAS += ad.roas;
            roasCount++;
        }
        if (ad.total_leads > 0) activeAds++;
    });

    const avgCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const convRate = totalClicks > 0 ? (totalLeads / totalClicks) * 100 : 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgROAS = roasCount > 0 ? totalROAS / roasCount : 0;

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
function renderCharts(data, campaignData = null) {
    // If campaignData not provided, aggregate it
    if (!campaignData) {
        campaignData = aggregateCampaignData(data);
    }
    renderMainTrendChart(data);
    renderPieChart(data);
    renderPerformanceChart(data, campaignData);
    renderROIChart(data);
}

function renderMainTrendChart(data) {
    const ctx = document.getElementById('mainTrendChart');
    if (!ctx) return;

    const sortBy = document.getElementById('chartSort')?.value || 'spend';

    // Filter out null/undefined and ensure we have valid data
    let sorted = [...data].filter(ad => ad != null && ad.total_spend != null).sort((a, b) => {
        if (sortBy === 'spend') return (b.total_spend || 0) - (a.total_spend || 0);
        if (sortBy === 'leads') return (b.total_leads || 0) - (a.total_leads || 0);
        if (sortBy === 'cpl') {
            const aCPL = a.cost_per_lead || (a.total_leads > 0 ? a.total_spend / a.total_leads : 0);
            const bCPL = b.cost_per_lead || (b.total_leads > 0 ? b.total_spend / b.total_leads : 0);
            return aCPL - bCPL;
        }
        return 0;
    }).slice(0, 10);

    if (sorted.length === 0) {
        if (chartInstances.mainTrend) {
            chartInstances.mainTrend.destroy();
            chartInstances.mainTrend = null;
        }
        return;
    }

    const labels = sorted.map(d => {
        const name = d.ad_name || 'Unnamed';
        return name.length > 20 ? name.substring(0, 20) + '...' : name;
    });
    const spendData = sorted.map(d => d.total_spend || 0);
    const leadsData = sorted.map(d => d.total_leads || 0);

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
                        callback: function (value) {
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

function renderPieChart(data) {
    const ctx = document.getElementById('pieChart');
    if (!ctx) return;

    const campaignStats = {};
    data.filter(ad => ad != null).forEach(ad => {
        const camp = ad.campaign_name || 'Unknown';
        if (!campaignStats[camp]) {
            campaignStats[camp] = { spend: 0, leads: 0 };
        }
        campaignStats[camp].spend += ad.total_spend || 0;
        campaignStats[camp].leads += ad.total_leads || 0;
    });

    const labels = Object.keys(campaignStats);
    const spendData = Object.values(campaignStats).map(c => c.spend);

    if (chartInstances.pie) {
        chartInstances.pie.destroy();
    }

    const colors = [
        '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1',
        '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#64748b'
    ];

    chartInstances.pie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: spendData,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        padding: 12,
                        font: {
                            size: 11
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ₹${value.toLocaleString()} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderPerformanceChart(data, campaignData = null) {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;

    // Use provided campaignData or aggregate it
    let campaignPerf = {};

    if (campaignData && Array.isArray(campaignData)) {
        // Use provided aggregated campaign data
        campaignData.forEach(camp => {
            campaignPerf[camp.campaign_name] = {
                avgCPL: camp.avgCPL || 0,
                totalLeads: camp.leads || 0,
                spend: camp.spend || 0
            };
        });
    } else {
        // Aggregate from ad data
        data.filter(ad => ad != null).forEach(ad => {
            const camp = ad.campaign_name || 'Unknown';
            if (!campaignPerf[camp]) {
                campaignPerf[camp] = { spend: 0, leads: 0, cplSum: 0, cplCount: 0 };
            }
            campaignPerf[camp].spend += ad.total_spend || 0;
            campaignPerf[camp].leads += ad.total_leads || 0;
            const cpl = ad.cost_per_lead || (ad.total_leads > 0 ? (ad.total_spend || 0) / ad.total_leads : 0);
            if (cpl > 0) {
                campaignPerf[camp].cplSum += cpl;
                campaignPerf[camp].cplCount += 1;
            }
        });

        // Calculate averages
        Object.keys(campaignPerf).forEach(camp => {
            const perf = campaignPerf[camp];
            perf.avgCPL = perf.cplCount > 0 ? perf.cplSum / perf.cplCount : (perf.leads > 0 ? perf.spend / perf.leads : 0);
        });
    }

    const labels = Object.keys(campaignPerf).sort((a, b) =>
        (campaignPerf[b].totalLeads || campaignPerf[b].leads || 0) - (campaignPerf[a].totalLeads || campaignPerf[a].leads || 0)
    ).slice(0, 10);

    const avgCPL = labels.map(camp => campaignPerf[camp].avgCPL || 0);
    const totalLeads = labels.map(camp => campaignPerf[camp].totalLeads || campaignPerf[camp].leads || 0);

    if (chartInstances.performance) {
        chartInstances.performance.destroy();
    }

    chartInstances.performance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Avg CPL (₹)',
                    data: avgCPL,
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: 'Total Leads',
                    data: totalLeads,
                    type: 'line',
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    yAxisID: 'y1',
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    position: 'left',
                    ticks: {
                        callback: function (value) {
                            return '₹' + value.toFixed(0);
                        }
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

function renderROIChart(data) {
    const ctx = document.getElementById('roiChart');
    if (!ctx) return;

    // Calculate ROI for each campaign
    const campaignROI = {};
    data.filter(ad => ad != null).forEach(ad => {
        const camp = ad.campaign_name || 'Unknown';
        if (!campaignROI[camp]) {
            campaignROI[camp] = { spend: 0, revenue: 0, leads: 0, avgROAS: 0, roasCount: 0 };
        }
        campaignROI[camp].spend += ad.total_spend || 0;
        campaignROI[camp].leads += ad.total_leads || 0;

        // Calculate revenue from ROAS if available
        if (ad.roas && ad.roas > 0) {
            campaignROI[camp].revenue += (ad.total_spend || 0) * ad.roas;
            campaignROI[camp].avgROAS += ad.roas;
            campaignROI[camp].roasCount += 1;
        } else {
            // Estimate revenue: assume average value per lead (₹5000) if no ROAS
            campaignROI[camp].revenue += (ad.total_leads || 0) * 5000;
        }
    });

    // Calculate ROI percentage for each campaign
    const roiCalculations = Object.keys(campaignROI).map(camp => {
        const stats = campaignROI[camp];
        const spend = stats.spend || 0;
        const revenue = stats.revenue || 0;
        const roi = spend > 0 ? ((revenue - spend) / spend) * 100 : 0;
        return {
            campaign: camp,
            roi: roi,
            spend: spend,
            revenue: revenue
        };
    }).filter(item => item.spend > 0) // Only campaigns with spend
        .sort((a, b) => b.roi - a.roi) // Sort by ROI descending
        .slice(0, 8); // Top 8

    if (roiCalculations.length === 0) {
        if (chartInstances.roi) {
            chartInstances.roi.destroy();
            chartInstances.roi = null;
        }
        return;
    }

    const labels = roiCalculations.map(item => item.campaign);
    const roiData = roiCalculations.map(item => item.roi);

    if (chartInstances.roi) {
        chartInstances.roi.destroy();
    }

    chartInstances.roi = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'ROI %',
                data: roiData,
                backgroundColor: roiData.map(roi =>
                    roi > 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'
                ),
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `ROI: ${context.parsed.x.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return value.toFixed(0) + '%';
                        }
                    }
                }
            }
        }
    });
}

function updateCharts() {
    if (filteredData.length > 0) {
        renderCharts(filteredData);
    }
}

// ==========================================
// 6. CAMPAIGN COMPARISON
// ==========================================
function renderCampaignComparison(data) {
    const container = document.getElementById('campaignGrid') || document.getElementById('campaignWiseGrid');
    if (!container) return;

    // Check if data is campaign data or ad data
    const isCampaignData = data.length > 0 && data[0].campaign_id && !data[0].ad_name;

    let sortedCampaigns = [];

    if (isCampaignData) {
        // Direct campaign data
        sortedCampaigns = data
            .filter(camp => camp != null)
            .map(camp => ({
                name: camp.campaign_name || 'Unknown',
                spend: camp.total_spend || camp.spend || 0,
                leads: camp.total_leads || camp.leads || 0,
                impressions: camp.total_impressions || camp.impressions || 0,
                clicks: camp.total_clicks || camp.clicks || 0,
                ads: 1,
                avgCPL: camp.avgCPL || camp.cpc || (camp.total_clicks > 0 ? (camp.total_spend || camp.spend || 0) / (camp.total_clicks || camp.clicks || 1) : 0),
                avgROAS: camp.avgROAS || camp.roas || 0
            }))
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 6);
    } else {
        // Aggregate from ad data
        const campaignStats = {};
        data.filter(ad => ad != null).forEach(ad => {
            const camp = ad.campaign_name || 'Unknown';
            if (!campaignStats[camp]) {
                campaignStats[camp] = {
                    spend: 0,
                    leads: 0,
                    impressions: 0,
                    clicks: 0,
                    ads: 0,
                    avgCPL: 0,
                    avgROAS: 0,
                    roasSum: 0,
                    roasCount: 0
                };
            }
            campaignStats[camp].spend += ad.total_spend || 0;
            campaignStats[camp].leads += ad.total_leads || 0;
            campaignStats[camp].impressions += ad.total_impressions || 0;
            campaignStats[camp].clicks += ad.clicks || ad.total_clicks || 0;
            campaignStats[camp].ads += 1;
            if (ad.roas && ad.roas > 0) {
                campaignStats[camp].roasSum += ad.roas;
                campaignStats[camp].roasCount += 1;
            }
        });

        // Calculate averages
        Object.keys(campaignStats).forEach(camp => {
            const stats = campaignStats[camp];
            stats.avgCPL = stats.leads > 0 ? stats.spend / stats.leads : 0;
            stats.avgROAS = stats.roasCount > 0 ? stats.roasSum / stats.roasCount : 0;
        });

        // Sort by spend
        sortedCampaigns = Object.entries(campaignStats)
            .map(([name, stats]) => ({
                name: name,
                spend: stats.spend,
                leads: stats.leads,
                impressions: stats.impressions,
                clicks: stats.clicks,
                ads: stats.ads,
                avgCPL: stats.avgCPL,
                avgROAS: stats.avgROAS
            }))
            .sort((a, b) => b.spend - a.spend)
            .slice(0, 6);
    }

    container.innerHTML = sortedCampaigns.map(camp => `
        <div class="campaign-card">
            <div class="campaign-card-header">
                <div>
                    <div class="campaign-name">${escapeHtml(camp.name)}</div>
                    <div class="campaign-meta">${camp.ads} ${camp.ads === 1 ? 'campaign' : 'campaigns'}</div>
                </div>
            </div>
            <div class="campaign-stats">
                <div class="stat-item">
                    <div class="stat-value">₹${camp.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div class="stat-label">Total Spend</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${camp.clicks.toLocaleString()}</div>
                    <div class="stat-label">Clicks</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">₹${(camp.avgCPL || 0).toFixed(0)}</div>
                    <div class="stat-label">Avg CPC</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${((camp.impressions > 0 ? (camp.clicks / camp.impressions) * 100 : 0) || 0).toFixed(2)}%</div>
                    <div class="stat-label">CTR</div>
                </div>
            </div>
        </div>
    `).join('');
}

// ==========================================
// HELPER: Get Performance Status
// ==========================================
function getPerformanceStatus(ad) {
    // Check multiple field names for performance status
    const perfValue = ad['Performing Ad'] ||
        ad.performing_ad ||
        ad.Performing_Ad ||
        ad.performance_category ||
        ad.performance ||
        ad.status ||
        '';
    return String(perfValue).trim();
}

function getPerformanceInfo(ad) {
    const perf = getPerformanceStatus(ad).toLowerCase();
    const isGood = perf === 'yes' || perf.includes('good') || perf.includes('performing');
    const isBad = perf === 'no' || perf.includes('wasted') || perf.includes('bad') || perf.includes('poor');

    let statusColor = 'gray';
    let statusText = getPerformanceStatus(ad) || 'Unknown';

    if (isGood) {
        statusColor = 'green';
        statusText = 'Performing Well';
    } else if (isBad) {
        statusColor = 'red';
        statusText = 'Needs Optimization';
    }

    return { statusColor, statusText, isGood, isBad };
}

// ==========================================
// 7. TABLE RENDERING & FILTERING
// ==========================================
function renderTable(data) {
    const tbody = document.getElementById('adsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 40px; color: var(--text-light);">No ads found</td></tr>';
        return;
    }

    data.filter(ad => ad != null).forEach(ad => {
        const perfInfo = getPerformanceInfo(ad);

        const ctr = (ad.total_impressions || 0) > 0 ? (((ad.clicks || 0) / (ad.total_impressions || 1)) * 100).toFixed(2) : '0.00';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <span class="status-dot ${perfInfo.statusColor}"></span>
                <span style="font-size: 12px;">${perfInfo.statusText}</span>
            </td>
            <td>
                <strong style="display: block; margin-bottom: 4px;">${escapeHtml(ad.ad_name)}</strong>
                <small style="color: var(--text-light); font-size: 11px;">${escapeHtml(ad.campaign_name)}</small>
            </td>
            <td class="text-right">₹${ad.total_spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td class="text-right">${ad.total_impressions.toLocaleString()}</td>
            <td class="text-right">${ad.clicks.toLocaleString()}</td>
            <td class="text-right"><strong>${ad.total_leads}</strong></td>
            <td class="text-right">₹${(ad.cost_per_lead || 0).toFixed(2)}</td>
            <td class="text-right">${(ad.roas || 0).toFixed(2)}x</td>
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

    // Apply base filters first (this updates filteredData)
    const campaignFilter = document.getElementById('campaignFilter')?.value || 'all';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    const dateRange = document.getElementById('dateRange')?.value || 'all';

    let baseFiltered = rawAdsData.filter(ad => {
        if (!ad) return false;

        // Campaign filter
        let matchesCampaign = true;
        if (campaignFilter !== 'all') {
            matchesCampaign = ad.campaign_name === campaignFilter;
        }

        // Status filter
        const perfInfo = getPerformanceInfo(ad);

        let matchesStatus = true;
        if (statusFilter === 'good') {
            matchesStatus = perfInfo.isGood;
        } else if (statusFilter === 'bad') {
            matchesStatus = perfInfo.isBad;
        }

        return matchesCampaign && matchesStatus;
    });

    // Then apply search filter
    const searchFiltered = baseFiltered.filter(ad => {
        if (!ad) return false;
        return (ad.ad_name || '').toLowerCase().includes(searchTerm) ||
            (ad.campaign_name && ad.campaign_name.toLowerCase().includes(searchTerm));
    });

    filteredData = searchFiltered;
    renderTable(searchFiltered);
    if (currentPage === 'overview') {
        // Update charts and other components with filtered data
        const metrics = calculateMetrics(searchFiltered);
        updateKPIs(metrics);
        renderCharts(searchFiltered);
        renderCampaignComparison(searchFiltered);
        renderInsights(searchFiltered, metrics);
        document.getElementById('tableCount').textContent = `Showing ${searchFiltered.length} ads`;
    }
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

    filteredData = filteredData.filter(ad => ad != null).sort((a, b) => {
        let aVal, bVal;

        switch (field) {
            case 'spend':
                aVal = a.total_spend || 0;
                bVal = b.total_spend || 0;
                break;
            case 'leads':
                aVal = a.total_leads || 0;
                bVal = b.total_leads || 0;
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
                aVal = a.total_impressions || 0;
                bVal = b.total_impressions || 0;
                break;
            case 'clicks':
                aVal = a.clicks || 0;
                bVal = b.clicks || 0;
                break;
            case 'ad_name':
                aVal = (a.ad_name || '').toLowerCase();
                bVal = (b.ad_name || '').toLowerCase();
                break;
            case 'status':
                const aPerfInfo = getPerformanceInfo(a);
                const bPerfInfo = getPerformanceInfo(b);
                aVal = aPerfInfo.isGood ? 1 : aPerfInfo.isBad ? -1 : 0;
                bVal = bPerfInfo.isGood ? 1 : bPerfInfo.isBad ? -1 : 0;
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
    applyFilters();
}

function updateCampaignFilter(data) {
    const select = document.getElementById('campaignFilter');
    if (!select) return;

    const campaigns = [...new Set(data.filter(ad => ad != null).map(ad => ad.campaign_name).filter(Boolean))];
    const currentValue = select.value;

    select.innerHTML = '<option value="all">All Campaigns</option>' +
        campaigns.map(camp => `<option value="${escapeHtml(camp)}">${escapeHtml(camp)}</option>`).join('');

    if (currentValue && campaigns.includes(currentValue)) {
        select.value = currentValue;
    }
}

// ==========================================
// FILTERS
// ==========================================
function applyFilters() {
    const campaignFilter = document.getElementById('campaignFilter')?.value || 'all';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    const dateRange = document.getElementById('dateRange')?.value || 'all';

    filteredData = rawAdsData.filter(ad => {
        if (!ad) return false;

        // Campaign filter
        let matchesCampaign = true;
        if (campaignFilter !== 'all') {
            matchesCampaign = ad.campaign_name === campaignFilter;
        }

        // Status filter
        const perf = (ad.performance_category || '').toLowerCase();
        const isGood = perf.includes('yes') || perf.includes('good') || perf.includes('performing');
        const isBad = perf.includes('wasted') || perf.includes('bad') || perf.includes('no') || perf.includes('poor');

        let matchesStatus = true;
        if (statusFilter === 'good') {
            matchesStatus = isGood;
        } else if (statusFilter === 'bad') {
            matchesStatus = isBad;
        }

        // Date filter (placeholder - would need date field in data)
        // For now, just return true
        let matchesDate = true;

        return matchesCampaign && matchesStatus && matchesDate;
    });

    updateDashboard(filteredData);
}

// ==========================================
// 8. INSIGHTS & RECOMMENDATIONS
// ==========================================
function renderInsights(data, metrics) {
    const container = document.getElementById('aiInsights');
    if (!container || !data.length) return;

    const insights = [];
    const campaignData = aggregateCampaignData(data);

    // Top performing campaign
    if (campaignData.length > 0) {
        const topCampaign = campaignData.reduce((prev, curr) =>
            ((curr.leads || 0) > (prev.leads || 0)) ? curr : prev, campaignData[0]);

        if (topCampaign && topCampaign.leads > 0) {
            insights.push({
                type: 'positive',
                icon: 'fa-trophy',
                title: 'Top Performing Campaign',
                message: `"${topCampaign.campaign_name}" is generating ${topCampaign.leads} leads with an average CPL of ₹${(topCampaign.avgCPL || 0).toFixed(2)}. Consider increasing budget by 20-30% to scale this success.`
            });
        }
    }

    // Top performing ad
    const validData = data.filter(ad => ad != null);
    if (validData.length > 0) {
        const topPerformer = validData.reduce((prev, curr) =>
            ((curr.total_leads || 0) > (prev.total_leads || 0)) ? curr : prev, validData[0]);

        if (topPerformer && topPerformer.total_leads > 0) {
            insights.push({
                type: 'positive',
                icon: 'fa-star',
                title: 'Top Performing Ad',
                message: `"${topPerformer.ad_name}" is generating ${topPerformer.total_leads} leads with a CPL of ₹${(topPerformer.cost_per_lead || (topPerformer.total_leads > 0 ? topPerformer.total_spend / topPerformer.total_leads : 0)).toFixed(2)}.`
            });
        }
    }

    // Worst performing campaign
    if (campaignData.length > 0) {
        const worstCampaign = campaignData
            .filter(camp => camp.leads > 0 && camp.avgCPL > 0)
            .reduce((prev, curr) => {
                if (!prev) return curr;
                return curr.avgCPL > prev.avgCPL ? curr : prev;
            }, null);

        if (worstCampaign && worstCampaign.avgCPL > metrics.avgCPL * 1.5) {
            insights.push({
                type: 'negative',
                icon: 'fa-exclamation-triangle',
                title: 'Campaign Optimization Needed',
                message: `"${worstCampaign.campaign_name}" has an average CPL of ₹${worstCampaign.avgCPL.toFixed(2)} (${((worstCampaign.avgCPL / metrics.avgCPL - 1) * 100).toFixed(0)}% above average). Review targeting or creative strategy.`
            });
        }
    }

    // Worst performing ad
    const worstPerformer = validData
        .filter(ad => ad != null && (ad.total_leads || 0) > 0)
        .reduce((prev, curr) => {
            if (!prev) return curr;
            const prevCPL = prev.cost_per_lead || (prev.total_leads > 0 ? prev.total_spend / prev.total_leads : Infinity);
            const currCPL = curr.cost_per_lead || (curr.total_leads > 0 ? curr.total_spend / curr.total_leads : Infinity);
            return currCPL > prevCPL ? curr : prev;
        }, null);

    if (worstPerformer) {
        const worstCPL = worstPerformer.cost_per_lead || (worstPerformer.total_leads > 0 ? worstPerformer.total_spend / worstPerformer.total_leads : 0);
        if (worstCPL > metrics.avgCPL * 1.5) {
            insights.push({
                type: 'negative',
                icon: 'fa-exclamation-triangle',
                title: 'Ad Optimization Opportunity',
                message: `"${worstPerformer.ad_name}" has a CPL of ₹${worstCPL.toFixed(2)} (${((worstCPL / metrics.avgCPL - 1) * 100).toFixed(0)}% above average). Review creative, audience targeting, or consider pausing.`
            });
        }
    }

    // High spend, low leads
    const highSpendLowLeads = validData
        .filter(ad => ad != null && (ad.total_spend || 0) > metrics.totalSpend / validData.length && (ad.total_leads || 0) === 0)
        .sort((a, b) => (b.total_spend || 0) - (a.total_spend || 0))[0];

    if (highSpendLowLeads) {
        insights.push({
            type: 'warning',
            icon: 'fa-dollar-sign',
            title: 'Budget Alert',
            message: `"${highSpendLowLeads.ad_name}" has spent ₹${(highSpendLowLeads.total_spend || 0).toFixed(2)} with 0 leads. Immediate review recommended.`
        });
    }

    // Best ROI
    const bestROI = validData
        .filter(ad => ad != null && (ad.roas || 0) > 0)
        .reduce((prev, curr) => {
            if (!prev) return curr;
            return ((curr.roas || 0) > (prev.roas || 0)) ? curr : prev;
        }, null);

    if (bestROI && bestROI.roas > 2) {
        insights.push({
            type: 'info',
            icon: 'fa-chart-line',
            title: 'High ROI Campaign',
            message: `"${bestROI.ad_name}" shows excellent ROI at ${(bestROI.roas || 0).toFixed(2)}x. This indicates strong conversion quality. Consider replicating this strategy.`
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
    // Helper to get field value from object with multiple fallback names
    const getField = (obj, fieldNames, defaultValue = 'N/A') => {
        for (const fieldName of fieldNames) {
            if (obj[fieldName] !== undefined && obj[fieldName] !== null && obj[fieldName] !== '') {
                const value = String(obj[fieldName]).trim();
                if (value && value !== 'undefined' && value !== 'null') {
                    return value;
                }
            }
        }
        return defaultValue;
    };

    // Try to find the ad in both rawAdsData and filteredData
    let ad = rawAdsData.find(a => {
        const id = a.ad_id || a.adId || a.id || a._id || a.ID;
        return id == adId || id === adId || String(id) === String(adId);
    });

    // If not found, try filteredData
    if (!ad) {
        ad = filteredData.find(a => {
            const id = a.ad_id || a.adId || a.id || a._id || a.ID;
            return id == adId || id === adId || String(id) === String(adId);
        });
    }

    if (!ad) {
        showToast("Ad details not found", "error");
        return;
    }

    // Get normalized values with comprehensive fallbacks
    let campaignName = getField(ad, [
        'campaign_name', 'Campaign Name', 'campaignName', 'Campaign_Name',
        'Campaign', 'campaign', 'CampaignName'
    ], '');

    // If campaign_name is empty, try adset_name
    if (!campaignName || campaignName.trim() === '') {
        campaignName = getField(ad, [
            'adset_name', 'Adset Name', 'adsetName', 'Adset_Name',
            'ad_set_name', 'Ad Set Name'
        ], 'N/A');
    }

    if (!campaignName || campaignName.trim() === '') {
        campaignName = 'N/A';
    }

    const performanceCategory = getField(ad, [
        'Performing Ad', 'performing_ad', 'Performing_Ad', 'performingAd',
        'performance_category', 'Performance Category', 'performanceCategory',
        'Performance_Category', 'performance', 'Performance',
        'status', 'Status', 'Performance_Status', 'performance_status',
        'PerformanceStatus'
    ], 'Unknown');

    const adName = getField(ad, [
        'ad_name', 'Ad Name', 'adName', 'Ad_Name',
        'name', 'Name', 'ad', 'Ad', 'AdName'
    ], 'Ad Details');

    // Get clicks from multiple sources
    const clicks = ad.total_clicks || ad.clicks || 0;

    const metrics = {
        ctr: (ad.total_impressions || 0) > 0 ? ((clicks / (ad.total_impressions || 1)) * 100).toFixed(2) : (ad.ctr || ad.CTR || '0.00'),
        convRate: clicks > 0 ? (((ad.total_leads || 0) / clicks) * 100).toFixed(2) : (ad.conversion_rate || ad.Conversion_Rate || ad['Conversion Rate'] || '0.00'),
        revenue: (ad.roas || 0) > 0 ? ((ad.total_spend || 0) * (ad.roas || 0)).toFixed(2) : 'N/A',
        cpc: ad.cpc || ad.CPC || 0,
        cpm: ad.cpm || ad.CPM || 0
    };

    document.getElementById('modalTitle').textContent = adName;
    document.getElementById('modalBody').innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px;">
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">Total Spend</small>
                <h3 style="margin-top: 8px; color: var(--primary);">₹${(ad.total_spend || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">Leads Generated</small>
                <h3 style="margin-top: 8px; color: var(--success);">${ad.total_leads || 0}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">Cost Per Lead</small>
                <h3 style="margin-top: 8px; color: var(--primary);">₹${(ad.cost_per_lead || 0).toFixed(2)}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">ROAS</small>
                <h3 style="margin-top: 8px; color: var(--accent);">${(ad.roas || 0).toFixed(2)}x</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">Impressions</small>
                <h3 style="margin-top: 8px; color: var(--primary);">${(ad.total_impressions || 0).toLocaleString()}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">CTR</small>
                <h3 style="margin-top: 8px; color: var(--primary);">${metrics.ctr}%</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">Clicks</small>
                <h3 style="margin-top: 8px; color: var(--primary);">${clicks.toLocaleString()}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">CPC</small>
                <h3 style="margin-top: 8px; color: var(--primary);">₹${metrics.cpc.toFixed(2)}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">CPM</small>
                <h3 style="margin-top: 8px; color: var(--primary);">₹${metrics.cpm.toFixed(2)}</h3>
            </div>
            <div style="padding: 16px; background: var(--bg-body); border-radius: 10px;">
                <small style="color: var(--text-light); font-weight: 600; text-transform: uppercase;">Conversion Rate</small>
                <h3 style="margin-top: 8px; color: var(--success);">${metrics.convRate}%</h3>
            </div>
        </div>
        <div style="margin-bottom: 20px;">
            <strong style="display: block; margin-bottom: 8px; color: var(--primary);">Campaign:</strong>
            <p style="color: var(--text-main);">${escapeHtml(campaignName)}</p>
        </div>
        ${(ad.justification || ad.Justification) ? `
        <div style="margin-bottom: 20px;">
            <strong style="display: block; margin-bottom: 8px; color: var(--primary);">Justification:</strong>
            <p style="color: var(--text-main); line-height: 1.6;">${escapeHtml(ad.justification || ad.Justification || '')}</p>
        </div>
        ` : ''}
        ${(ad.recommendation || ad.Recommendation) ? `
        <div style="margin-bottom: 20px;">
            <strong style="display: block; margin-bottom: 8px; color: var(--primary);">Recommendation:</strong>
            <p style="color: var(--text-main); line-height: 1.6;">${escapeHtml(ad.recommendation || ad.Recommendation || '')}</p>
        </div>
        ` : ''}
        ${(ad.objective || ad.Objective) ? `
        <div style="margin-bottom: 20px;">
            <strong style="display: block; margin-bottom: 8px; color: var(--primary);">Objective:</strong>
            <p style="color: var(--text-main);">${escapeHtml(ad.objective || ad.Objective || '')}</p>
        </div>
        ` : ''}
        ${(ad.adset_name || ad.adsetName || ad['Adset Name']) ? `
        <div style="margin-bottom: 20px;">
            <strong style="display: block; margin-bottom: 8px; color: var(--primary);">Ad Set:</strong>
            <p style="color: var(--text-main);">${escapeHtml(ad.adset_name || ad.adsetName || ad['Adset Name'] || '')}</p>
        </div>
        ` : ''}
        <div style="padding: 12px; background: var(--accent-light); border-radius: 8px; border-left: 4px solid var(--accent);">
            <small style="color: var(--accent); font-weight: 600;">Performance Status:</small>
            <p style="margin-top: 4px; color: var(--primary); font-weight: 600;">${escapeHtml(performanceCategory)}</p>
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

// ==========================================
// ADS WISE PAGE FUNCTIONS
// ==========================================
function updateAdsKPIs(metrics) {
    animateValue("adsTotalSpend", metrics.totalSpend, "₹");
    animateValue("adsTotalLeads", metrics.totalLeads, "");
    animateValue("adsAvgCPL", metrics.avgCPL, "₹");
    animateValue("adsTotalImpressions", metrics.totalImpressions, "");
    animateValue("adsTotalClicks", metrics.totalClicks, "");
    animateValue("adsAvgROAS", metrics.avgROAS, "", "x");
    document.getElementById('adsConversionRate').textContent = metrics.convRate.toFixed(2) + '%';
    document.getElementById('adsCTR').textContent = metrics.ctr.toFixed(2) + '%';
}

function renderAdsCharts(data) {
    renderAdsTrendChart(data);
}

function renderAdsTrendChart(data) {
    const ctx = document.getElementById('adsTrendChart');
    if (!ctx) return;

    const sortBy = document.getElementById('adsChartSort')?.value || 'spend';
    let sorted = [...data].filter(ad => ad != null).sort((a, b) => {
        if (sortBy === 'spend') return (b.total_spend || 0) - (a.total_spend || 0);
        if (sortBy === 'leads') return (b.total_leads || 0) - (a.total_leads || 0);
        if (sortBy === 'cpl') return (a.cost_per_lead || 0) - (b.cost_per_lead || 0);
        return 0;
    }).slice(0, 15);

    const labels = sorted.map(d => {
        const name = d.ad_name || 'Unnamed';
        return name.length > 25 ? name.substring(0, 25) + '...' : name;
    });
    const spendData = sorted.map(d => d.total_spend);
    const leadsData = sorted.map(d => d.total_leads);

    if (chartInstances.adsTrend) {
        chartInstances.adsTrend.destroy();
    }

    chartInstances.adsTrend = new Chart(ctx, {
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
                        callback: function (value) {
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

// Helper function to format date
function formatDate(dateValue) {
    if (!dateValue) return 'N/A';

    try {
        // If it's already a formatted date string (YYYY-MM-DD), return as-is
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            }
            return dateValue;
        }

        // Try to parse as Date
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        return dateValue;
    } catch (e) {
        return dateValue;
    }
}

// Helper function to get ad status (Active/Inactive)
function getAdStatus(effectiveStatus) {
    if (!effectiveStatus) return { text: 'Unknown', class: 'gray' };

    const status = String(effectiveStatus).toUpperCase();

    // Active statuses
    if (status === 'ACTIVE' || status === 'CAMPAIGN_ACTIVE' || status === 'ADSET_ACTIVE') {
        return { text: 'Active', class: 'green' };
    }

    // Inactive/Paused statuses
    if (status.includes('PAUSED') || status.includes('DISAPPROVED') || status.includes('ARCHIVED') ||
        status === 'CAMPAIGN_PAUSED' || status === 'ADSET_PAUSED') {
        return { text: 'Inactive', class: 'red' };
    }

    // Other statuses
    return { text: status.replace(/_/g, ' '), class: 'gray' };
}

function renderAdsTable(data) {
    const tbody = document.getElementById('adsWiseTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center" style="padding: 40px; color: var(--text-light);">No ads found</td></tr>';
        return;
    }

    data.filter(ad => ad != null).forEach(ad => {
        const perfInfo = getPerformanceInfo(ad);
        const adStatus = getAdStatus(ad.effective_status);
        const publishDate = formatDate(ad.ad_created_time);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <span class="status-dot ${perfInfo.statusColor}"></span>
                <span style="font-size: 12px;">${perfInfo.statusText}</span>
            </td>
            <td><strong>${escapeHtml(ad.ad_name)}</strong></td>
            <td><small style="color: var(--text-light);">${escapeHtml(ad.campaign_name)}</small></td>
            <td><small style="color: var(--text-light);">${publishDate}</small></td>
            <td>
                <span class="status-dot ${adStatus.class}"></span>
                <span style="font-size: 12px;">${adStatus.text}</span>
            </td>
            <td class="text-right">₹${ad.total_spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td class="text-right">${ad.total_impressions.toLocaleString()}</td>
            <td class="text-right">${ad.clicks.toLocaleString()}</td>
            <td class="text-right"><strong>${ad.total_leads}</strong></td>
            <td class="text-right">₹${(ad.cost_per_lead || 0).toFixed(2)}</td>
            <td class="text-right">${(ad.roas || 0).toFixed(2)}x</td>
            <td class="text-center">
                <button class="action-btn" onclick="showDetails('${ad.ad_id}')">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterAdsTable() {
    const searchTerm = document.getElementById('adsTableSearch')?.value.toLowerCase() || '';
    const filtered = filteredData.filter(ad => {
        if (!ad) return false;
        return (ad.ad_name || '').toLowerCase().includes(searchTerm) ||
            (ad.campaign_name || '').toLowerCase().includes(searchTerm);
    });
    renderAdsTable(filtered);
    document.getElementById('adsTableCount').textContent = `Showing ${filtered.length} ads`;
}

function sortAdsTable(field) {
    if (!field) {
        field = document.getElementById('adsSortBy')?.value || 'spend';
    }

    if (adsCurrentSort.field === field) {
        adsCurrentSort.direction = adsCurrentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        adsCurrentSort.field = field;
        adsCurrentSort.direction = 'asc';
    }

    const sorted = [...filteredData].filter(ad => ad != null).sort((a, b) => {
        let aVal, bVal;
        switch (field) {
            case 'spend': aVal = a.total_spend || 0; bVal = b.total_spend || 0; break;
            case 'leads': aVal = a.total_leads || 0; bVal = b.total_leads || 0; break;
            case 'cpl': aVal = a.cost_per_lead || 0; bVal = b.cost_per_lead || 0; break;
            case 'roas': aVal = a.roas || 0; bVal = b.roas || 0; break;
            case 'ad_name': aVal = (a.ad_name || '').toLowerCase(); bVal = (b.ad_name || '').toLowerCase(); break;
            case 'campaign_name': aVal = (a.campaign_name || '').toLowerCase(); bVal = (b.campaign_name || '').toLowerCase(); break;
            case 'ad_created_time':
                aVal = a.ad_created_time ? new Date(a.ad_created_time).getTime() : 0;
                bVal = b.ad_created_time ? new Date(b.ad_created_time).getTime() : 0;
                break;
            case 'effective_status':
                aVal = (a.effective_status || '').toLowerCase();
                bVal = (b.effective_status || '').toLowerCase();
                break;
            case 'status':
                const aPerfInfo = getPerformanceInfo(a);
                const bPerfInfo = getPerformanceInfo(b);
                aVal = aPerfInfo.isGood ? 1 : aPerfInfo.isBad ? -1 : 0;
                bVal = bPerfInfo.isGood ? 1 : bPerfInfo.isBad ? -1 : 0;
                break;
            default: return 0;
        }
        if (typeof aVal === 'string') {
            return adsCurrentSort.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return adsCurrentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    renderAdsTable(sorted);
}

function updateAdsCharts() {
    if (filteredData.length > 0) {
        renderAdsCharts(filteredData);
    }
}

// ==========================================
// CAMPAIGN WISE PAGE FUNCTIONS
// ==========================================
function aggregateCampaignData(data) {
    const campaignStats = {};
    data.filter(ad => ad != null).forEach(ad => {
        const camp = ad.campaign_name || 'Unknown';
        if (!campaignStats[camp]) {
            campaignStats[camp] = {
                campaign_name: camp,
                spend: 0,
                leads: 0,
                impressions: 0,
                clicks: 0,
                ads: 0,
                roas: [],
                cpl: []
            };
        }
        campaignStats[camp].spend += ad.total_spend || 0;
        campaignStats[camp].leads += ad.total_leads || 0;
        campaignStats[camp].impressions += ad.total_impressions || 0;
        campaignStats[camp].clicks += ad.clicks || 0;
        campaignStats[camp].ads += 1;
        if (ad.roas) campaignStats[camp].roas.push(ad.roas);
        if (ad.cost_per_lead) campaignStats[camp].cpl.push(ad.cost_per_lead);
    });

    return Object.values(campaignStats).map(camp => ({
        ...camp,
        avgCPL: camp.leads > 0 ? camp.spend / camp.leads : (camp.cpl.length > 0 ? camp.cpl.reduce((a, b) => a + b, 0) / camp.cpl.length : 0),
        avgROAS: camp.roas.length > 0 ? camp.roas.reduce((a, b) => a + b, 0) / camp.roas.length : 0,
        ctr: camp.impressions > 0 ? (camp.clicks / camp.impressions) * 100 : 0,
        convRate: camp.clicks > 0 ? (camp.leads / camp.clicks) * 100 : 0
    }));
}

function updateCampaignKPIs(campaignData) {
    const totals = campaignData.reduce((acc, camp) => ({
        spend: acc.spend + (camp.total_spend || camp.spend || 0),
        leads: acc.leads + (camp.total_leads || camp.leads || 0),
        impressions: acc.impressions + (camp.total_impressions || camp.impressions || 0),
        clicks: acc.clicks + (camp.total_clicks || camp.clicks || 0),
        roas: acc.roas + (camp.avgROAS || camp.roas || 0),
        roasCount: acc.roasCount + ((camp.avgROAS || camp.roas || 0) > 0 ? 1 : 0)
    }), { spend: 0, leads: 0, impressions: 0, clicks: 0, roas: 0, roasCount: 0 });

    const avgCPL = totals.leads > 0 ? totals.spend / totals.leads : (totals.clicks > 0 ? totals.spend / totals.clicks : 0);
    const convRate = totals.clicks > 0 ? (totals.leads / totals.clicks) * 100 : 0;
    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const avgROAS = totals.roasCount > 0 ? totals.roas / totals.roasCount : 0;

    animateValue("campTotalSpend", totals.spend, "₹");
    animateValue("campTotalLeads", totals.leads, "");
    animateValue("campAvgCPL", avgCPL, "₹");
    animateValue("campTotalImpressions", totals.impressions, "");
    animateValue("campTotalClicks", totals.clicks, "");
    animateValue("campAvgROAS", avgROAS, "", "x");
    document.getElementById('campConversionRate').textContent = convRate.toFixed(2) + '%';
    document.getElementById('campCTR').textContent = ctr.toFixed(2) + '%';
}

function renderCampaignCharts(data) {
    renderCampaignPieChart(data);
    renderCampaignROIChart(data);
    renderCampaignPerformanceChart(data);
}

function renderCampaignPieChart(data) {
    const ctx = document.getElementById('campaignPieChart');
    if (!ctx) return;

    // Check if data is campaign data (has campaign_name directly) or ad data (needs aggregation)
    const isCampaignData = data.length > 0 && data[0].campaign_id && !data[0].ad_name;

    let labels = [];
    let spendData = [];

    if (isCampaignData) {
        // Direct campaign data
        labels = data.filter(camp => camp != null).map(camp => camp.campaign_name || 'Unknown');
        spendData = data.filter(camp => camp != null).map(camp => camp.total_spend || camp.spend || 0);
    } else {
        // Aggregate from ad data
        const campaignStats = {};
        data.filter(ad => ad != null).forEach(ad => {
            const camp = ad.campaign_name || 'Unknown';
            if (!campaignStats[camp]) {
                campaignStats[camp] = { spend: 0 };
            }
            campaignStats[camp].spend += ad.total_spend || 0;
        });
        labels = Object.keys(campaignStats);
        spendData = Object.values(campaignStats).map(c => c.spend);
    }

    if (labels.length === 0) {
        if (chartInstances.campaignPie) {
            chartInstances.campaignPie.destroy();
            chartInstances.campaignPie = null;
        }
        return;
    }

    if (chartInstances.campaignPie) {
        chartInstances.campaignPie.destroy();
    }

    const colors = [
        '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1',
        '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#64748b'
    ];

    chartInstances.campaignPie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: spendData,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        padding: 12,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ₹${value.toLocaleString()} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderCampaignROIChart(data) {
    const ctx = document.getElementById('campaignROIChart');
    if (!ctx) return;

    const campaignROI = {};
    data.filter(ad => ad != null).forEach(ad => {
        const camp = ad.campaign_name || 'Unknown';
        if (!campaignROI[camp]) {
            campaignROI[camp] = { spend: 0, revenue: 0 };
        }
        campaignROI[camp].spend += ad.total_spend || 0;
        const revenuePerLead = ad.roas > 0 ? ((ad.total_spend || 0) * ad.roas) / (ad.total_leads || 1) : 5000;
        campaignROI[camp].revenue += (ad.total_leads || 0) * revenuePerLead;
    });

    const labels = Object.keys(campaignROI);
    const roiData = labels.map(camp => {
        const spend = campaignROI[camp].spend;
        const revenue = campaignROI[camp].revenue;
        return spend > 0 ? ((revenue - spend) / spend) * 100 : 0;
    }).sort((a, b) => b - a).slice(0, 8);

    const sortedLabels = labels.sort((a, b) => {
        const roiA = campaignROI[a].spend > 0 ?
            ((campaignROI[a].revenue - campaignROI[a].spend) / campaignROI[a].spend) * 100 : 0;
        const roiB = campaignROI[b].spend > 0 ?
            ((campaignROI[b].revenue - campaignROI[b].spend) / campaignROI[b].spend) * 100 : 0;
        return roiB - roiA;
    }).slice(0, 8);

    if (chartInstances.campaignROI) {
        chartInstances.campaignROI.destroy();
    }

    chartInstances.campaignROI = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'ROI %',
                data: roiData,
                backgroundColor: roiData.map(roi =>
                    roi > 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'
                ),
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `ROI: ${context.parsed.x.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return value.toFixed(0) + '%';
                        }
                    }
                }
            }
        }
    });
}

function renderCampaignPerformanceChart(data) {
    const ctx = document.getElementById('campaignPerformanceChart');
    if (!ctx) return;

    // Check if data is campaign data or ad data
    const isCampaignData = data.length > 0 && data[0].campaign_id && !data[0].ad_name;

    let labels = [];
    let avgCPL = [];
    let totalClicks = [];

    if (isCampaignData) {
        // Direct campaign data
        const sorted = [...data]
            .filter(camp => camp != null)
            .sort((a, b) => (b.total_clicks || b.clicks || 0) - (a.total_clicks || a.clicks || 0))
            .slice(0, 10);

        labels = sorted.map(camp => camp.campaign_name || 'Unknown');
        avgCPL = sorted.map(camp => camp.cpc || camp.avgCPL || (camp.total_clicks > 0 ? (camp.total_spend || camp.spend || 0) / (camp.total_clicks || camp.clicks || 1) : 0));
        totalClicks = sorted.map(camp => camp.total_clicks || camp.clicks || 0);
    } else {
        // Aggregate from ad data
        const campaignPerf = {};
        data.filter(ad => ad != null).forEach(ad => {
            const camp = ad.campaign_name || 'Unknown';
            if (!campaignPerf[camp]) {
                campaignPerf[camp] = { cpl: [], leads: [] };
            }
            if (ad.cost_per_lead != null && ad.cost_per_lead > 0) {
                campaignPerf[camp].cpl.push(ad.cost_per_lead);
            }
            campaignPerf[camp].leads.push(ad.total_leads || 0);
        });

        labels = Object.keys(campaignPerf);
        avgCPL = labels.map(camp => {
            const cpls = campaignPerf[camp].cpl;
            return cpls.length > 0 ? cpls.reduce((a, b) => a + b, 0) / cpls.length : 0;
        });
        totalClicks = labels.map(camp =>
            campaignPerf[camp].leads.reduce((a, b) => a + b, 0)
        );
    }

    if (labels.length === 0) {
        if (chartInstances.campaignPerformance) {
            chartInstances.campaignPerformance.destroy();
            chartInstances.campaignPerformance = null;
        }
        return;
    }

    if (chartInstances.campaignPerformance) {
        chartInstances.campaignPerformance.destroy();
    }

    chartInstances.campaignPerformance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Avg CPC (₹)',
                    data: avgCPL,
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: isCampaignData ? 'Total Clicks' : 'Total Leads',
                    data: totalClicks,
                    type: 'line',
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    yAxisID: 'y1',
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    position: 'left',
                    ticks: {
                        callback: function (value) {
                            return '₹' + value.toFixed(0);
                        }
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

function renderCampaignWiseTable(campaignData) {
    const tbody = document.getElementById('campaignWiseTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (campaignData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="padding: 40px; color: var(--text-light);">No campaigns found</td></tr>';
        return;
    }

    campaignData.forEach(camp => {
        const campaignStatus = getAdStatus(camp.status || camp.effective_status);
        const campaignDate = formatDate(
            camp.created_time || camp.start_date || camp.date_start
        );
        const campaignName = camp.campaign_name || camp.name || 'Unknown';
        const spend = camp.total_spend || camp.spend || 0;
        const impressions = camp.total_impressions || camp.impressions || 0;
        const clicks = camp.total_clicks || camp.clicks || 0;
        const leads = camp.total_leads || camp.leads || 0;
        const ads = camp.ads || 1;
        const avgCPL = camp.avgCPL || camp.cpc || (clicks > 0 ? spend / clicks : 0);
        const avgROAS = camp.avgROAS || camp.roas || 0;
        const ctr = camp.ctr || (impressions > 0 ? (clicks / impressions) * 100 : 0);
        const convRate = camp.convRate || camp.conversion_rate || (clicks > 0 ? (leads / clicks) * 100 : 0);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${escapeHtml(campaignName)}</strong></td>
            <td>
    <span class="status-dot ${campaignStatus.class}"></span>
    <span style="font-size:12px">${campaignStatus.text}</span>
  </td>

  <td>
    <small style="color: var(--text-light)">
      ${campaignDate}
    </small>
  </td>
            <td class="text-right">${ads}</td>
            <td class="text-right">₹${spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td class="text-right">${impressions.toLocaleString()}</td>
            <td class="text-right">${clicks.toLocaleString()}</td>
            <td class="text-right"><strong>${leads}</strong></td>
            <td class="text-right">₹${avgCPL.toFixed(2)}</td>
            <td class="text-right">${avgROAS > 0 ? avgROAS.toFixed(2) + 'x' : 'N/A'}</td>
            <td class="text-right">${ctr.toFixed(2)}%</td>
            <td class="text-right">${convRate.toFixed(2)}%</td>
        `;
        tbody.appendChild(row);
    });
}

function filterCampaignTable() {
    const searchTerm = document.getElementById('campaignTableSearch')?.value.toLowerCase() || '';
    let campaignData = [];

    // Use campaign data if available, otherwise aggregate from ads
    if (rawCampaignData && rawCampaignData.length > 0) {
        campaignData = rawCampaignData;
    } else {
        campaignData = aggregateCampaignData(filteredData);
    }

    const filtered = campaignData.filter(camp =>
        (camp.campaign_name || camp.name || '').toLowerCase().includes(searchTerm)
    );

    filteredCampaignData = filtered;
    renderCampaignWiseTable(filtered);
    document.getElementById('campaignTableCount').textContent = `Showing ${filtered.length} campaigns`;
}

function sortCampaignTable(field) {
    if (!field) {
        field = document.getElementById('campaignSortBy')?.value || 'spend';
    }

    if (campaignCurrentSort.field === field) {
        campaignCurrentSort.direction = campaignCurrentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        campaignCurrentSort.field = field;
        campaignCurrentSort.direction = 'asc';
    }

    const campaignData = aggregateCampaignData(filteredData);
    const sorted = [...campaignData].sort((a, b) => {
        let aVal, bVal;
        switch (field) {
            case 'spend': aVal = a.spend || 0; bVal = b.spend || 0; break;
            case 'leads': aVal = a.leads || 0; bVal = b.leads || 0; break;
            case 'cpl': aVal = a.avgCPL || 0; bVal = b.avgCPL || 0; break;
            case 'roas': aVal = a.avgROAS || 0; bVal = b.avgROAS || 0; break;
            case 'ads': aVal = a.ads || 0; bVal = b.ads || 0; break;
            case 'impressions': aVal = a.impressions || 0; bVal = b.impressions || 0; break;
            case 'clicks': aVal = a.clicks || 0; bVal = b.clicks || 0; break;
            case 'ctr': aVal = a.ctr || 0; bVal = b.ctr || 0; break;
            case 'conv_rate': aVal = a.convRate || 0; bVal = b.convRate || 0; break;
            case 'campaign_name': aVal = (a.campaign_name || '').toLowerCase(); bVal = (b.campaign_name || '').toLowerCase(); break;
            default: return 0;
        }
        if (typeof aVal === 'string') {
            return campaignCurrentSort.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return campaignCurrentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    renderCampaignWiseTable(sorted);
}

s// Make functions globally available
window.fetchData = fetchData;
window.showDetails = showDetails;
window.closeModal = closeModal;
window.filterTable = filterTable;
window.sortTable = sortTable;
window.filterByCampaign = filterByCampaign;
window.applyFilters = applyFilters;
window.updateCharts = updateCharts;
window.exportToCSV = exportToCSV;
window.showPage = showPage;
window.updateAdsCharts = updateAdsCharts;
window.filterAdsTable = filterAdsTable;
window.sortAdsTable = sortAdsTable;
window.filterCampaignTable = filterCampaignTable;
window.sortCampaignTable = sortCampaignTable;
