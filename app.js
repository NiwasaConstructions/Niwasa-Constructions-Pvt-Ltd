import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore, collection, setDoc, doc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

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
let allVendorsList = [];
let allBillsList = []; 
let allPaymentsList = [];

const generateCustomID = (prefix) => `${prefix}-${Date.now().toString().slice(-4)}${Math.floor(1000 + Math.random() * 9000)}`;

async function uploadToImgBB(file) {
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
    const data = await res.json();
    if(data.success) return data.data.url; throw new Error("Upload failed");
}

// --- AUTH & NAV ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('b-date').value = today; document.getElementById('p-date').value = today;
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

// --- DATA LOAD ---
function initDataLoad() {
    onSnapshot(collection(db, "vendors"), (snap) => {
        allVendorsList = [];
        const vTable = document.getElementById('v-table'); const vDrops = document.querySelectorAll('.vendor-dropdown');
        vTable.innerHTML = ''; let dropHtml = '<option value="">Select Vendor...</option>';
        snap.forEach(docSnap => {
            let d = docSnap.data(); allVendorsList.push({ id: docSnap.id, ...d });
            let bankInfo = d.bank_name ? `<strong>${d.bank_name}</strong> ${d.bank_branch ? `(${d.bank_branch})` : ''}<br><small>${d.acc_name || ''} - ${d.bank_acc || ''}</small>` : '-';
            vTable.innerHTML += `<tr><td><span class="badge bg-secondary">${d.custom_id}</span></td><td class="fw-bold">${d.name}</td><td>${d.contact}<br><small class="text-muted">${d.address || ''}</small></td><td>${bankInfo}</td>
            <td><button class="btn btn-sm btn-outline-primary edit-vendor-btn" data-id="${docSnap.id}"><i class="bi bi-pencil"></i></button></td></tr>`;
            dropHtml += `<option value="${docSnap.id}">${d.custom_id} - ${d.name}</option>`;
        });
        vDrops.forEach(drop => drop.innerHTML = dropHtml);
        
        document.querySelectorAll('.edit-vendor-btn').forEach(btn => btn.addEventListener('click', (e) => {
            const vData = allVendorsList.find(v => v.id === e.currentTarget.dataset.id);
            document.getElementById('edit-vendor-id').value = vData.id;
            ['name', 'contact', 'address', 'acc_name', 'bank_name', 'bank_branch', 'acc_no'].forEach(f => {
                let domId = f === 'acc_no' ? 'v-acc-no' : `v-${f.replace('_', '-')}`;
                let dataKey = f === 'acc_no' ? 'bank_acc' : f;
                document.getElementById(domId).value = vData[dataKey] || '';
            });
            document.getElementById('vendor-modal-title').innerText = "Edit Vendor Details";
            new bootstrap.Modal(document.getElementById('vendorModal')).show();
        }));
    });

    onSnapshot(collection(db, "sites"), (snap) => {
        const sTable = document.getElementById('s-table'); const activeDrops = document.querySelectorAll('.active-site-dropdown'); const allDrops = document.querySelectorAll('.report-site-dropdown'); 
        sTable.innerHTML = ''; let activeHtml = '<option value="">Select Site...</option>'; let allHtml = '<option value="">Select Site...</option>';
        snap.forEach(docSnap => {
            let d = docSnap.data(); let isOngoing = d.status === 'ONGOING';
            sTable.innerHTML += `<tr><td class="fw-bold"><i class="bi bi-geo-alt text-danger me-2"></i> ${d.name}</td>
                <td><span class="badge bg-${isOngoing ? 'primary' : 'secondary'}">${d.status}</span></td>
                <td><button class="btn btn-sm ${isOngoing ? 'btn-outline-success' : 'btn-secondary'} toggle-site-btn" data-id="${docSnap.id}" data-status="${d.status}" ${!isOngoing ? 'disabled' : ''}>${isOngoing ? 'Mark Completed' : 'Completed'}</button></td></tr>`;
            allHtml += `<option value="${docSnap.id}">${d.name}</option>`;
            if(isOngoing) activeHtml += `<option value="${docSnap.id}">${d.name}</option>`;
        });
        activeDrops.forEach(drop => drop.innerHTML = activeHtml); allDrops.forEach(drop => drop.innerHTML = allHtml);
        document.querySelectorAll('.toggle-site-btn').forEach(btn => btn.addEventListener('click', async (e) => {
            if(confirm("Mark this site as Completed?")) await updateDoc(doc(db, "sites", e.currentTarget.dataset.id), { status: "COMPLETED" });
        }));
    });

    onSnapshot(collection(db, "bills"), (snap) => {
        allBillsList = []; let totalDue = 0;
        snap.forEach(docSnap => { let d = docSnap.data(); allBillsList.push({ id: docSnap.id, ...d }); totalDue += (d.total_amount - d.paid_amount); });
        document.getElementById('dash-due').innerText = totalDue.toLocaleString(undefined, {minimumFractionDigits: 2}); applyBillFilters(); 
    });

    onSnapshot(collection(db, "payments"), (snap) => {
        allPaymentsList = []; let monthlyPaid = 0, pendingChequesTotal = 0; const currentMonth = new Date().toISOString().slice(0, 7);
        const pTable = document.getElementById('payment-history-table'); pTable.innerHTML = '';
        snap.forEach(docSnap => {
            let d = docSnap.data(); allPaymentsList.push({ id: docSnap.id, ...d });
            if(d.payment_date && d.payment_date.startsWith(currentMonth) && d.cheque_status !== 'RETURNED') monthlyPaid += d.total_amount;
            if(d.method.includes('CHEQUE') && d.cheque_status === 'PENDING') pendingChequesTotal += d.total_amount;
            let imgBtn = d.attachment_url ? `<a href="${d.attachment_url}" target="_blank" class="text-primary"><i class="bi bi-image fs-5"></i></a>` : '-';
            let statusBadge = d.cheque_status === 'PENDING' ? '<span class="badge bg-warning">Pending</span>' : (d.cheque_status === 'RETURNED' ? '<span class="badge bg-danger">Returned</span>' : '<span class="badge bg-success">Cleared</span>');
            pTable.innerHTML += `<tr><td>${d.payment_date}</td><td class="fw-bold">${d.payment_id}</td><td>${d.method.replace('_', ' ')} ${d.cheque_number ? `(${d.cheque_number})` : ''}</td>
                <td class="text-success fw-bold">Rs. ${d.total_amount}</td><td>${statusBadge}</td><td>${imgBtn}</td></tr>`;
        });
        document.getElementById('dash-paid').innerText = monthlyPaid.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('dash-cheques').innerText = pendingChequesTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
        renderChequesTable();
    });
}

