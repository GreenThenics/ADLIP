// ===============================
// GLOBAL STATE
// ===============================
let statusChart = null;
let riskChart = null;
let currentJsPage = 1;
let currentEpPage = 1;
const ITEMS_PER_PAGE = 10;
let allJsFiles = [];
let allEndpoints = [];
let allLeaksData = []; // Store leaks for filtering
let currentModalJsIndex = -1; // Track current file in modal
// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    // Initialize Theme
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
        const btn = document.getElementById("themeToggleBtn");
        if (btn) btn.innerText = "☀️";
        const hljsLink = document.getElementById("hljsTheme");
        if (hljsLink) hljsLink.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css";
    }

    // Check for active scan in localStorage
    const activeScanId = localStorage.getItem("activeScanId");
    const activeScanUrl = localStorage.getItem("activeScanUrl");

    if (activeScanId && activeScanUrl) {
        // Restore scan view
        viewScan(activeScanId, activeScanUrl);
    } else {
        // Default to home view
        loadDashboardData();
    }

    // Poll for updates every 10 seconds if on home view (reduced frequency to prevent glitchy UI)
    setInterval(() => {
        if (document.getElementById("homeView").style.display !== "none") {
            loadDashboardData();
        }
    }, 10000);

    // Modal Navigation Listeners
    document.getElementById("prevJsModalBtn").addEventListener("click", () => navigateJsModal(-1));
    document.getElementById("nextJsModalBtn").addEventListener("click", () => navigateJsModal(1));

    // Risk Filter Listener
    const riskFilter = document.getElementById("leakRiskFilter");
    if (riskFilter) {
        riskFilter.addEventListener("change", () => renderLeaksTable());
    }
});

// ===============================
// DATA LOADING
// ===============================
function loadDashboardData() {
    fetch("/api/stats")
        .then(r => r.json())
        .then(stats => {
            updateStats(stats);
            renderCharts(stats);
        })
        .catch(err => console.error("Stats error:", err));

    // Fetch Heatmap Data
    fetch("/api/stats/category_heatmap")
        .then(r => r.json())
        .then(data => {
            renderHeatmap(data);
        })
        .catch(err => console.error("Heatmap error:", err));

    fetch("/api/tasks?limit=10")
        .then(r => r.json())
        .then(data => {
            renderTaskList(data.tasks);
        })
        .catch(err => console.error("Tasks error:", err));
}

