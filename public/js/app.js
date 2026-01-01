document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});

async function fetchData() {
    const loader = document.getElementById('loadingOverlay');
    loader.style.display = 'block'; // Show loading overlay while fetching data

    try {
        // Fetch data from the API
        const response = await fetch('/api/ads');
        const json = await response.json();

        if (!json.success) {
            console.error("Error fetching data:", json.message);
            return;
        }

        const data = json.metaAdsData || [];

        // If no data found, show a message
        if (data.length === 0) {
            alert('No data found.');
            return;
        }

        renderTable(data);
    } catch (error) {
        console.error('Error fetching data:', error);
    } finally {
        loader.style.display = 'none'; // Hide loading overlay after fetching data
    }
}

function renderTable(data) {
    const tbody = document.getElementById('adsTableBody');
    tbody.innerHTML = ''; // Clear previous table rows

    data.forEach(ad => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${ad.ad_name}</td>
            <td>${ad.total_spend.toLocaleString()}</td>
            <td>${ad.total_impressions.toLocaleString()}</td>
            <td>${ad.clicks.toLocaleString()}</td>
            <td>${ad.total_leads}</td>
            <td>₹${ad.cost_per_lead.toFixed(2)}</td>
            <td>${ad.roas.toFixed(2)}x</td>
        `;
        tbody.appendChild(row);
    });
}