// --- MODALS FORMS SUBMIT ---
document.getElementById('vendor-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const editId = document.getElementById('edit-vendor-id').value;
    const vendorData = {
        name: document.getElementById('v-name').value, contact: document.getElementById('v-contact').value, address: document.getElementById('v-address').value, 
        acc_name: document.getElementById('v-acc-name').value, bank_name: document.getElementById('v-bank-name').value, bank_branch: document.getElementById('v-bank-branch').value, bank_acc: document.getElementById('v-acc-no').value
    };
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
    if(!editId || (editId && allBillsList.find(b => b.id === editId).bill_number !== bNo)) {
        if(allBillsList.some(b => b.vendor_id === vId && b.bill_number.toLowerCase() === bNo.toLowerCase())) return alert("Error: This Bill Number already exists for this vendor!");
    }
    const btn = document.getElementById('b-submit-btn'); const fileInput = document.getElementById('b-file'); let imageUrl = null;
    if(fileInput.files.length > 0) {
        btn.innerHTML = `Uploading...`; btn.disabled = true;
        try { imageUrl = await uploadToImgBB(fileInput.files[0]); } catch (err) { alert("Image Upload Failed!"); btn.innerHTML = `Save Bill`; btn.disabled = false; return; }
    }
    const type = document.getElementById('b-type').value; const total = parseFloat(document.getElementById('b-amount').value);
    const billData = { vendor_id: vId, site_id: document.getElementById('b-site').value, items_info: document.getElementById('b-items').value, bill_number: bNo, date: document.getElementById('b-date').value, total_amount: total };
    if (imageUrl) billData.attachment_url = imageUrl;

    if(editId) {
        billData.paid_amount = 0; billData.status = 'PENDING';
        await updateDoc(doc(db, "bills", editId), billData); alert("Bill Updated!");
    } else {
        billData.paid_amount = type === 'CASH' ? total : 0; billData.status = type === 'CASH' ? 'SETTLED' : 'PENDING'; billData.created_at = new Date().toISOString();
        await setDoc(doc(collection(db, "bills")), billData); alert("Bill Saved!");
    }
    e.target.reset(); document.getElementById('b-date').value = new Date().toISOString().split('T')[0];
    btn.innerHTML = `Save Bill`; btn.disabled = false; bootstrap.Modal.getInstance(document.getElementById('billModal')).hide();
});