function renderHeatmap(data) {
    const tbody = document.getElementById("heatmapBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const categories = data.categories || [];
    const matrix = data.matrix || {};

    if (categories.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' class='text-muted'>No data available</td></tr>";
        return;
    }

    categories.forEach(cat => {
        const row = document.createElement("tr");
        const counts = matrix[cat] || { High: 0, Medium: 0, Low: 0 };

        // Helper to make 0 look dim
        const fmt = (n) => n > 0 ? `<strong>${n}</strong>` : `<span class="text-secondary" style="opacity: 0.5;">0</span>`;

        row.innerHTML = `
            <td class="text-start fw-bold" style="padding: 0.25rem 0.5rem; color: var(--accent-primary);">${cat}</td>
            <td style="padding: 0.25rem 0.5rem;">${fmt(counts.High)}</td>
            <td style="padding: 0.25rem 0.5rem;">${fmt(counts.Medium)}</td>
            <td style="padding: 0.25rem 0.5rem;">${fmt(counts.Low)}</td>
        `;
        tbody.appendChild(row);
    });
}


function updateStats(stats) {
    document.getElementById("totalScans").innerText = stats.total_scans || 0;
    document.getElementById("completedScans").innerText = stats.status_distribution?.finished || 0;
    document.getElementById("highRiskScans").innerText = stats.risk_distribution?.High || 0;
    document.getElementById("activeScans").innerText = stats.status_distribution?.running || 0;
}

// ===============================
// CHARTS
// ===============================
function renderCharts(stats) {
    const statusCtx = document.getElementById("statusChart").getContext("2d");
    const riskCtx = document.getElementById("riskChart").getContext("2d");

    // Check Theme (for visibility)
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const titleColor = isLight ? "#2B3674" : "#f1f5f9";
    const textColor = isLight ? "#707EAE" : "#94a3b8";
    const gridColor = isLight ? "#e2e8f0" : "#334155";

    // --- Status Chart ---
    const statusData = {
        labels: ["Finished", "Running", "Failed", "Queued"],
        datasets: [{
            data: [
                stats.status_distribution?.finished || 0,
                stats.status_distribution?.running || 0,
                stats.status_distribution?.failed || 0,
                stats.status_distribution?.queued || 0
            ],
            backgroundColor: ["#34d399", "#38bdf8", "#f87171", "#94a3b8"],
            borderWidth: 0
        }]
    };

    if (statusChart) {
        statusChart.data = statusData;
        statusChart.options.plugins.title.color = titleColor;
        statusChart.options.plugins.legend.labels.color = textColor;
        statusChart.update('none');
    } else {
        statusChart = new Chart(statusCtx, {
            type: "doughnut",
            data: statusData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                animation: { duration: 0 },
                plugins: {
                    legend: { position: "bottom", labels: { color: textColor, usePointStyle: true, padding: 15 } },
                    title: { display: true, text: "Scan Status", color: titleColor, padding: { bottom: 10 } }
                }
            }
        });
    }

    // --- Insights Chart (Bar) - Top Categories ---
    const leaksByCat = stats.top_leak_categories || {};
    const hasLeaks = Object.keys(leaksByCat).length > 0;

    // If no leaks, show a green "System Secure" bar
    const labels = hasLeaks ? Object.keys(leaksByCat) : ["System Secure"];
    const data = hasLeaks ? Object.values(leaksByCat) : [1]; // Dummy value for visibility

    // Dynamic Colors: Cyber palette for leaks, Green for secure
    const cyberColors = ["#38bdf8", "#818cf8", "#fbbf24", "#f87171", "#c084fc"];
    const bgColors = hasLeaks ? cyberColors : ["#34d399"];

    const insightData = {
        labels: labels,
        datasets: [{
            label: "Count",
            data: data,
            backgroundColor: bgColors,
            borderRadius: hasLeaks ? 4 : 8,
            barThickness: hasLeaks ? 25 : 60
        }]
    };

    // Re-create if type changed (Pie -> Bar)
    if (riskChart && riskChart.config.type !== 'bar') {
        riskChart.destroy();
        riskChart = null;
    }

    if (riskChart) {
        riskChart.data = insightData;
        riskChart.options.plugins.title.color = titleColor;
        riskChart.options.scales.x.ticks.color = textColor;
        riskChart.options.scales.y.ticks.color = textColor;
        riskChart.options.scales.y.grid.color = gridColor;
        riskChart.update('none');
    } else {
        riskChart = new Chart(riskCtx, {
            type: "bar",
            data: insightData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: "Top Vulnerability Categories", color: titleColor, padding: { bottom: 10 } }
                },
                scales: {
                    x: {
                        ticks: { color: textColor, font: { size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: textColor, precision: 0 },
                        grid: { color: gridColor, borderDash: [3, 3] }
                    }
                }
            }
        });
    }
}

