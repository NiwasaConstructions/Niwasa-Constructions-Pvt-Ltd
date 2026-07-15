import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore, collection, setDoc, doc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCGMzbzofR43a0RfrZxwt_M1--8INcxbxc",
  authDomain: "erp---niwasa-payments.firebaseapp.com",
  projectId: "erp---niwasa-payments",
  storageBucket: "erp---niwasa-payments.firebasestorage.app",
  messagingSenderId: "233686322429",
  appId: "1:233686322429:web:bf5b1ed5e54a09479e8294",
  measurementId: "G-LWC9VL02QS"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const IMGBB_API_KEY = "3a1d8af31b4c28245b2e1bcaa81d866f"; 

// Global States
let allVendorsList = [];
let allBillsList = []; 
let allPaymentsList = [];
let allLorryRecords = [];
let currentBillVendorFilter = 'ALL'; 
let dashboardStats = {}; 

// Pagination States
let paginationStates = {
    vendors: { currentPage: 1, pageSize: 25 },
    sites: { currentPage: 1, pageSize: 25 },
    bills: { currentPage: 1, pageSize: 25 },
    payments: { currentPage: 1, pageSize: 25 },
    cheques: { currentPage: 1, pageSize: 25 },
    lorry: { currentPage: 1, pageSize: 25 }
};

const generateCustomID = (prefix) => `${prefix}-${Date.now().toString().slice(-4)}${Math.floor(1000 + Math.random() * 9000)}`;

// --- අලුත් IMAGE COMPRESSION FUNCTION එක ---
async function compressImage(file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Max width/height වලට වඩා වැඩිනම් අඩු කරනවා
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height *= maxWidth / width));
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width *= maxHeight / height));
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    // Blob එක File එකක් විදියට ආපහු හදනවා
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', quality); // Quality එක 0.7 (70%) වගේ තියනවා
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// Image Upload Helper (Compress කරලා යවනවා)
async function uploadToImgBB(file) {
    try {
        const compressedFile = await compressImage(file); // මුලින්ම Compress කරනවා
        const formData = new FormData(); 
        formData.append('image', compressedFile); // Compress කරපු එක යවනවා
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
        const data = await res.json();
        if(data.success) return data.data.url; throw new Error("Upload failed");
    } catch (error) {
        console.error("Image processing error:", error);
        throw error;
    }
}

// --- AUTH & NAV ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('b-date').value = today; document.getElementById('p-date').value = today; document.getElementById('l-date').value = today;
        initDataLoad();
    } else {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('dashboard-section').style.display = 'none';
    }
});

document.getElementById('login-btn').addEventListener('click', () => signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(err => alert("Login Failed: " + err.message)));
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.querySelectorAll('.app-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(`section-${e.currentTarget.getAttribute('data-target')}`).classList.add('active');
    });
});

document.getElementById('add-vendor-btn').addEventListener('click', () => { document.getElementById('vendor-form').reset(); document.getElementById('edit-vendor-id').value = ''; document.getElementById('vendor-modal-title').innerText = "Add New Vendor"; });
document.getElementById('add-bill-btn').addEventListener('click', () => { document.getElementById('bill-form').reset(); document.getElementById('edit-bill-id').value = ''; document.getElementById('b-date').value = new Date().toISOString().split('T')[0]; document.getElementById('bill-modal-title').innerText = "Add New Bill"; });

// --- PAGINATION RENDERER ---
function renderPagination(sectionKey, dataLength, renderFunction) {
    const state = paginationStates[sectionKey];
    const container = document.getElementById(`pg-${sectionKey}`);
    if(!container) return;
    
    if (state.pageSize === 'ALL') { container.innerHTML = ''; return; }
    
    const totalPages = Math.ceil(dataLength / state.pageSize);
    if(state.currentPage > totalPages) state.currentPage = totalPages > 0 ? totalPages : 1;

    const startItem = dataLength === 0 ? 0 : ((state.currentPage - 1) * state.pageSize) + 1;
    const endItem = Math.min(state.currentPage * state.pageSize, dataLength);

    container.innerHTML = `
        <div class="page-info">Showing ${startItem} to ${endItem} of ${dataLength} entries</div>
        <div>
            <button class="btn btn-sm btn-outline-secondary me-1" id="btn-prev-${sectionKey}" ${state.currentPage === 1 ? 'disabled' : ''}>Previous</button>
            <span class="mx-2 fw-bold text-primary">Page ${state.currentPage} of ${totalPages || 1}</span>
            <button class="btn btn-sm btn-outline-secondary ms-1" id="btn-next-${sectionKey}" ${state.currentPage >= totalPages ? 'disabled' : ''}>Next</button>
        </div>
    `;

    const prevBtn = document.getElementById(`btn-prev-${sectionKey}`);
    if(prevBtn) prevBtn.addEventListener('click', () => { if(state.currentPage > 1) { state.currentPage--; renderFunction(); } });
    
    const nextBtn = document.getElementById(`btn-next-${sectionKey}`);
    if(nextBtn) nextBtn.addEventListener('click', () => { if(state.currentPage < totalPages) { state.currentPage++; renderFunction(); } });
}

// Attach Page Size Change Listeners
['vendors', 'sites', 'bills', 'payments', 'cheques', 'lorry'].forEach(key => {
    const selectEl = document.getElementById(`page-size-${key}`);
    if(selectEl) {
        selectEl.addEventListener('change', (e) => {
            let val = e.target.value;
            paginationStates[key].pageSize = val === 'ALL' ? 'ALL' : parseInt(val);
            paginationStates[key].currentPage = 1;
            
            if(key === 'vendors') renderVendorsTable();
            if(key === 'sites') renderSitesTable();
            if(key === 'bills') applyBillFilters();
            if(key === 'payments') renderPaymentsTable();
            if(key === 'cheques') renderChequesTable();
            if(key === 'lorry') renderLorryTable();
        });
    }
});