function applyBillFilters() {
    const searchText = document.getElementById('search-bills').value.toLowerCase(); const statusFilter = document.getElementById('filter-status').value;
    const filtered = allBillsList.filter(b => {
        const matchesSearch = b.bill_number.toLowerCase().includes(searchText) || b.total_amount.toString().includes(searchText);
        let matchesStatus = true;
        if (statusFilter === 'PENDING') matchesStatus = (b.status === 'PENDING' || b.status === 'PARTIAL');
        if (statusFilter === 'SETTLED') matchesStatus = (b.status === 'SETTLED');
        return matchesSearch && matchesStatus;
    });
    
    const bTable = document.getElementById('b-table'); bTable.innerHTML = '';
    filtered.forEach(d => {
        let statusColor = d.status === 'SETTLED' ? 'success' : (d.status === 'PARTIAL' ? 'info' : 'warning');
        let imgBtn = d.attachment_url ? `<a href="${d.attachment_url}" target="_blank" class="text-primary"><i class="bi bi-image fs-5"></i></a>` : '-';
        let editBtn = (d.paid_amount === 0) ? `<button class="btn btn-sm btn-outline-primary edit-bill-btn me-1" data-id="${d.id}"><i class="bi bi-pencil"></i></button>` : '';
        bTable.innerHTML += `<tr>
            <td>${d.date}</td><td class="fw-bold">${d.bill_number}</td><td><span class="badge bg-light text-dark border">${d.items_info || '-'}</span></td>
            <td>Rs. ${d.total_amount}</td><td class="text-success">Rs. ${d.paid_amount}</td><td><span class="badge bg-${statusColor}">${d.status}</span></td>
            <td>${imgBtn}</td><td>${editBtn}<button class="btn btn-sm btn-outline-danger del-bill-btn" data-id="${d.id}" data-paid="${d.paid_amount}"><i class="bi bi-trash"></i></button></td>
        </tr>`;
    });

    document.querySelectorAll('.edit-bill-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const bData = allBillsList.find(b => b.id === e.currentTarget.dataset.id);
        document.getElementById('edit-bill-id').value = bData.id;
        ['vendor', 'site', 'items', 'number', 'date', 'amount'].forEach(f => {
            let domId = `b-${f}`; let dataKey = f === 'vendor' ? 'vendor_id' : (f === 'site' ? 'site_id' : (f === 'items' ? 'items_info' : (f === 'number' ? 'bill_number' : (f === 'amount' ? 'total_amount' : f))));
            document.getElementById(domId).value = bData[dataKey];
        });
        document.getElementById('b-type').value = 'CREDIT';
        document.getElementById('bill-modal-title').innerText = "Edit Bill Details";
        new bootstrap.Modal(document.getElementById('billModal')).show();
    }));

    document.querySelectorAll('.del-bill-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        if(Number(e.currentTarget.dataset.paid) > 0) return alert("Cannot delete! Payments are attached. Reverse payment first.");
        if(confirm("Delete this bill forever?")) await deleteDoc(doc(db, "bills", e.currentTarget.dataset.id));
    }));
}
document.getElementById('search-bills').addEventListener('input', applyBillFilters);
document.getElementById('filter-status').addEventListener('change', applyBillFilters);


// --- PAYMENT MODAL LOGIC (100% WORKING CHECKBOXES) ---