// ===============================
// TASK LIST
// ===============================
function renderTaskList(tasks) {
    const tbody = document.getElementById("tasksTableBody");
    tbody.innerHTML = "";

    if (!tasks || tasks.length === 0) {
        tbody.innerHTML = "<tr><td colspan='6' class='text-center'>No scans found.</td></tr>";
        return;
    }

    tasks.forEach(task => {
        const tr = document.createElement("tr");

        const statusClass = `status-${task.status}`;
        const riskScore = task.results?.risk_ml?.score;
        let riskBadge = "-";

        if (riskScore !== undefined) {
            if (riskScore >= 70) riskBadge = `<span class="risk-high">High (${riskScore})</span>`;
            else if (riskScore >= 40) riskBadge = `<span class="risk-medium">Medium (${riskScore})</span>`;
            else riskBadge = `<span class="risk-low">Low (${riskScore})</span>`;
        }

        tr.innerHTML = `
            <td><span class="text-muted">#${task._id.slice(-6)}</span></td>
            <td>${task.url}</td>
            <td><span class="status-badge ${statusClass}">${task.status}</span></td>
            <td>${riskBadge}</td>
            <td>${new Date(task.created_at).toLocaleString()}</td>
            <td>
                <button class="btn btn-sm btn-outline-info" onclick="viewScan('${task._id}', '${task.url}')">View</button>
                <button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteTask('${task._id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteTask(taskId) {
    if (!confirm("Are you sure you want to delete this scan? This cannot be undone.")) return;

    fetch(`/api/delete_task/${taskId}`, { method: "POST" })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                // If we deleted the currently active scan, go home
                const activeId = localStorage.getItem("activeScanId");
                if (activeId === taskId) {
                    showHome();
                } else {
                    loadDashboardData(); // Refresh list
                }
            } else {
                alert("Error deleting task: " + (d.error || "Unknown error"));
            }
        })
        .catch(err => alert("Failed to delete task: " + err.message));
}

function deleteAllTasks() {
    if (!confirm("⚠️ WARNING: This will permanently delete ALL scans and their data. This cannot be undone. Are you sure?")) return;

    fetch("/api/delete_all_tasks", { method: "POST" })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                // Clear active scan if exists
                localStorage.removeItem("activeScanId");
                localStorage.removeItem("activeScanUrl");

                // Go to home and refresh
                showHome();
            } else {
                alert("Error deleting tasks: " + (d.error || "Unknown error"));
            }
        })
        .catch(err => alert("Failed to delete all tasks: " + err.message));
}

// ===============================
// VIEW MANAGEMENT
// ===============================
function showHome() {
    document.getElementById("homeView").style.display = "block";
    document.getElementById("scanView").style.display = "none";

    // Clear active scan state
    localStorage.removeItem("activeScanId");
    localStorage.removeItem("activeScanUrl");

    loadDashboardData(); // Refresh data when returning home
}

function viewScan(taskId, url) {
    document.getElementById("homeView").style.display = "none";
    document.getElementById("scanView").style.display = "block";
    document.getElementById("scanTargetDisplay").innerText = url;

    // Persist active scan state
    localStorage.setItem("activeScanId", taskId);
    localStorage.setItem("activeScanUrl", url);

    resetScanView();
    pollTask(taskId);
}

// ===============================
// SCAN LOGIC (Existing + Adapted)
// ===============================
const progressMap = {
    "queued": 10,
    "running": 25,
    "js_discovery_done": 50,
    "leak_detection_done": 70,
    "validation_done": 85,
    "finished": 100
};

const stageNames = {
    "queued": "Scan Queued",
    "running": "Scanning Target",
    "js_discovery_done": "JS Discovery Complete",
    "leak_detection_done": "Leak Detection Complete",
    "validation_done": "Validation Complete",
    "finished": "Scan Completed"
};

document.getElementById("startScanBtn").addEventListener("click", () => {
    const urlInput = document.getElementById("targetUrl");
    const url = urlInput.value.trim();

    if (!url) {
        alert("Please enter a valid URL");
        urlInput.focus();
        return;
    }

    const fullUrl = url.startsWith("http") ? url : `https://${url}`;

    // Switch to scan view immediately
    document.getElementById("homeView").style.display = "none";
    document.getElementById("scanView").style.display = "block";
    document.getElementById("scanTargetDisplay").innerText = fullUrl;
    resetScanView();

    fetch("/api/start_scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl })
    })
        .then(r => r.json())
        .then(d => {
            if (d.task_id) {
                // Save state immediately
                localStorage.setItem("activeScanId", d.task_id);
                localStorage.setItem("activeScanUrl", fullUrl);

                updateProgress("queued");
                pollTask(d.task_id);
            } else {
                alert("Error: " + JSON.stringify(d));
                showHome();
            }
        })
        .catch(err => {
            alert("Failed to start scan: " + err.message);
            showHome();
        });
});