function renderVendorFilterButtons() {
    const container = document.getElementById('vendor-filter-buttons'); if(!container) return;
    let html = `<button class="btn btn-sm ${currentBillVendorFilter === 'ALL' ? 'btn-primary' : 'btn-outline-primary'} vendor-filter-btn" data-id="ALL">All Vendors</button>`;
    allVendorsList.forEach(v => { html += `<button class="btn btn-sm ${currentBillVendorFilter === v.id ? 'btn-primary' : 'btn-outline-primary'} vendor-filter-btn" data-id="${v.id}">${v.name}</button>`; });
    container.innerHTML = html;
    document.querySelectorAll('.vendor-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { currentBillVendorFilter = e.currentTarget.dataset.id; paginationStates.bills.currentPage = 1; renderVendorFilterButtons(); applyBillFilters(); });
    });
}

// --- RENDERING FUNCTIONS (WITH PAGINATION) ---
let currentSitesList = []; 

function renderVendorsTable() {
    const vTable = document.getElementById('v-table'); vTable.innerHTML = '';
    const state = paginationStates.vendors;
    let dataToRender = allVendorsList;
    
    if (state.pageSize !== 'ALL') {
        const start = (state.currentPage - 1) * state.pageSize;
        dataToRender = allVendorsList.slice(start, start + state.pageSize);
    }
    
    dataToRender.forEach(d => {
        let bankInfo = d.bank_name ? `<strong>${d.bank_name}</strong> ${d.bank_branch ? `(${d.bank_branch})` : ''}<br><small>${d.acc_name || ''} - ${d.bank_acc || ''}</small>` : '-';
        vTable.innerHTML += `<tr><td><span class="badge bg-secondary">${d.custom_id}</span></td><td class="fw-bold">${d.name}</td><td>${d.contact}<br><small class="text-muted">${d.address || ''}</small></td><td>${bankInfo}</td>
        <td><button class="btn btn-sm btn-outline-primary edit-vendor-btn" data-id="${d.id}"><i class="bi bi-pencil"></i></button></td></tr>`;
    });
    
    document.querySelectorAll('.edit-vendor-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const vData = allVendorsList.find(v => v.id === e.currentTarget.dataset.id); document.getElementById('edit-vendor-id').value = vData.id;
        ['name', 'contact', 'address', 'acc_name', 'bank_name', 'bank_branch', 'acc_no'].forEach(f => { let domId = f === 'acc_no' ? 'v-acc-no' : `v-${f.replace('_', '-')}`; document.getElementById(domId).value = vData[f === 'acc_no' ? 'bank_acc' : f] || ''; });
        document.getElementById('vendor-modal-title').innerText = "Edit Vendor Details"; new bootstrap.Modal(document.getElementById('vendorModal')).show();
    }));
    
    renderPagination('vendors', allVendorsList.length, renderVendorsTable);
}

function renderSitesTable() {
    const sTable = document.getElementById('s-table'); sTable.innerHTML = '';
    const state = paginationStates.sites;
    let dataToRender = currentSitesList;
    
    if (state.pageSize !== 'ALL') {
        const start = (state.currentPage - 1) * state.pageSize;
        dataToRender = currentSitesList.slice(start, start + state.pageSize);
    }
    
    dataToRender.forEach(d => {
        let isOngoing = d.status === 'ONGOING';
        sTable.innerHTML += `<tr><td class="fw-bold"><i class="bi bi-geo-alt text-danger me-2"></i> ${d.name}</td><td><span class="badge bg-${isOngoing ? 'primary' : 'secondary'}">${d.status}</span></td>
            <td><button class="btn btn-sm ${isOngoing ? 'btn-outline-success' : 'btn-secondary'} toggle-site-btn" data-id="${d.id}" data-status="${d.status}" ${!isOngoing ? 'disabled' : ''}>${isOngoing ? 'Mark Completed' : 'Completed'}</button></td></tr>`;
    });
    
    document.querySelectorAll('.toggle-site-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        if(confirm("Mark this site as Completed?")) await updateDoc(doc(db, "sites", e.currentTarget.dataset.id), { status: "COMPLETED" });
    }));
    
    renderPagination('sites', currentSitesList.length, renderSitesTable);
}