function calcTotalForPayments() {
    let tot = 0; 
    document.querySelectorAll('.pay-input').forEach(i => tot += Number(i.value || 0));
    document.getElementById('p-total-calc').innerText = tot.toLocaleString();
}

// Global Event Listeners for Dynamic Table Elements (Event Delegation)
document.getElementById('p-bills-table').addEventListener('change', (e) => {
    if (e.target.classList.contains('bill-select-cb')) {
        const inputField = document.getElementById(`pay-input-${e.target.dataset.id}`);
        inputField.value = e.target.checked ? e.target.dataset.due : '';
        calcTotalForPayments();
    }
});

document.getElementById('p-bills-table').addEventListener('input', (e) => {
    if (e.target.classList.contains('pay-input')) {
        const cb = document.querySelector(`.bill-select-cb[data-id="${e.target.dataset.id}"]`);
        if(cb) cb.checked = (Number(e.target.value) === Number(cb.dataset.due));
        calcTotalForPayments();
    }
});

document.getElementById('p-method').addEventListener('change', (e) => {
    const isCheque = e.target.value.includes('CHEQUE');
    document.getElementById('cheque-box').style.display = isCheque ? 'block' : 'none';
    document.getElementById('p-cheque-no').required = isCheque; document.getElementById('p-cheque-date').required = isCheque;
});

// Load Bills when Vendor is selected
document.getElementById('p-vendor').addEventListener('change', (e) => {
    const vId = e.target.value; const pbTable = document.getElementById('p-bills-table');
    if(!vId) { document.getElementById('pending-bills-container').style.display = 'none'; document.getElementById('payment-form').style.display = 'none'; return; }
    
    pbTable.innerHTML = '';
    const pendingBills = allBillsList.filter(b => b.vendor_id === vId && b.status !== 'SETTLED');
    
    if(pendingBills.length === 0) { 
        pbTable.innerHTML = '<tr><td colspan="4" class="text-center text-danger">No pending bills for this vendor.</td></tr>'; 
    } else {
        pendingBills.forEach(d => {
            let due = d.total_amount - d.paid_amount;
            pbTable.innerHTML += `<tr>
                <td class="text-center align-middle"><input type="checkbox" class="form-check-input bill-select-cb" style="width: 20px; height: 20px; cursor: pointer;" data-id="${d.id}" data-due="${due}"></td>
                <td class="fw-bold align-middle">${d.bill_number} <br><span class="badge bg-secondary">${d.items_info || '-'}</span></td>
                <td class="text-danger fw-bold align-middle">Rs. ${due}</td>
                <td class="align-middle"><input type="number" class="form-control pay-input border-primary" id="pay-input-${d.id}" data-id="${d.id}" max="${due}" min="0" placeholder="0"></td>
            </tr>`;
        });
    }
    
    document.getElementById('pending-bills-container').style.display = 'block'; 
    document.getElementById('payment-form').style.display = 'flex';
    calcTotalForPayments(); // Reset total to 0 when table loads
});

document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let allocations = []; let totalPayment = 0;
    document.querySelectorAll('.pay-input').forEach(input => {
        const amt = Number(input.value); if(amt > 0) { allocations.push({ bill_id: input.dataset.id, amount: amt }); totalPayment += amt; }
    });
    if(totalPayment <= 0) return alert("Select or enter payment amount!");

    const btn = document.getElementById('p-submit-btn'); const fileInput = document.getElementById('p-file'); let imageUrl = null;
    if(fileInput.files.length > 0) {
        btn.innerHTML = `Uploading...`; btn.disabled = true;
        try { imageUrl = await uploadToImgBB(fileInput.files[0]); } catch (err) { alert("Slip Upload Failed!"); btn.innerHTML = `Confirm`; btn.disabled = false; return; }
    }

    const batch = writeBatch(db);
    allocations.forEach(alloc => {
        const bill = allBillsList.find(b => b.id === alloc.bill_id); const newPaid = bill.paid_amount + alloc.amount;
        batch.update(doc(db, "bills", alloc.bill_id), { paid_amount: newPaid, status: newPaid >= bill.total_amount ? "SETTLED" : "PARTIAL" });
    });

    const isCheque = document.getElementById('p-method').value.includes('CHEQUE');
    batch.set(doc(collection(db, "payments")), {
        payment_id: generateCustomID('PAY'), vendor_id: document.getElementById('p-vendor').value, payment_date: document.getElementById('p-date').value, 
        total_amount: totalPayment, method: document.getElementById('p-method').value, cheque_number: isCheque ? document.getElementById('p-cheque-no').value : null,
        cheque_date: isCheque ? document.getElementById('p-cheque-date').value : null, cheque_status: isCheque ? 'PENDING' : null,
        attachment_url: imageUrl, allocations: allocations, timestamp: new Date().toISOString()
    });

    await batch.commit().then(() => {
        alert("Payment Saved!"); document.getElementById('p-vendor').value = ""; document.getElementById('payment-form').reset();
        document.getElementById('p-total-calc').innerText = "0"; bootstrap.Modal.getInstance(document.getElementById('paymentModal')).hide();
    }).catch(err => alert("Error: " + err.message)).finally(() => { btn.innerHTML = `Confirm`; btn.disabled = false; });
});

