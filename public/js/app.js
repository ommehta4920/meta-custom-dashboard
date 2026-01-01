// ==========================================
// GLOBAL STATE
// ==========================================
let rawAdsData = [];
let filteredData = [];
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
            rawAdsData = json.map(item => item.json || item);
        } else if (json.data && Array.isArray(json.data)) {
            rawAdsData = json.data;
        } else if (json.json && Array.isArray(json.json)) {
            rawAdsData = json.json;
        } else {
            rawAdsData = [json.json || json];
        }

        // Normalize data
        rawAdsData = rawAdsData.map(ad => {
            const leads = ad.total_leads || 0;
            const spend = ad.total_spend || 0;
            const impressions = ad.total_impressions || 0;
            const clicks = ad.clicks || Math.round(impressions * 0.01);
            const cpl = leads > 0 ? spend / leads : 0;

            return {
                ...ad,
                total_spend: spend,
                total_leads: Math.round(leads),
                total_impressions: Math.round(impressions),
                clicks: Math.round(clicks),
                cost_per_lead: cpl,
                roas: parseFloat(ad.roas || 0),
                ad_name: ad.ad_name || 'Unnamed Ad',
                campaign_name: ad.campaign_name || 'Unnamed Campaign',
                ad_id: ad.ad_id || Math.random().toString(36).substr(2, 9),
            };
        });

        if (!rawAdsData.length) {
            showToast("No data received from n8n.", "warning");
            return;
        }

        filteredData = [...rawAdsData];
        updateDashboard(filteredData);

    } catch (error) {
        console.error("Fetch error:", error);
        showToast("Failed to connect to Dashboard Server", "error");
    } finally {
        loader.style.display = 'none';
    }
}

// ==========================================
// 2. DASHBOARD UPDATE
// ==========================================
function updateDashboard(data) {
    if (!data || data.length === 0) return;

    renderTable(data);
}

// ==========================================
// 3. TABLE RENDERING & FILTERING
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
        const statusText = ad.total_leads > 0 ? 'Performing Well' : 'Needs Optimization';
        const statusColor = ad.total_leads > 0 ? 'green' : 'red';
        const ctr = ad.total_impressions > 0 ? ((ad.clicks / ad.total_impressions) * 100).toFixed(2) : '0.00';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="status-dot ${statusColor}"></span>${statusText}</td>
            <td>${escapeHtml(ad.ad_name)}</td>
            <td class="text-right">₹${ad.total_spend.toLocaleString()}</td>
            <td class="text-right">${ad.total_impressions.toLocaleString()}</td>
            <td class="text-right">${ad.clicks.toLocaleString()}</td>
            <td class="text-right"><strong>${ad.total_leads}</strong></td>
            <td class="text-right">₹${ad.cost_per_lead.toFixed(2)}</td>
            <td class="text-right">${ad.roas.toFixed(2)}x</td>
            <td class="text-center"><button class="action-btn" onclick="showDetails('${ad.ad_id}')"><i class="fas fa-eye"></i> View</button></td>
        `;
        tbody.appendChild(row);
    });
}

// ==========================================
// 4. TABLE FILTERING
// ==========================================
function filterTable() {
    const searchTerm = document.getElementById('tableSearch').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;

    filteredData = rawAdsData.filter(ad => {
        const matchesSearch = (ad.ad_name || '').toLowerCase().includes(searchTerm);
        const matchesStatus = (statusFilter === 'all' || 
            (statusFilter === 'good' && ad.total_leads > 0) || 
            (statusFilter === 'bad' && ad.total_leads === 0));

        return matchesSearch && matchesStatus;
    });

    renderTable(filteredData);
    document.getElementById('tableCount').textContent = `Showing ${filteredData.length} ads`;
}

// ==========================================
// 5. MODAL & DETAILS
// ==========================================
function showDetails(adId) {
    const ad = rawAdsData.find(a => a.ad_id === adId);
    if (!ad) return;

    document.getElementById('modalTitle').textContent = ad.ad_name || 'Ad Details';
    document.getElementById('modalBody').innerHTML = `
        <div>Total Spend: ₹${ad.total_spend}</div>
        <div>Total Leads: ${ad.total_leads}</div>
        <div>CPL: ₹${ad.cost_per_lead.toFixed(2)}</div>
        <div>ROAS: ${ad.roas.toFixed(2)}x</div>
        <div>Impressions: ${ad.total_impressions}</div>
        <div>CTR: ${((ad.clicks / ad.total_impressions) * 100).toFixed(2)}%</div>
    `;
    document.getElementById('detailModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('detailModal').style.display = 'none';
}

// ==========================================
// 6. UTILITIES
// ==========================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