function renderPaymentsTable() {
    const pTable = document.getElementById('payment-history-table'); pTable.innerHTML = '';
    const state = paginationStates.payments;
    let dataToRender = allPaymentsList;
    
    if (state.pageSize !== 'ALL') {
        const start = (state.currentPage - 1) * state.pageSize;
        dataToRender = allPaymentsList.slice(start, start + state.pageSize);
    }

    dataToRender.forEach(d => {
        let imgBtn = d.attachment_url ? `<a href="${d.attachment_url}" target="_blank" class="text-primary"><i class="bi bi-image fs-5"></i></a>` : '-';
        let statusBadge = d.cheque_status === 'PENDING' ? '<span class="badge bg-warning">Pending</span>' : (d.cheque_status === 'RETURNED' ? '<span class="badge bg-danger">Returned</span>' : '<span class="badge bg-success">Cleared</span>');
        pTable.innerHTML += `<tr>
            <td>${d.payment_date}</td><td class="fw-bold">${d.payment_id}</td><td>${d.method.replace('_', ' ')} ${d.cheque_number ? `(${d.cheque_number})` : ''}</td>
            <td class="text-success fw-bold">Rs. ${d.total_amount.toLocaleString()}</td><td>${statusBadge}</td><td>${imgBtn}</td>
            <td><button class="btn btn-sm btn-outline-info view-payment-btn" data-id="${d.id}"><i class="bi bi-eye"></i></button></td>
        </tr>`;
    });

    document.querySelectorAll('.view-payment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const payData = allPaymentsList.find(p => p.id === e.currentTarget.dataset.id); if(!payData) return;
            document.getElementById('detail-pay-id').innerText = payData.payment_id; document.getElementById('detail-pay-date').innerText = payData.payment_date;
            document.getElementById('detail-pay-method').innerText = payData.method.replace('_', ' '); document.getElementById('detail-pay-total').innerText = 'Rs. ' + payData.total_amount.toLocaleString();
            if(payData.cheque_number) {
                document.getElementById('detail-cheque-info').style.display = 'block';
                document.getElementById('detail-cheque-text').innerText = `${payData.cheque_number} (Date: ${payData.cheque_date || '-'} | Status: ${payData.cheque_status})`;
            } else { document.getElementById('detail-cheque-info').style.display = 'none'; }

            const allocTable = document.getElementById('detail-allocations-table'); allocTable.innerHTML = '';
            if(payData.allocations && payData.allocations.length > 0) {
                payData.allocations.forEach(alloc => {
                    const bill = allBillsList.find(b => b.id === alloc.bill_id);
                    allocTable.innerHTML += `<tr><td class="fw-bold">${bill ? bill.bill_number : '<span class="text-danger">Deleted Bill</span>'}</td><td>${bill ? (bill.items_info || '-') : '-'}</td><td class="text-success fw-bold">Rs. ${alloc.amount.toLocaleString()}</td></tr>`;
                });
            } else { allocTable.innerHTML = `<tr><td colspan="3" class="text-center text-muted">No specific bills allocated.</td></tr>`; }
            new bootstrap.Modal(document.getElementById('paymentDetailsModal')).show();
        });
    });
    
    renderPagination('payments', allPaymentsList.length, renderPaymentsTable);
}

function renderLorryTable() {
    const lTable = document.getElementById('lorry-table'); lTable.innerHTML = '';
    const state = paginationStates.lorry;
    let dataToRender = allLorryRecords; 
    
    if (state.pageSize !== 'ALL') {
        const start = (state.currentPage - 1) * state.pageSize;
        dataToRender = allLorryRecords.slice(start, start + state.pageSize);
    }
    
    dataToRender.forEach(d => {
        let imgBtn = d.attachment_url ? `<a href="${d.attachment_url}" target="_blank" class="text-primary"><i class="bi bi-image fs-5"></i></a>` : '-';
        let inAmt = (d.type === 'ADVANCE' || d.type === 'OPENING_BAL') ? d.amount.toLocaleString() : '-';
        let outAmt = d.type === 'EXPENSE' ? d.amount.toLocaleString() : '-';
        let badge = d.type === 'OPENING_BAL' ? '<span class="badge bg-dark">Opening</span> ' : '';
        lTable.innerHTML += `<tr><td>${d.date}</td><td>${badge}${d.description}</td><td class="text-success fw-bold">${inAmt}</td><td class="text-danger fw-bold">${outAmt}</td><td class="fw-bold fs-6 ${d.runningBalance < 0 ? 'text-danger' : 'text-primary'}">${d.runningBalance.toLocaleString()}</td><td class="text-center">${imgBtn}</td><td><button class="btn btn-sm btn-outline-danger del-lorry-btn" data-id="${d.id}"><i class="bi bi-trash"></i></button></td></tr>`;
    });
    
    document.querySelectorAll('.del-lorry-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        if(confirm("Delete this record?")) await deleteDoc(doc(db, "lorry_cash", e.currentTarget.dataset.id));
    }));
    
    renderPagination('lorry', allLorryRecords.length, renderLorryTable);
}