// --- CHEQUES LOGIC ---
function renderChequesTable() {
    const cTable = document.getElementById('cheques-table'); cTable.innerHTML = '';
    const pendingCheques = allPaymentsList.filter(p => p.method.includes('CHEQUE') && p.cheque_status === 'PENDING');
    if(pendingCheques.length === 0) { cTable.innerHTML = '<tr><td colspan="6" class="text-center text-success">No pending cheques.</td></tr>'; return; }
    pendingCheques.forEach(chk => {
        let imgBtn = chk.attachment_url ? `<a href="${chk.attachment_url}" target="_blank" class="text-primary"><i class="bi bi-image fs-5"></i></a>` : '-';
        cTable.innerHTML += `<tr>
            <td>${chk.cheque_date || chk.payment_date}</td><td class="fw-bold text-primary">${chk.cheque_number}</td>
            <td>${chk.method.replace('_CHEQUE', '')} Bank</td><td class="fw-bold text-danger">Rs. ${chk.total_amount}</td><td>${imgBtn}</td>
            <td>
                <button class="btn btn-sm btn-success realize-btn mb-1" data-id="${chk.id}">Realized <i class="bi bi-check"></i></button>
                <button class="btn btn-sm btn-danger return-btn mb-1" data-id="${chk.id}">Returned <i class="bi bi-x"></i></button>
            </td>
        </tr>`;
    });
    document.querySelectorAll('.realize-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        if(confirm("Mark cheque as cleared?")) await updateDoc(doc(db, "payments", e.currentTarget.dataset.id), { cheque_status: "REALIZED" });
    }));
    document.querySelectorAll('.return-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        if(confirm("Reverse this payment and mark cheque as returned?")) {
            const payId = e.currentTarget.dataset.id; const payDoc = allPaymentsList.find(p => p.id === payId); const batch = writeBatch(db);
            payDoc.allocations.forEach(alloc => {
                const bill = allBillsList.find(b => b.id === alloc.bill_id);
                if(bill) { let newPaid = bill.paid_amount - alloc.amount; batch.update(doc(db, "bills", bill.id), { paid_amount: newPaid, status: newPaid <= 0 ? 'PENDING' : 'PARTIAL' }); }
            });
            batch.update(doc(db, "payments", payId), { cheque_status: "RETURNED" }); await batch.commit(); alert("Cheque returned & bills reverted.");
        }
    }));
}

// --- REPORTS ---
document.getElementById('report-type').addEventListener('change', (e) => {
    const isVendor = e.target.value === 'VENDOR';
    document.getElementById('report-site-div').style.display = isVendor ? 'none' : 'block'; document.getElementById('report-vendor-div').style.display = isVendor ? 'block' : 'none';
    document.getElementById('report-site-results').style.display = 'none'; document.getElementById('report-vendor-results').style.display = 'none';
});

