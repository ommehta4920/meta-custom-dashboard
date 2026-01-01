# Visa Consultancy - Meta Ads Performance Dashboard

A comprehensive, professional dashboard for tracking and analyzing Meta (Facebook) advertising performance for visa consultancy services.

## Features

### 📊 **Comprehensive Analytics**
- **8 Key Performance Indicators (KPIs)**: Total Spend, Leads, CPL, Conversion Rate, Impressions, Clicks, ROAS, CTR
- **Real-time Data Sync**: Automatic data fetching from n8n workflow
- **Performance Trends**: Visual charts showing spend vs. leads over time

### 📈 **Advanced Visualizations**
- **Top Performing Ads Chart**: Bar and line chart showing spend vs. leads
- **Campaign Distribution**: Doughnut chart showing spend allocation across campaigns
- **Performance Trends**: Campaign-level performance comparison
- **ROI Analysis**: Horizontal bar chart showing return on investment by campaign

### 🎯 **Campaign Management**
- **Campaign Comparison Cards**: Quick overview of top campaigns
- **Detailed Performance Table**: Sortable, filterable table with all ad details
- **Status Indicators**: Visual indicators for ad performance (Performing Well / Needs Optimization)

### 🤖 **AI-Powered Insights**
- **Top Performer Identification**: Automatically identifies best performing ads
- **Optimization Recommendations**: Flags ads needing attention
- **Budget Alerts**: Warns about high spend with low returns
- **ROI Analysis**: Highlights high-performing campaigns

### 🔍 **Advanced Filtering & Search**
- **Search Functionality**: Search by ad name or campaign
- **Status Filtering**: Filter by performance status
- **Campaign Filtering**: View specific campaign data
- **Date Range Selection**: Filter by time period (7, 30, 90 days, or all time)
- **Sortable Columns**: Click column headers to sort

### 💾 **Data Export**
- **CSV Export**: Export filtered data to CSV for further analysis
- **One-click Download**: Easy export with formatted data

### 🎨 **Modern UI/UX**
- **Professional Design**: Clean, modern interface with visa consultancy branding
- **Responsive Layout**: Works on desktop, tablet, and mobile devices
- **Smooth Animations**: Polished transitions and interactions
- **Dark Sidebar**: Professional navigation sidebar
- **Card-based Layout**: Easy-to-scan information cards

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- n8n workflow configured with Google Sheets integration

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure n8n Webhook URL**
   
   Update the `N8N_WEBHOOK_URL` in `server.js` with your n8n webhook URL:
   ```javascript
   const N8N_WEBHOOK_URL = 'https://your-n8n-instance.com/webhook/meta-ads-data';
   ```

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Access the Dashboard**
   
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Data Structure

The dashboard expects data from your n8n workflow with the following fields:

### Required Fields
- `ad_name`: Name of the ad
- `campaign_name`: Name of the campaign
- `total_spend`: Total amount spent (number)
- `total_leads`: Number of leads generated (number)
- `total_impressions`: Number of impressions (number)

### Optional Fields
- `clicks`: Number of clicks (number, defaults to 1% of impressions if not provided)
- `cost_per_lead`: Cost per lead (number)
- `roas`: Return on ad spend (number)
- `performance_category`: Performance status (text: "Performing Well", "Needs Optimization", etc.)
- `justification`: Justification text
- `recommendation`: Recommendation text
- `ad_id`: Unique identifier for the ad

## Usage Guide

### Viewing Dashboard
1. The dashboard automatically loads data when you open it
2. Click "Refresh" to manually sync data from n8n
3. Use the date range selector to filter by time period

### Analyzing Performance
1. **KPI Cards**: View key metrics at the top
2. **Charts**: Analyze trends and distributions
3. **Campaign Comparison**: Compare campaign performance side-by-side
4. **AI Insights**: Read automated recommendations

### Filtering Data
1. **Search**: Type in the search box to find specific ads or campaigns
2. **Status Filter**: Select "Performing Well" or "Needs Optimization"
3. **Campaign Filter**: Select a specific campaign from the dropdown
4. **Sort**: Click column headers to sort the table

### Exporting Data
1. Apply any filters you want
2. Click the "Export" button
3. CSV file will download automatically

### Viewing Ad Details
1. Click "View" button on any ad row
2. Modal will show detailed information
3. Click outside or press Escape to close

## Customization

### Colors
Edit CSS variables in `public/css/style.css`:
```css
:root {
    --primary: #0f172a;       /* Main brand color */
    --accent: #2563eb;        /* Accent color */
    --success: #10b981;       /* Success color */
    /* ... */
}
```

### Charts
Modify chart configurations in `public/js/app.js` in the `renderCharts()` functions.

### Metrics
Add or modify KPIs in the `calculateMetrics()` function in `public/js/app.js`.

## Troubleshooting

### No Data Showing
- Check n8n webhook URL in `server.js`
- Verify n8n workflow is active
- Check browser console for errors
- Ensure data format matches expected structure

### Charts Not Rendering
- Check browser console for JavaScript errors
- Verify Chart.js library is loading
- Ensure data contains required fields

### Export Not Working
- Check browser allows downloads
- Verify data is loaded before exporting
- Check browser console for errors

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Charts**: Chart.js
- **Icons**: Font Awesome 6
- **Fonts**: Plus Jakarta Sans (Google Fonts)

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

ISC

## Support

For issues or questions, please check:
1. n8n workflow configuration
2. Data format compatibility
3. Server logs for errors

---

**Built with ❤️ for Visa Consultancy Marketing Teams**