function pollTask(taskId) {
    // Clear any existing poll to avoid multiple polls
    if (window.currentPoll) clearInterval(window.currentPoll);

    window.currentPoll = setInterval(async () => {
        try {
            const task = await (await fetch(`/api/task_status/${taskId}`)).json();
            updateProgress(task.status || "running");

            // JS Discovery
            if (task.results?.js_discovery) {
                showJsFiles(taskId);
            }

            // Endpoints
            if (task.results?.endpoints) {
                showEndpoints(task.results.endpoints);
            }

            // Leak results
            let leaksResp = await fetch(`/api/leaks/${taskId}`);
            if (leaksResp.ok) {
                let leaksPayload = await leaksResp.json();
                showLeaks(leaksPayload.leaks || []);
            }

            // Task logs
            let logsResp = await fetch(`/api/task_logs/${taskId}`);
            if (logsResp.ok) {
                let logsPayload = await logsResp.json();
                renderTaskLogs(logsPayload);
            }

            // Risk scoring
            if (task.results?.risk_ml) {
                showRisk(task.results.risk_ml.score);
            }

            if (task.status === "finished" || task.status === "failed" || task.status === "stopped") {
                updateProgress(task.status === "finished" ? "finished" : task.status);
                clearInterval(window.currentPoll);
            }

        } catch (err) {
            console.error("Poll error:", err);
            clearInterval(window.currentPoll);
        }
    }, 3000);
}

function updateProgress(status) {
    const bar = document.getElementById("scanProgressBar");
    const statusText = document.getElementById("progressStatusText");

    const percentage = progressMap[status] || 20;
    const displayName = stageNames[status] || status.toUpperCase();

    bar.style.width = percentage + "%";
    statusText.innerText = displayName;
}

function resetScanView() {
    // Reset UI elements for a new scan view
    document.getElementById("jsFilesList").innerHTML = "";
    document.getElementById("jsFilesContainer").style.display = "none";
    document.getElementById("leakCards").innerHTML = "";
    document.getElementById("leaksContainer").style.display = "none";
    document.getElementById("taskLogs").innerHTML = "";
    document.getElementById("taskLogsContainer").style.display = "none";
    document.getElementById("riskScore").innerText = "0";
    document.getElementById("riskLabel").innerText = "Low";

    // Reset Endpoints
    document.getElementById("endpointsList").innerHTML = "";
    document.getElementById("endpointsContainer").style.display = "none";
    document.getElementById("endpointCount").innerText = "0";

    const bar = document.getElementById("scanProgressBar");
    bar.style.width = "0%";
    document.getElementById("progressStatusText").innerText = "Initializing...";

    // Reset pagination
    currentJsPage = 1;
    currentEpPage = 1;
    allJsFiles = [];
    allEndpoints = [];
}

// ===============================
// HELPER FUNCTIONS (Reused)
// ===============================

// --- JS Files Pagination ---
function showJsFiles(taskId) {
    fetch(`/api/js_files/${taskId}`)
        .then(r => r.json())
        .then(d => {
            const container = document.getElementById("jsFilesContainer");
            const fileCount = document.getElementById("fileCount");

            container.style.display = "block";
            allJsFiles = d.js_files || [];
            fileCount.innerText = allJsFiles.length;

            renderJsPage();
        });
}