// --- DATA LOAD INIT ---
function initDataLoad() {
    onSnapshot(collection(db, "vendors"), (snap) => {
        allVendorsList = []; let dropHtml = '<option value="">Select Vendor...</option>';
        snap.forEach(docSnap => { let d = docSnap.data(); allVendorsList.push({ id: docSnap.id, ...d }); });
        allVendorsList.sort((a, b) => b.custom_id.localeCompare(a.custom_id));
        allVendorsList.forEach(d => { dropHtml += `<option value="${d.id}">${d.custom_id} - ${d.name}</option>`; });
        document.querySelectorAll('.vendor-dropdown').forEach(drop => drop.innerHTML = dropHtml); 
        renderVendorFilterButtons(); renderVendorsTable(); calculateDashboardWidgets();
    });

    onSnapshot(collection(db, "sites"), (snap) => {
        currentSitesList = []; let activeHtml = '<option value="">Select Site...</option>'; let allHtml = '<option value="">Select Site...</option>';
        snap.forEach(docSnap => {
            let d = docSnap.data(); d.id = docSnap.id; currentSitesList.push(d);
            let isOngoing = d.status === 'ONGOING';
            allHtml += `<option value="${docSnap.id}">${d.name}</option>`; if(isOngoing) activeHtml += `<option value="${docSnap.id}">${d.name}</option>`;
        });
        document.querySelectorAll('.active-site-dropdown').forEach(drop => drop.innerHTML = activeHtml); 
        document.querySelectorAll('.report-site-dropdown').forEach(drop => drop.innerHTML = allHtml);
        renderSitesTable();
    });

    onSnapshot(collection(db, "bills"), (snap) => {
        allBillsList = []; let totalDue = 0;
        snap.forEach(docSnap => { let d = docSnap.data(); allBillsList.push({ id: docSnap.id, ...d }); totalDue += (d.total_amount - d.paid_amount); });
        allBillsList.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
        document.getElementById('dash-due').innerText = totalDue.toLocaleString(undefined, {minimumFractionDigits: 2}); applyBillFilters(); calculateDashboardWidgets();
    });

    onSnapshot(collection(db, "payments"), (snap) => {
        allPaymentsList = []; let monthlyPaid = 0, pendingChequesTotal = 0; const currentMonth = new Date().toISOString().slice(0, 7);
        snap.forEach(docSnap => {
            let d = docSnap.data(); allPaymentsList.push({ id: docSnap.id, ...d });
            if(d.payment_date && d.payment_date.startsWith(currentMonth) && d.cheque_status !== 'RETURNED') monthlyPaid += d.total_amount;
            if(d.method.includes('CHEQUE') && d.cheque_status === 'PENDING') pendingChequesTotal += d.total_amount;
        });
        allPaymentsList.sort((a, b) => new Date(b.timestamp || b.payment_date) - new Date(a.timestamp || a.payment_date));
        document.getElementById('dash-paid').innerText = monthlyPaid.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('dash-cheques').innerText = pendingChequesTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
        renderPaymentsTable(); renderChequesTable(); calculateDashboardWidgets();
    });

    onSnapshot(collection(db, "lorry_cash"), (snap) => {
        allLorryRecords = []; snap.forEach(docSnap => { allLorryRecords.push({ id: docSnap.id, ...docSnap.data() }); });
        allLorryRecords.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        let currentBalance = 0;
        allLorryRecords.forEach(d => {
            if(d.type === 'ADVANCE' || d.type === 'OPENING_BAL') currentBalance += d.amount;
            if(d.type === 'EXPENSE') currentBalance -= d.amount;
            d.runningBalance = currentBalance;
        });
        
        const dashBal = document.getElementById('dash-lorry-bal'); dashBal.innerText = currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2});
        if(currentBalance < 0) dashBal.classList.add('text-danger'); else dashBal.classList.remove('text-danger');

        allLorryRecords.reverse(); 
        renderLorryTable();
    });
}

// --- NEW: DASHBOARD WIDGETS & MODAL BREAKDOWNS ---
function calculateDashboardWidgets() {
    if(allVendorsList.length === 0) return;
    dashboardStats = {}; 
    let totalDueAll = 0; let totalPaidAll = 0; let totalChequesAll = 0;
    const currentMonth = new Date().toISOString().slice(0, 7);

    allVendorsList.forEach(v => dashboardStats[v.id] = { name: v.name, due: 0, paid: 0, cheques: 0 });

    allBillsList.forEach(b => { let amtDue = b.total_amount - b.paid_amount; if(dashboardStats[b.vendor_id]) dashboardStats[b.vendor_id].due += amtDue; totalDueAll += amtDue; });
    allPaymentsList.forEach(p => {
        if(p.cheque_status !== 'RETURNED' && p.payment_date.startsWith(currentMonth)) { if(dashboardStats[p.vendor_id]) dashboardStats[p.vendor_id].paid += p.total_amount; totalPaidAll += p.total_amount; }
        if(p.method.includes('CHEQUE') && p.cheque_status === 'PENDING') { if(dashboardStats[p.vendor_id]) dashboardStats[p.vendor_id].cheques += p.total_amount; totalChequesAll += p.total_amount; }
    });

    document.getElementById('dash-due').innerText = totalDueAll.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('dash-paid').innerText = totalPaidAll.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('dash-cheques').innerText = totalChequesAll.toLocaleString(undefined, {minimumFractionDigits: 2});

    let vendorArr = Object.values(dashboardStats).filter(v => v.due > 0).sort((a, b) => b.due - a.due);
    let topVendorsHTML = ''; let maxDue = vendorArr.length > 0 ? vendorArr[0].due : 1; 

    vendorArr.slice(0, 5).forEach(v => {
        let percent = (v.due / maxDue) * 100;
        topVendorsHTML += `<div class="mb-3"><div class="d-flex justify-content-between mb-1"><span class="fw-bold" style="font-size: 13px;">${v.name}</span><span class="text-danger fw-bold" style="font-size: 13px;">Rs. ${v.due.toLocaleString()}</span></div><div class="progress" style="height: 6px;"><div class="progress-bar bg-danger" style="width: ${percent}%"></div></div></div>`;
    });
    if(vendorArr.length === 0) topVendorsHTML = '<div class="text-muted text-center pt-2">No outstanding dues!</div>';
    document.getElementById('widget-top-vendors').innerHTML = topVendorsHTML;

    let recentHTML = '';
    allPaymentsList.slice(0, 5).forEach(p => {
        let vName = allVendorsList.find(v => v.id === p.vendor_id)?.name || 'Unknown';
        recentHTML += `<li class="list-group-item px-3 py-2 d-flex justify-content-between align-items-center"><div><div class="fw-bold" style="font-size: 13px;">${vName}</div><small class="text-muted" style="font-size: 11px;">${p.payment_date} | ${p.method.replace('_', ' ')}</small></div><span class="text-success fw-bold">Rs. ${p.total_amount.toLocaleString()}</span></li>`;
    });
    if(allPaymentsList.length === 0) recentHTML = '<li class="list-group-item text-muted text-center">No payments made yet.</li>';
    document.getElementById('widget-recent-payments').innerHTML = recentHTML;
}