document.getElementById('generate-rep-btn').addEventListener('click', () => {
    const repType = document.getElementById('report-type').value;
    const startDt = document.getElementById('rep-start').value; const endDt = document.getElementById('rep-end').value;
    
    if(repType === 'SITE') {
        const sId = document.getElementById('report-site').value; if(!sId) return alert("Select a site!");
        document.getElementById('report-site-results').style.display = 'block';
        let totalCost = 0; const rTable = document.getElementById('report-site-table'); rTable.innerHTML = '';
        allBillsList.filter(b => b.site_id === sId).forEach(bill => {
            if(startDt && bill.date < startDt) return;
            if(endDt && bill.date > endDt) return;
            totalCost += bill.total_amount;
            rTable.innerHTML += `<tr><td>${bill.date}</td><td>${bill.bill_number}</td><td>${bill.items_info || '-'}</td><td>Rs. ${bill.total_amount}</td></tr>`;
        });
        document.getElementById('rep-tot').innerText = totalCost.toLocaleString(undefined, {minimumFractionDigits: 2});
    } else {
        const vId = document.getElementById('report-vendor').value; if(!vId) return alert("Select a vendor!");
        document.getElementById('report-vendor-results').style.display = 'block';
        let ledgerData = []; let bfBalance = 0;
        
        allBillsList.filter(b => b.vendor_id === vId).forEach(b => {
            if(startDt && b.date < startDt) { bfBalance += b.total_amount; return; }
            if(endDt && b.date > endDt) return;
            let img = b.attachment_url ? `<a href="${b.attachment_url}" target="_blank"><i class="bi bi-image"></i></a>` : '-';
            ledgerData.push({ date: b.date, ref: b.bill_number, desc: `Bill - ${b.items_info || ''}`, credit_bill: b.total_amount, debit_pay: 0, attach: img });
        });
        
        allPaymentsList.filter(p => p.vendor_id === vId && p.cheque_status !== 'RETURNED').forEach(p => {
            if(startDt && p.payment_date < startDt) { bfBalance -= p.total_amount; return; }
            if(endDt && p.payment_date > endDt) return;
            let img = p.attachment_url ? `<a href="${p.attachment_url}" target="_blank"><i class="bi bi-image"></i></a>` : '-';
            ledgerData.push({ date: p.payment_date, ref: p.payment_id, desc: `Payment - ${p.method.replace('_', ' ')}`, credit_bill: 0, debit_pay: p.total_amount, attach: img });
        });
        
        ledgerData.sort((a, b) => new Date(a.date) - new Date(b.date));
        const lTable = document.getElementById('report-vendor-table'); lTable.innerHTML = '';
        let runningBalance = bfBalance;
        
        if(startDt) { lTable.innerHTML += `<tr class="table-warning"><td colspan="3" class="fw-bold">Brought Forward (B/F) Balance</td><td>-</td><td>-</td><td class="fw-bold text-danger">${bfBalance.toLocaleString()}</td><td>-</td></tr>`; }
        
        ledgerData.forEach(item => {
            runningBalance += (item.credit_bill - item.debit_pay);
            lTable.innerHTML += `<tr><td>${item.date}</td><td>${item.ref}</td><td>${item.desc}</td><td class="ledger-credit">${item.credit_bill > 0 ? item.credit_bill.toLocaleString() : '-'}</td><td class="ledger-debit">${item.debit_pay > 0 ? item.debit_pay.toLocaleString() : '-'}</td><td class="fw-bold">${runningBalance.toLocaleString()}</td><td class="text-center">${item.attach}</td></tr>`;
        });
        document.getElementById('ledger-balance').innerText = runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2});
    }
});

document.getElementById('export-btn').addEventListener('click', () => {
    const isVendor = document.getElementById('report-type').value === 'VENDOR';
    const tableId = isVendor ? "#report-table-vendor-export" : "#report-table-site-export";
    let csv = []; const rows = document.querySelectorAll(`${tableId} tr`);
    if(rows.length === 0) return alert("No data to export!");
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll("td, th");
        let limit = isVendor ? cols.length - 1 : cols.length;
        for (let j = 0; j < limit; j++) row.push(cols[j].innerText.replace(/,/g, ''));
        csv.push(row.join(","));
    }
    const a = document.createElement("a"); a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv.join("\n"));
    a.target = '_blank'; a.download = `Niwasa_${isVendor ? 'Vendor_Ledger' : 'Site_Report'}.csv`; a.click();
});