function renderJsPage() {
    const list = document.getElementById("jsFilesList");
    list.innerHTML = "";

    const start = (currentJsPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = allJsFiles.slice(start, end);

    pageItems.forEach((file, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div class="text-truncate" style="max-width: 400px;" title="${file.src}">
                    ${file.src || `[INLINE SCRIPT #${start + index + 1}]`}
                </div>
            </td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-info" onclick="loadJsFile('${file._id}')">View Content</button>
            </td>
        `;
        list.appendChild(tr);
    });

    // Update controls
    document.getElementById("jsPageIndicator").innerText = `Page ${currentJsPage} of ${Math.ceil(allJsFiles.length / ITEMS_PER_PAGE) || 1}`;
    document.getElementById("prevJsBtn").disabled = currentJsPage === 1;
    document.getElementById("nextJsBtn").disabled = end >= allJsFiles.length;
}

function changeJsPage(delta) {
    currentJsPage += delta;
    renderJsPage();
}

// --- Endpoints Pagination ---
function showEndpoints(endpoints) {
    const container = document.getElementById("endpointsContainer");
    const count = document.getElementById("endpointCount");

    container.style.display = "block";
    allEndpoints = endpoints || [];
    count.innerText = allEndpoints.length;

    renderEpPage();
}

function renderEpPage() {
    const list = document.getElementById("endpointsList");
    list.innerHTML = "";

    const start = (currentEpPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = allEndpoints.slice(start, end);

    pageItems.forEach(ep => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div class="text-truncate" style="max-width: 400px;" title="${ep.link}">
                    ${ep.link}
                </div>
            </td>
            <td>
                <div class="text-truncate" style="max-width: 200px;" title="${ep.source_file || 'Unknown'}">
                    ${ep.source_file || 'Unknown'}
                </div>
            </td>
        `;
        list.appendChild(tr);
    });

    // Update controls
    document.getElementById("epPageIndicator").innerText = `Page ${currentEpPage} of ${Math.ceil(allEndpoints.length / ITEMS_PER_PAGE) || 1}`;
    document.getElementById("prevEpBtn").disabled = currentEpPage === 1;
    document.getElementById("nextEpBtn").disabled = end >= allEndpoints.length;
}

function changeEpPage(delta) {
    currentEpPage += delta;
    renderEpPage();
}

// --- JS Content Modal ---

function loadJsFile(jsId) {
    // Find index in the global list
    const index = allJsFiles.findIndex(f => f._id === jsId);
    if (index !== -1) {
        currentModalJsIndex = index;
        loadJsContent(index);

        // Show Bootstrap Modal (only if not already visible)
        const modalEl = document.getElementById('jsContentModal');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
}

function navigateJsModal(direction) {
    const newIndex = currentModalJsIndex + direction;
    if (newIndex >= 0 && newIndex < allJsFiles.length) {
        currentModalJsIndex = newIndex;
        loadJsContent(newIndex);
    }
}

function loadJsContent(index) {
    const file = allJsFiles[index];
    if (!file) return;

    // Update buttons
    document.getElementById("prevJsModalBtn").disabled = (index === 0);
    document.getElementById("nextJsModalBtn").disabled = (index === allJsFiles.length - 1);

    // Fetch content
    fetch(`/api/js_file/${file._id}`)
        .then(r => r.json())
        .then(d => {
            // Determine Title with numbering
            let title = d.src;
            if (!title) {
                // If inline, use the same numbering logic as the list: index + 1
                title = `Inline Script #${index + 1}`;
            }

            // User requested explicit numbering display "Inline Script #(n)" based on the screenshot text.
            // If it's a file with a src, we might want to still show index or just the src. 
            // The request says "where n is the number of inline script".
            // If it is NOT inline (has src), we probably just show src.
            // But if it IS inline, we show "Inline Script #N".
            // My logic above handles this.

            document.getElementById("jsModalTitle").innerText = title;

            const codeBlock = document.getElementById("jsModalContent");
            codeBlock.textContent = d.content || "// No content available";

            // Re-highlight
            delete codeBlock.dataset.highlighted; // Clear highlight cache if any
            hljs.highlightElement(codeBlock);
        })
        .catch(err => {
            console.error("Error loading JS content:", err);
            document.getElementById("jsModalContent").textContent = "// Error loading content";
        });
}

// --- Leaks Table ---
// --- Leaks Table ---
function showLeaks(leaks) {
    const container = document.getElementById("leaksContainer");
    const count = document.getElementById("leakCount");

    container.style.display = "block";

    // Store data globally
    allLeaksData = leaks || [];
    count.innerText = allLeaksData.length.toString();

    renderLeaksTable();
}

function renderLeaksTable() {
    const tbody = document.getElementById("leakCards");
    const filter = document.getElementById("leakRiskFilter").value;

    tbody.innerHTML = "";

    if (allLeaksData.length === 0) {
        tbody.innerHTML = "<tr><td colspan='3' class='text-center text-muted'>No leaks detected.</td></tr>";
        return;
    }

    // Filter Logic
    const filteredLeaks = allLeaksData.filter(leak => {
        if (filter === "all") return true;

        const risk = leak.risk || {};
        // Determine severity
        let severity = (risk.severity || "low").toLowerCase();

        // Also map score to severity explicitly if needed, but usually severity field is enough
        // Ensure critical/high are grouped if needed, or matched exactly.
        // Our dropdown has: critical, high, medium, low.
        // Backend might return: critical, high, medium, low, info.

        if (severity === filter) return true;

        // Handling edge cases or casing
        return false;
    });

    if (filteredLeaks.length === 0) {
        tbody.innerHTML = "<tr><td colspan='3' class='text-center text-muted'>No leaks match the selected filter.</td></tr>";
        return;
    }

    filteredLeaks.forEach(leak => {
        const tr = document.createElement("tr");

        // --- 1. Risk Analysis Data ---
        const risk = leak.risk; // Might be undefined

        // Default state if analysis hasn't run
        let scoreDisplay = "Pending...";
        let sevDisplay = (leak.severity || "low").toUpperCase();
        let sevClass = "bg-secondary";
        let scoreColor = "#94a3b8";

        if (risk) {
            const score = risk.score || 0;
            const severity = (risk.severity || "low").toLowerCase();
            scoreDisplay = `Score: ${score}`;
            sevDisplay = severity.toUpperCase();

            if (score >= 70 || severity === "high" || severity === "critical") {
                sevClass = "bg-danger";
                scoreColor = "#ef4444";
            } else if (score >= 40 || severity === "medium") {
                sevClass = "bg-warning text-dark";
                scoreColor = "#f59e0b";
            } else {
                sevClass = "bg-success";
                scoreColor = "#10b981";
            }
        } else {
            // Risk analysis hasn't run yet
            sevClass = "bg-secondary";
            scoreDisplay = "Analysis Pending";
            scoreColor = "#64748b";
        }

        // --- 2. OSINT & Details ---
        const osint = leak.osint || {};
        const labels = osint.labels || [];
        const metadata = osint.metadata || {};

        // Build badges
        let badgesHtml = "";

        // Category Badge
        if (leak.category) {
            badgesHtml += `<span class="badge border border-info text-info me-1">${leak.category}</span>`;
        }

        // OSINT Badges
        labels.forEach(label => {
            if (label === "NO_OSINT_SIGNAL") return;
            // Clean up label: PUBLICLY_EXPOSED_ARTIFACT -> Publicly Exposed
            const readable = label.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
            badgesHtml += `<span class="badge bg-dark border border-secondary text-light me-1" title="OSINT Signal">🌐 ${readable}</span>`;
        });

        // Domain Context
        if (metadata.domain) {
            badgesHtml += `<span class="badge bg-dark border border-danger text-danger me-1">⚠️ ${metadata.domain} (${metadata.domain_type})</span>`;
        }

        // ML Factors (if any precise explainability)
        const mlFactors = risk.factors || [];
        // Only show if it's interesting
        if (mlFactors.length > 0) {
            badgesHtml += `<div class="mt-1 small text-muted"><em>${mlFactors[0]}</em></div>`;
        }

        // --- 3. Render Row ---
        tr.innerHTML = `
            <td style="width: 15%;">
                <div class="d-flex flex-column align-items-center">
                    <span class="badge ${sevClass} mb-1" style="font-size: 0.9rem;">${sevDisplay}</span>
                    <span style="font-size: 0.8rem; font-weight: bold; color: ${scoreColor};">${scoreDisplay}</span>
                </div>
            </td>
            <td style="width: 40%;">
                <div class="mb-1"><strong>${leak.pattern || "Secret Detected"}</strong></div>
                <div class="d-flex flex-wrap">${badgesHtml}</div>
                ${leak.url ? `<div class="small text-secondary mt-1 text-truncate" style="max-width: 300px;" title="${leak.url}">${leak.url}</div>` : ''}
            </td>
            <td style="width: 45%;">
                <pre class="log-box-cyber mb-0" style="max-height: 80px; font-size: 0.75rem; white-space: pre-wrap;">${leak.excerpt || leak.snippet || "[no snippet]"}</pre>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderTaskLogs(payload) {
    const box = document.getElementById("taskLogs");
    const container = document.getElementById("taskLogsContainer");

    container.style.display = "block";

    if (!payload || !Array.isArray(payload.logs)) {
        box.innerHTML = "<em>No logs yet</em>";
        return;
    }

    let html = "";
    payload.logs.forEach(log => {
        const color = log.level === "error" ? "#f87171" : log.level === "warn" ? "#fbbf24" : "#38bdf8";
        html += `
            <div style="color:${color}; margin-bottom:4px;">
                [${new Date(log.timestamp).toLocaleTimeString()}] <strong>${log.stage}:</strong> ${log.message}
            </div>
        `;
    });

    box.innerHTML = html;
}

function toggleLogs() {
    const logsBody = document.getElementById("taskLogsBody");
    logsBody.style.display = logsBody.style.display === "none" ? "block" : "none";
}

function showRisk(score) {
    const cont = document.getElementById("riskContainer");
    const el = document.getElementById("riskScore");
    const label = document.getElementById("riskLabel");
    const circle = el.closest(".risk-score-circle");

    // riskContainer is always visible in the new design - no need to change display

    // Simple animation
    let start = 0;
    const duration = 1000;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const currentScore = Math.floor(progress * score);
        el.innerText = currentScore;

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    requestAnimationFrame(update);

    // Color logic
    if (score >= 70) {
        circle.style.borderColor = "var(--accent-danger)";
        el.style.color = "var(--accent-danger)";
        label.innerText = "Critical";
        label.style.color = "var(--accent-danger)";
    } else if (score >= 40) {
        circle.style.borderColor = "var(--accent-warning)";
        el.style.color = "var(--accent-warning)";
        label.innerText = "Medium";
        label.style.color = "var(--accent-warning)";
    } else {
        circle.style.borderColor = "var(--accent-success)";
        el.style.color = "var(--accent-success)";
        label.innerText = "Low";
        label.style.color = "var(--accent-success)";
    }
}

// ===============================
// THEME MANAGEMENT
// ===============================
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute("data-theme");
    const btn = document.getElementById("themeToggleBtn");

    if (currentTheme === "light") {
        html.removeAttribute("data-theme");
        localStorage.setItem("theme", "dark");
        btn.innerText = "🌙";
        document.getElementById("hljsTheme").href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";
    } else {
        html.setAttribute("data-theme", "light");
        localStorage.setItem("theme", "light");
        btn.innerText = "☀️";
        document.getElementById("hljsTheme").href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css";
    }

    // Refresh charts to update colors
    loadDashboardData();
}