document.querySelectorAll('.clickable-card').forEach(card => {
    card.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        if (!action) return; // Prevent lorry card from opening modal
        
        let title = ''; let targetField = ''; let colorClass = ''; let headerColor = '';
        
        if(action === 'DUE') { title = "Outstanding Dues Breakdown"; targetField = 'due'; colorClass = 'text-danger'; headerColor = 'bg-danger'; }
        if(action === 'PAID') { title = `Payments Breakdown (${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })})`; targetField = 'paid'; colorClass = 'text-success'; headerColor = 'bg-success'; }
        if(action === 'CHEQUES') { title = "Unrealized Cheques Breakdown"; targetField = 'cheques'; colorClass = 'text-warning'; headerColor = 'bg-warning'; }

        document.getElementById('db-modal-title').innerText = title;
        document.getElementById('db-modal-header').className = `modal-header text-white ${headerColor}`;
        if(action === 'CHEQUES') document.getElementById('db-modal-header').classList.replace('text-white', 'text-dark'); 

        let html = '';
        let list = Object.values(dashboardStats).filter(v => v[targetField] > 0).sort((a, b) => b[targetField] - a[targetField]);
        
        list.forEach(v => { html += `<tr><td class="ps-4 fw-bold">${v.name}</td><td class="text-end pe-4 fw-bold ${colorClass}">Rs. ${v[targetField].toLocaleString()}</td></tr>`; });
        if(list.length === 0) html = `<tr><td colspan="2" class="text-center py-4 text-muted">No records found for this category.</td></tr>`;
        
        document.getElementById('db-modal-table').innerHTML = html;
        new bootstrap.Modal(document.getElementById('dashboardBreakdownModal')).show();
    });
});


// --- MODALS FORMS SUBMIT ---
document.getElementById('vendor-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const editId = document.getElementById('edit-vendor-id').value;
    const vendorData = { name: document.getElementById('v-name').value, contact: document.getElementById('v-contact').value, address: document.getElementById('v-address').value, acc_name: document.getElementById('v-acc-name').value, bank_name: document.getElementById('v-bank-name').value, bank_branch: document.getElementById('v-bank-branch').value, bank_acc: document.getElementById('v-acc-no').value };
    if(editId) { await updateDoc(doc(db, "vendors", editId), vendorData); alert("Vendor Updated!"); } 
    else { vendorData.custom_id = generateCustomID('VEN'); await setDoc(doc(collection(db, "vendors")), vendorData); alert("Vendor Added!"); }
    e.target.reset(); bootstrap.Modal.getInstance(document.getElementById('vendorModal')).hide();
});

document.getElementById('site-form').addEventListener('submit', async (e) => {
    e.preventDefault(); await setDoc(doc(collection(db, "sites")), { name: document.getElementById('s-name').value, status: 'ONGOING' });
    e.target.reset(); bootstrap.Modal.getInstance(document.getElementById('siteModal')).hide();
});

document.getElementById('bill-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const editId = document.getElementById('edit-bill-id').value; const vId = document.getElementById('b-vendor').value; const bNo = document.getElementById('b-number').value;
    if(!editId || (editId && allBillsList.find(b => b.id === editId).bill_number !== bNo)) { if(allBillsList.some(b => b.vendor_id === vId && b.bill_number.toLowerCase() === bNo.toLowerCase())) return alert("Error: This Bill Number already exists for this vendor!"); }
    const btn = document.getElementById('b-submit-btn'); const fileInput = document.getElementById('b-file'); let imageUrl = null;
    if(fileInput.files.length > 0) { btn.innerHTML = `Uploading...`; btn.disabled = true; try { imageUrl = await uploadToImgBB(fileInput.files[0]); } catch (err) { alert("Image Upload Failed!"); btn.innerHTML = `Save Bill`; btn.disabled = false; return; } }
    const type = document.getElementById('b-type').value; const total = parseFloat(document.getElementById('b-amount').value);
    const billData = { vendor_id: vId, site_id: document.getElementById('b-site').value, items_info: document.getElementById('b-items').value, bill_number: bNo, date: document.getElementById('b-date').value, total_amount: total };
    if (imageUrl) billData.attachment_url = imageUrl;
    if(editId) { billData.paid_amount = 0; billData.status = 'PENDING'; await updateDoc(doc(db, "bills", editId), billData); alert("Bill Updated!"); } 
    else { billData.paid_amount = type === 'CASH' ? total : 0; billData.status = type === 'CASH' ? 'SETTLED' : 'PENDING'; billData.created_at = new Date().toISOString(); await setDoc(doc(collection(db, "bills")), billData); alert("Bill Saved!"); }
    e.target.reset(); document.getElementById('b-date').value = new Date().toISOString().split('T')[0];
    btn.innerHTML = `Save Bill`; btn.disabled = false; bootstrap.Modal.getInstance(document.getElementById('billModal')).hide();
});

let currentFilteredBills = [];

function applyBillFilters() {
    const searchText = document.getElementById('search-bills').value.toLowerCase(); const statusFilter = document.getElementById('filter-status').value;
    currentFilteredBills = allBillsList.filter(b => {
        if(currentBillVendorFilter !== 'ALL' && b.vendor_id !== currentBillVendorFilter) return false;
        const matchesSearch = b.bill_number.toLowerCase().includes(searchText) || b.total_amount.toString().includes(searchText);
        let matchesStatus = true;
        if (statusFilter === 'PENDING') matchesStatus = (b.status === 'PENDING' || b.status === 'PARTIAL');
        if (statusFilter === 'SETTLED') matchesStatus = (b.status === 'SETTLED');
        return matchesSearch && matchesStatus;
    });
    
    renderBillsTable();
}

function renderBillsTable() {
    const bTable = document.getElementById('b-table'); bTable.innerHTML = '';
    const state = paginationStates.bills;
    let dataToRender = currentFilteredBills;
    
    if (state.pageSize !== 'ALL') {
        const start = (state.currentPage - 1) * state.pageSize;
        dataToRender = currentFilteredBills.slice(start, start + state.pageSize);
    }
    
    dataToRender.forEach(d => {
        let statusColor = d.status === 'SETTLED' ? 'success' : (d.status === 'PARTIAL' ? 'info' : 'warning');
        let imgBtn = d.attachment_url ? `<a href="${d.attachment_url}" target="_blank" class="text-primary"><i class="bi bi-image fs-5"></i></a>` : '-';
        let editBtn = (d.paid_amount === 0) ? `<button class="btn btn-sm btn-outline-primary edit-bill-btn me-1" data-id="${d.id}"><i class="bi bi-pencil"></i></button>` : '';
        bTable.innerHTML += `<tr><td>${d.date}</td><td class="fw-bold">${d.bill_number}</td><td><span class="badge bg-light text-dark border">${d.items_info || '-'}</span></td>
            <td>Rs. ${d.total_amount.toLocaleString()}</td><td class="text-success">Rs. ${d.paid_amount.toLocaleString()}</td><td><span class="badge bg-${statusColor}">${d.status}</span></td>
            <td>${imgBtn}</td><td>${editBtn}<button class="btn btn-sm btn-outline-danger del-bill-btn" data-id="${d.id}" data-paid="${d.paid_amount}"><i class="bi bi-trash"></i></button></td></tr>`;
    });

    document.querySelectorAll('.edit-bill-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const bData = allBillsList.find(b => b.id === e.currentTarget.dataset.id); document.getElementById('edit-bill-id').value = bData.id;
        ['vendor', 'site', 'items', 'number', 'date', 'amount'].forEach(f => { let domId = `b-${f}`; let dataKey = f === 'vendor' ? 'vendor_id' : (f === 'site' ? 'site_id' : (f === 'items' ? 'items_info' : (f === 'number' ? 'bill_number' : (f === 'amount' ? 'total_amount' : f)))); document.getElementById(domId).value = bData[dataKey]; });
        document.getElementById('b-type').value = 'CREDIT'; document.getElementById('bill-modal-title').innerText = "Edit Bill Details"; new bootstrap.Modal(document.getElementById('billModal')).show();
    }));
    document.querySelectorAll('.del-bill-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        if(Number(e.currentTarget.dataset.paid) > 0) return alert("Cannot delete! Payments are attached. Reverse payment first.");
        if(confirm("Delete this bill forever?")) await deleteDoc(doc(db, "bills", e.currentTarget.dataset.id));
    }));
    
    renderPagination('bills', currentFilteredBills.length, renderBillsTable);
}

document.getElementById('search-bills').addEventListener('input', () => { paginationStates.bills.currentPage = 1; applyBillFilters(); });
document.getElementById('filter-status').addEventListener('change', () => { paginationStates.bills.currentPage = 1; applyBillFilters(); });

// --- PAYMENT MODAL LOGIC ---
function calcTotalForPayments() { let tot = 0; document.querySelectorAll('.pay-input').forEach(i => tot += Number(i.value || 0)); document.getElementById('p-total-calc').innerText = tot.toLocaleString(); }
document.getElementById('p-bills-table').addEventListener('change', (e) => { if (e.target.classList.contains('bill-select-cb')) { document.getElementById(`pay-input-${e.target.dataset.id}`).value = e.target.checked ? e.target.dataset.due : ''; calcTotalForPayments(); }});
document.getElementById('p-bills-table').addEventListener('input', (e) => { if (e.target.classList.contains('pay-input')) { const cb = document.querySelector(`.bill-select-cb[data-id="${e.target.dataset.id}"]`); if(cb) cb.checked = (Number(e.target.value) === Number(cb.dataset.due)); calcTotalForPayments(); }});
document.getElementById('p-method').addEventListener('change', (e) => { const isCheque = e.target.value.includes('CHEQUE'); document.getElementById('cheque-box').style.display = isCheque ? 'block' : 'none'; document.getElementById('p-cheque-no').required = isCheque; document.getElementById('p-cheque-date').required = isCheque; });

document.getElementById('p-vendor').addEventListener('change', (e) => {
    const vId = e.target.value; const pbTable = document.getElementById('p-bills-table');
    if(!vId) { document.getElementById('pending-bills-container').style.display = 'none'; document.getElementById('payment-form').style.display = 'none'; return; }
    pbTable.innerHTML = ''; const pendingBills = allBillsList.filter(b => b.vendor_id === vId && b.status !== 'SETTLED');
    if(pendingBills.length === 0) { pbTable.innerHTML = '<tr><td colspan="4" class="text-center text-danger">No pending bills for this vendor.</td></tr>'; } 
    else { pendingBills.forEach(d => { let due = d.total_amount - d.paid_amount; pbTable.innerHTML += `<tr><td class="text-center align-middle"><input type="checkbox" class="form-check-input bill-select-cb" style="width: 20px; height: 20px; cursor: pointer;" data-id="${d.id}" data-due="${due}"></td><td class="fw-bold align-middle">${d.bill_number} <br><span class="badge bg-secondary">${d.items_info || '-'}</span></td><td class="text-danger fw-bold align-middle">Rs. ${due}</td><td class="align-middle"><input type="number" class="form-control pay-input border-primary" id="pay-input-${d.id}" data-id="${d.id}" max="${due}" min="0" placeholder="0"></td></tr>`; }); }
    document.getElementById('pending-bills-container').style.display = 'block'; document.getElementById('payment-form').style.display = 'flex'; calcTotalForPayments(); 
});

document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault(); let allocations = []; let totalPayment = 0;
    document.querySelectorAll('.pay-input').forEach(input => { const amt = Number(input.value); if(amt > 0) { allocations.push({ bill_id: input.dataset.id, amount: amt }); totalPayment += amt; }});
    if(totalPayment <= 0) return alert("Select or enter payment amount!");
    const btn = document.getElementById('p-submit-btn'); const fileInput = document.getElementById('p-file'); let imageUrl = null;
    if(fileInput.files.length > 0) { btn.innerHTML = `Uploading...`; btn.disabled = true; try { imageUrl = await uploadToImgBB(fileInput.files[0]); } catch (err) { alert("Slip Upload Failed!"); btn.innerHTML = `Confirm`; btn.disabled = false; return; } }
    const batch = writeBatch(db);
    allocations.forEach(alloc => { const bill = allBillsList.find(b => b.id === alloc.bill_id); const newPaid = bill.paid_amount + alloc.amount; batch.update(doc(db, "bills", alloc.bill_id), { paid_amount: newPaid, status: newPaid >= bill.total_amount ? "SETTLED" : "PARTIAL" }); });
    const isCheque = document.getElementById('p-method').value.includes('CHEQUE');
    batch.set(doc(collection(db, "payments")), { payment_id: generateCustomID('PAY'), vendor_id: document.getElementById('p-vendor').value, payment_date: document.getElementById('p-date').value, total_amount: totalPayment, method: document.getElementById('p-method').value, cheque_number: isCheque ? document.getElementById('p-cheque-no').value : null, cheque_date: isCheque ? document.getElementById('p-cheque-date').value : null, cheque_status: isCheque ? 'PENDING' : null, attachment_url: imageUrl, allocations: allocations, timestamp: new Date().toISOString() });
    await batch.commit().then(() => { alert("Payment Saved!"); document.getElementById('p-vendor').value = ""; document.getElementById('payment-form').reset(); document.getElementById('p-total-calc').innerText = "0"; bootstrap.Modal.getInstance(document.getElementById('paymentModal')).hide(); }).catch(err => alert("Error: " + err.message)).finally(() => { btn.innerHTML = `Confirm`; btn.disabled = false; });
});

// --- CHEQUES LOGIC ---
let currentChequesList = [];
function renderChequesTable() {
    const cTable = document.getElementById('cheques-table'); cTable.innerHTML = '';
    currentChequesList = allPaymentsList.filter(p => p.method.includes('CHEQUE') && p.cheque_status === 'PENDING');
    
    if(currentChequesList.length === 0) { cTable.innerHTML = '<tr><td colspan="6" class="text-center text-success">No pending cheques.</td></tr>'; document.getElementById('pg-cheques').innerHTML = ''; return; }
    
    const state = paginationStates.cheques;
    let dataToRender = currentChequesList;
    if (state.pageSize !== 'ALL') {
        const start = (state.currentPage - 1) * state.pageSize;
        dataToRender = currentChequesList.slice(start, start + state.pageSize);
    }
    
    dataToRender.forEach(chk => {
        let imgBtn = chk.attachment_url ? `<a href="${chk.attachment_url}" target="_blank" class="text-primary"><i class="bi bi-image fs-5"></i></a>` : '-';
        cTable.innerHTML += `<tr><td>${chk.cheque_date || chk.payment_date}</td><td class="fw-bold text-primary">${chk.cheque_number}</td><td>${chk.method.replace('_CHEQUE', '')} Bank</td><td class="fw-bold text-danger">Rs. ${chk.total_amount.toLocaleString()}</td><td>${imgBtn}</td>
            <td><button class="btn btn-sm btn-success realize-btn mb-1" data-id="${chk.id}">Realized <i class="bi bi-check"></i></button><button class="btn btn-sm btn-danger return-btn mb-1" data-id="${chk.id}">Returned <i class="bi bi-x"></i></button></td></tr>`;
    });
    
    document.querySelectorAll('.realize-btn').forEach(btn => btn.addEventListener('click', async (e) => { if(confirm("Mark cheque as cleared?")) await updateDoc(doc(db, "payments", e.currentTarget.dataset.id), { cheque_status: "REALIZED" }); }));
    document.querySelectorAll('.return-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        if(confirm("Reverse this payment and mark cheque as returned?")) {
            const payId = e.currentTarget.dataset.id; const payDoc = allPaymentsList.find(p => p.id === payId); const batch = writeBatch(db);
            payDoc.allocations.forEach(alloc => { const bill = allBillsList.find(b => b.id === alloc.bill_id); if(bill) { let newPaid = bill.paid_amount - alloc.amount; batch.update(doc(db, "bills", bill.id), { paid_amount: newPaid, status: newPaid <= 0 ? 'PENDING' : 'PARTIAL' }); } });
            batch.update(doc(db, "payments", payId), { cheque_status: "RETURNED" }); await batch.commit(); alert("Cheque returned & bills reverted.");
        }
    }));
    
    renderPagination('cheques', currentChequesList.length, renderChequesTable);
}

// --- LORRY FORM SUBMIT ---
document.getElementById('lorry-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('l-submit-btn'); const fileInput = document.getElementById('l-file'); const type = document.getElementById('l-type').value;
    let imageUrl = null; if(fileInput.files.length > 0) { btn.innerHTML = `Uploading...`; btn.disabled = true; try { imageUrl = await uploadToImgBB(fileInput.files[0]); } catch (err) { alert("Image Upload Failed!"); btn.innerHTML = `Save Record`; btn.disabled = false; return; } }
    await setDoc(doc(collection(db, "lorry_cash")), { type: type, date: document.getElementById('l-date').value, description: document.getElementById('l-desc').value, amount: parseFloat(document.getElementById('l-amount').value), attachment_url: imageUrl, timestamp: new Date().toISOString() });
    alert("Record Saved!"); e.target.reset(); document.getElementById('l-date').value = new Date().toISOString().split('T')[0]; btn.innerHTML = `Save Record`; btn.disabled = false;
});

// --- REPORTS ---
document.getElementById('report-type').addEventListener('change', (e) => {
    const isVendor = e.target.value === 'VENDOR';
    document.getElementById('report-site-div').style.display = isVendor ? 'none' : 'block'; document.getElementById('report-vendor-div').style.display = isVendor ? 'block' : 'none';
    document.getElementById('report-site-results').style.display = 'none'; document.getElementById('report-vendor-results').style.display = 'none';
});

document.getElementById('generate-rep-btn').addEventListener('click', () => {
    const repType = document.getElementById('report-type').value; const startDt = document.getElementById('rep-start').value; const endDt = document.getElementById('rep-end').value;
    if(repType === 'SITE') {
        const sId = document.getElementById('report-site').value; if(!sId) return alert("Select a site!");
        document.getElementById('report-site-results').style.display = 'block'; let totalCost = 0; const rTable = document.getElementById('report-site-table'); rTable.innerHTML = '';
        allBillsList.filter(b => b.site_id === sId).forEach(bill => { if(startDt && bill.date < startDt) return; if(endDt && bill.date > endDt) return; totalCost += bill.total_amount; rTable.innerHTML += `<tr><td>${bill.date}</td><td>${bill.bill_number}</td><td>${bill.items_info || '-'}</td><td>Rs. ${bill.total_amount.toLocaleString()}</td></tr>`; });
        document.getElementById('rep-tot').innerText = totalCost.toLocaleString(undefined, {minimumFractionDigits: 2});
    } else {
        const vId = document.getElementById('report-vendor').value; if(!vId) return alert("Select a vendor!");
        document.getElementById('report-vendor-results').style.display = 'block'; let ledgerData = []; let bfBalance = 0;
        allBillsList.filter(b => b.vendor_id === vId).forEach(b => {
            if(startDt && b.date < startDt) { bfBalance += b.total_amount; return; } if(endDt && b.date > endDt) return;
            let img = b.attachment_url ? `<a href="${b.attachment_url}" target="_blank"><i class="bi bi-image"></i></a>` : '-'; ledgerData.push({ date: b.date, ref: b.bill_number, desc: `Bill - ${b.items_info || ''}`, credit_bill: b.total_amount, debit_pay: 0, attach: img });
        });
        allPaymentsList.filter(p => p.vendor_id === vId && p.cheque_status !== 'RETURNED').forEach(p => {
            if(startDt && p.payment_date < startDt) { bfBalance -= p.total_amount; return; } if(endDt && p.payment_date > endDt) return;
            let img = p.attachment_url ? `<a href="${p.attachment_url}" target="_blank"><i class="bi bi-image"></i></a>` : '-'; ledgerData.push({ date: p.payment_date, ref: p.payment_id, desc: `Payment - ${p.method.replace('_', ' ')}`, credit_bill: 0, debit_pay: p.total_amount, attach: img });
        });
        ledgerData.sort((a, b) => new Date(a.date) - new Date(b.date)); const lTable = document.getElementById('report-vendor-table'); lTable.innerHTML = ''; let runningBalance = bfBalance;
        if(startDt) { lTable.innerHTML += `<tr class="table-warning"><td colspan="3" class="fw-bold">Brought Forward (B/F) Balance</td><td>-</td><td>-</td><td class="fw-bold text-danger">${bfBalance.toLocaleString()}</td><td>-</td></tr>`; }
        ledgerData.forEach(item => { runningBalance += (item.credit_bill - item.debit_pay); lTable.innerHTML += `<tr><td>${item.date}</td><td>${item.ref}</td><td>${item.desc}</td><td class="ledger-credit">${item.credit_bill > 0 ? item.credit_bill.toLocaleString() : '-'}</td><td class="ledger-debit">${item.debit_pay > 0 ? item.debit_pay.toLocaleString() : '-'}</td><td class="fw-bold">${runningBalance.toLocaleString()}</td><td class="text-center">${item.attach}</td></tr>`; });
        document.getElementById('ledger-balance').innerText = runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2});
    }
});

document.getElementById('export-btn').addEventListener('click', () => {
    const isVendor = document.getElementById('report-type').value === 'VENDOR'; const tableId = isVendor ? "#report-table-vendor-export" : "#report-table-site-export";
    let csv = []; const rows = document.querySelectorAll(`${tableId} tr`); if(rows.length === 0) return alert("No data to export!");
    for (let i = 0; i < rows.length; i++) { let row = [], cols = rows[i].querySelectorAll("td, th"); let limit = isVendor ? cols.length - 1 : cols.length; for (let j = 0; j < limit; j++) row.push(cols[j].innerText.replace(/,/g, '')); csv.push(row.join(",")); }
    const a = document.createElement("a"); a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv.join("\n")); a.target = '_blank'; a.download = `Niwasa_${isVendor ? 'Vendor_Ledger' : 'Site_Report'}.csv`; a.click();
});
