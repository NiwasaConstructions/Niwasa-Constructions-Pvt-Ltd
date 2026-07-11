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

const IMGBB_API_KEY = "3a1d8af31b4c28245b2e1bcaa81d866f"; // ImgBB API Key
let allBillsList = []; 
let allPaymentsList = [];

const generateCustomID = (prefix) => `${prefix}-${Date.now().toString().slice(-4)}${Math.floor(1000 + Math.random() * 9000)}`;

// --- IMGBB UPLOAD HELPER ---
async function uploadToImgBB(file) {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
    });
    const data = await response.json();
    if(data.success) return data.data.url;
    throw new Error("Image upload failed");
}

// --- AUTH & NAV ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('b-date').value = today;
        document.getElementById('p-date').value = today;
        initDataLoad();
    } else {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('dashboard-section').style.display = 'none';
    }
});

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value).catch(err => alert("Login Failed: " + err.message));
});
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
        const vTable = document.getElementById('v-table');
        const vDrops = document.querySelectorAll('.vendor-dropdown');
        vTable.innerHTML = '';
        let dropHtml = '<option value="">Select Vendor...</option>';
        snap.forEach(docSnap => {
            let d = docSnap.data();
            vTable.innerHTML += `<tr><td><span class="badge bg-secondary">${d.custom_id}</span></td><td class="fw-bold">${d.name}</td><td>${d.contact}</td><td>${d.address || '-'}</td></tr>`;
            dropHtml += `<option value="${docSnap.id}">${d.custom_id} - ${d.name}</option>`;
        });
        vDrops.forEach(drop => drop.innerHTML = dropHtml);
    });

    onSnapshot(collection(db, "sites"), (snap) => {
        const sTable = document.getElementById('s-table');
        const sDrops = document.querySelectorAll('.site-dropdown');
        sTable.innerHTML = '';
        let dropHtml = '<option value="">Select Site...</option>';
        snap.forEach(docSnap => {
            sTable.innerHTML += `<tr><td><i class="bi bi-geo-alt text-danger me-2"></i> ${docSnap.data().name}</td></tr>`;
            dropHtml += `<option value="${docSnap.id}">${docSnap.data().name}</option>`;
        });
        sDrops.forEach(drop => drop.innerHTML = dropHtml);
    });

    onSnapshot(collection(db, "bills"), (snap) => {
        allBillsList = [];
        let totalDue = 0;
        snap.forEach(docSnap => {
            let d = docSnap.data();
            allBillsList.push({ id: docSnap.id, ...d });
            totalDue += (d.total_amount - d.paid_amount);
        });
        document.getElementById('dash-due').innerText = totalDue.toLocaleString(undefined, {minimumFractionDigits: 2});
        applyBillFilters(); 
        document.getElementById('report-vendor').dispatchEvent(new Event('change')); 
    });

    onSnapshot(collection(db, "payments"), (snap) => {
        allPaymentsList = [];
        let monthlyPaid = 0, pendingChequesTotal = 0;
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        snap.forEach(docSnap => {
            let d = docSnap.data();
            allPaymentsList.push({ id: docSnap.id, ...d });
            if(d.payment_date && d.payment_date.startsWith(currentMonth) && d.cheque_status !== 'RETURNED') monthlyPaid += d.total_amount;
            if(d.method.includes('CHEQUE') && d.cheque_status === 'PENDING') pendingChequesTotal += d.total_amount;
        });
        document.getElementById('dash-paid').innerText = monthlyPaid.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('dash-cheques').innerText = pendingChequesTotal.toLocaleString(undefined, {minimumFractionDigits: 2});
        
        renderChequesTable();
        document.getElementById('report-vendor').dispatchEvent(new Event('change')); 
    });
}

// --- FORMS ---
document.getElementById('vendor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await setDoc(doc(collection(db, "vendors")), { custom_id: generateCustomID('VEN'), name: document.getElementById('v-name').value, contact: document.getElementById('v-contact').value, address: document.getElementById('v-address').value });
    e.target.reset();
});

document.getElementById('site-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await setDoc(doc(collection(db, "sites")), { name: document.getElementById('s-name').value });
    e.target.reset();
});

// Bill form - with Image Upload
document.getElementById('bill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('b-submit-btn');
    const fileInput = document.getElementById('b-file');
    
    let imageUrl = null;
    if(fileInput.files.length > 0) {
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Uploading...`;
        btn.disabled = true;
        try {
            imageUrl = await uploadToImgBB(fileInput.files[0]);
        } catch (error) {
            alert("Image Upload Failed! Please try again.");
            btn.innerHTML = `<i class="bi bi-save"></i> Save`; btn.disabled = false;
            return;
        }
    }

    const type = document.getElementById('b-type').value;
    const total = parseFloat(document.getElementById('b-amount').value);
    
    await setDoc(doc(collection(db, "bills")), {
        vendor_id: document.getElementById('b-vendor').value,
        site_id: document.getElementById('b-site').value,
        items_info: document.getElementById('b-items').value,
        bill_number: document.getElementById('b-number').value,
        date: document.getElementById('b-date').value,
        total_amount: total,
        paid_amount: type === 'CASH' ? total : 0,
        status: type === 'CASH' ? 'SETTLED' : 'PENDING',
        attachment_url: imageUrl, // Add image URL to database
        created_at: new Date().toISOString()
    });
    
    alert("Bill Saved!"); 
    e.target.reset(); 
    document.getElementById('b-date').value = new Date().toISOString().split('T')[0];
    btn.innerHTML = `<i class="bi bi-save"></i> Save`; btn.disabled = false;
});

// --- BILLS LIST & DELETE ---
function applyBillFilters() {
    const searchText = document.getElementById('search-bills').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    const filtered = allBillsList.filter(b => {
        const matchesSearch = b.bill_number.toLowerCase().includes(searchText) || b.total_amount.toString().includes(searchText);
        let matchesStatus = true;
        if (statusFilter === 'PENDING') matchesStatus = (b.status === 'PENDING' || b.status === 'PARTIAL');
        if (statusFilter === 'SETTLED') matchesStatus = (b.status === 'SETTLED');
        return matchesSearch && matchesStatus;
    });
    
    const bTable = document.getElementById('b-table');
    bTable.innerHTML = '';
    filtered.forEach(d => {
        let statusColor = d.status === 'SETTLED' ? 'success' : (d.status === 'PARTIAL' ? 'info' : 'warning');
        let imgBtn = d.attachment_url ? `<a href="${d.attachment_url}" target="_blank" class="btn btn-sm btn-outline-primary"><i class="bi bi-image"></i> View</a>` : '-';
        
        bTable.innerHTML += `<tr>
            <td>${d.date}</td><td class="fw-bold">${d.bill_number}</td>
            <td><span class="badge bg-light text-dark border">${d.items_info || '-'}</span></td>
            <td>Rs. ${d.total_amount}</td><td class="text-success">Rs. ${d.paid_amount}</td>
            <td><span class="badge bg-${statusColor}">${d.status}</span></td>
            <td>${imgBtn}</td>
            <td><button class="btn btn-sm btn-outline-danger del-bill-btn" data-id="${d.id}" data-paid="${d.paid_amount}"><i class="bi bi-trash"></i></button></td>
        </tr>`;
    });

    document.querySelectorAll('.del-bill-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const btnEl = e.currentTarget;
            if(Number(btnEl.dataset.paid) > 0) return alert("Cannot delete! This bill has payments attached.");
            if(confirm("Delete this bill forever?")) await deleteDoc(doc(db, "bills", btnEl.dataset.id));
        });
    });
}
document.getElementById('search-bills').addEventListener('input', applyBillFilters);
document.getElementById('filter-status').addEventListener('change', applyBillFilters);

// --- PAYMENTS ---
document.getElementById('p-method').addEventListener('change', (e) => {
    const isCheque = e.target.value.includes('CHEQUE');
    document.getElementById('cheque-box').style.display = isCheque ? 'flex' : 'none';
    document.getElementById('p-cheque-no').required = isCheque;
    document.getElementById('p-cheque-date').required = isCheque;
});

document.getElementById('p-vendor').addEventListener('change', (e) => {
    const vId = e.target.value;
    const pbTable = document.getElementById('p-bills-table');
    if(!vId) { document.getElementById('pending-bills-container').style.display = 'none'; document.getElementById('payment-form').style.display = 'none'; return; }
    
    pbTable.innerHTML = '';
    const pendingBills = allBillsList.filter(b => b.vendor_id === vId && b.status !== 'SETTLED');
    if(pendingBills.length === 0) {
        pbTable.innerHTML = '<tr><td colspan="3" class="text-center text-danger">No pending bills.</td></tr>';
    } else {
        pendingBills.forEach(d => {
            let due = d.total_amount - d.paid_amount;
            pbTable.innerHTML += `<tr>
                <td class="fw-bold">${d.bill_number} <br><span class="badge bg-secondary">${d.items_info || '-'}</span></td>
                <td class="text-danger fw-bold">Rs. ${due}</td>
                <td><input type="number" class="form-control pay-input border-primary" data-id="${d.id}" max="${due}" min="0"></td>
            </tr>`;
        });
    }
    document.getElementById('pending-bills-container').style.display = 'block';
    document.getElementById('payment-form').style.display = 'flex';

    document.querySelectorAll('.pay-input').forEach(input => {
        input.addEventListener('input', () => {
            let tot = 0; document.querySelectorAll('.pay-input').forEach(i => tot += Number(i.value || 0));
            document.getElementById('p-total-calc').innerText = tot.toLocaleString();
        });
    });
});

// Payment form - with Image Upload
document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let allocations = []; let totalPayment = 0;
    document.querySelectorAll('.pay-input').forEach(input => {
        const amt = Number(input.value);
        if(amt > 0) { allocations.push({ bill_id: input.dataset.id, amount: amt }); totalPayment += amt; }
    });

    if(totalPayment <= 0) return alert("Enter payment amount!");

    const btn = document.getElementById('p-submit-btn');
    const fileInput = document.getElementById('p-file');
    let imageUrl = null;
    
    if(fileInput.files.length > 0) {
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Uploading...`;
        btn.disabled = true;
        try {
            imageUrl = await uploadToImgBB(fileInput.files[0]);
        } catch (error) {
            alert("Slip Upload Failed! Try again.");
            btn.innerHTML = `<i class="bi bi-check-circle"></i> Confirm`; btn.disabled = false;
            return;
        }
    }

    const batch = writeBatch(db);
    allocations.forEach(alloc => {
        const bill = allBillsList.find(b => b.id === alloc.bill_id);
        const newPaid = bill.paid_amount + alloc.amount;
        batch.update(doc(db, "bills", alloc.bill_id), { paid_amount: newPaid, status: newPaid >= bill.total_amount ? "SETTLED" : "PARTIAL" });
    });

    const isCheque = document.getElementById('p-method').value.includes('CHEQUE');
    batch.set(doc(collection(db, "payments")), {
        payment_id: generateCustomID('PAY'), vendor_id: document.getElementById('p-vendor').value,
        payment_date: document.getElementById('p-date').value, total_amount: totalPayment,
        method: document.getElementById('p-method').value,
        cheque_number: isCheque ? document.getElementById('p-cheque-no').value : null,
        cheque_date: isCheque ? document.getElementById('p-cheque-date').value : null,
        cheque_status: isCheque ? 'PENDING' : null,
        attachment_url: imageUrl, // Save image URL for payment
        allocations: allocations, timestamp: new Date().toISOString()
    });

    await batch.commit().then(() => {
        alert("Payment Saved!");
        document.getElementById('p-vendor').value = ""; document.getElementById('p-vendor').dispatchEvent(new Event('change'));
        document.getElementById('payment-form').reset(); document.getElementById('p-total-calc').innerText = "0";
    }).catch(err => alert("Error: " + err.message)).finally(() => {
        btn.innerHTML = `<i class="bi bi-check-circle"></i> Confirm`; btn.disabled = false;
    });
});

// --- CHEQUES LOGIC ---
function renderChequesTable() {
    const cTable = document.getElementById('cheques-table');
    cTable.innerHTML = '';
    const pendingCheques = allPaymentsList.filter(p => p.method.includes('CHEQUE') && p.cheque_status === 'PENDING');
    
    if(pendingCheques.length === 0) { cTable.innerHTML = '<tr><td colspan="6" class="text-center text-success">No pending cheques.</td></tr>'; return; }

    pendingCheques.forEach(chk => {
        let imgBtn = chk.attachment_url ? `<a href="${chk.attachment_url}" target="_blank" class="btn btn-sm btn-outline-primary"><i class="bi bi-image"></i> View</a>` : '-';
        cTable.innerHTML += `<tr>
            <td>${chk.cheque_date || chk.payment_date}</td><td class="fw-bold text-primary">${chk.cheque_number}</td>
            <td>${chk.method.replace('_CHEQUE', '')} Bank</td><td class="fw-bold text-danger">Rs. ${chk.total_amount}</td>
            <td>${imgBtn}</td>
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
        if(confirm("Are you sure this cheque returned? This will reverse the payments on the associated bills!")) {
            const payId = e.currentTarget.dataset.id;
            const payDoc = allPaymentsList.find(p => p.id === payId);
            const batch = writeBatch(db);
            
            payDoc.allocations.forEach(alloc => {
                const bill = allBillsList.find(b => b.id === alloc.bill_id);
                if(bill) {
                    let newPaid = bill.paid_amount - alloc.amount;
                    let newStatus = newPaid <= 0 ? 'PENDING' : 'PARTIAL';
                    batch.update(doc(db, "bills", bill.id), { paid_amount: newPaid, status: newStatus });
                }
            });
            batch.update(doc(db, "payments", payId), { cheque_status: "RETURNED" });
            await batch.commit();
            alert("Cheque marked as returned and bills reverted.");
        }
    }));
}

// --- REPORTS ---
document.getElementById('report-type').addEventListener('change', (e) => {
    const isVendor = e.target.value === 'VENDOR';
    document.getElementById('report-site-div').style.display = isVendor ? 'none' : 'block';
    document.getElementById('report-vendor-div').style.display = isVendor ? 'block' : 'none';
    document.getElementById('report-site-results').style.display = 'none';
    document.getElementById('report-vendor-results').style.display = 'none';
});

// Site Report
document.getElementById('report-site').addEventListener('change', (e) => {
    const sId = e.target.value;
    if(!sId || document.getElementById('report-type').value !== 'SITE') return;
    document.getElementById('report-site-results').style.display = 'block';
    
    let totalCost = 0; const rTable = document.getElementById('report-site-table'); rTable.innerHTML = '';
    allBillsList.filter(b => b.site_id === sId).forEach(bill => {
        totalCost += bill.total_amount;
        rTable.innerHTML += `<tr><td>${bill.date}</td><td>${bill.bill_number}</td><td>${bill.items_info || '-'}</td><td>Rs. ${bill.total_amount}</td></tr>`;
    });
    document.getElementById('rep-tot').innerText = totalCost.toLocaleString(undefined, {minimumFractionDigits: 2});
});

// Vendor Ledger Report
document.getElementById('report-vendor').addEventListener('change', (e) => {
    const vId = e.target.value;
    if(!vId || document.getElementById('report-type').value !== 'VENDOR') return;
    document.getElementById('report-vendor-results').style.display = 'block';
    
    let ledgerData = [];
    
    allBillsList.filter(b => b.vendor_id === vId).forEach(b => {
        let img = b.attachment_url ? `<a href="${b.attachment_url}" target="_blank"><i class="bi bi-image"></i></a>` : '-';
        ledgerData.push({ date: b.date, ref: b.bill_number, desc: `Bill - ${b.items_info || ''}`, credit_bill: b.total_amount, debit_pay: 0, attach: img });
    });
    
    allPaymentsList.filter(p => p.vendor_id === vId && p.cheque_status !== 'RETURNED').forEach(p => {
        let methodText = p.method.includes('CHEQUE') ? `Cheque (${p.cheque_number})` : p.method;
        let img = p.attachment_url ? `<a href="${p.attachment_url}" target="_blank"><i class="bi bi-image"></i></a>` : '-';
        ledgerData.push({ date: p.payment_date, ref: p.payment_id, desc: `Payment - ${methodText}`, credit_bill: 0, debit_pay: p.total_amount, attach: img });
    });
    
    ledgerData.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const lTable = document.getElementById('report-vendor-table'); lTable.innerHTML = '';
    let runningBalance = 0;
    
    ledgerData.forEach(item => {
        runningBalance += (item.credit_bill - item.debit_pay);
        lTable.innerHTML += `<tr>
            <td>${item.date}</td><td>${item.ref}</td><td>${item.desc}</td>
            <td class="ledger-credit">${item.credit_bill > 0 ? item.credit_bill.toLocaleString() : '-'}</td>
            <td class="ledger-debit">${item.debit_pay > 0 ? item.debit_pay.toLocaleString() : '-'}</td>
            <td class="fw-bold">${runningBalance.toLocaleString()}</td>
            <td class="text-center">${item.attach}</td>
        </tr>`;
    });
    document.getElementById('ledger-balance').innerText = runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2});
});

// CSV Export (Removes icon HTML for CSV)
document.getElementById('export-btn').addEventListener('click', () => {
    const isVendor = document.getElementById('report-type').value === 'VENDOR';
    const tableId = isVendor ? "#report-table-vendor-export" : "#report-table-site-export";
    let csv = [];
    const rows = document.querySelectorAll(`${tableId} tr`);
    if(rows.length === 0) return alert("No data to export!");
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll("td, th");
        // Don't include attachment column in CSV for ledger (last col)
        let limit = isVendor ? cols.length - 1 : cols.length;
        for (let j = 0; j < limit; j++) row.push(cols[j].innerText.replace(/,/g, ''));
        csv.push(row.join(","));
    }
    const a = document.createElement("a");
    a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv.join("\n"));
    a.target = '_blank';
    a.download = `Niwasa_${isVendor ? 'Vendor_Ledger' : 'Site_Report'}.csv`;
    a.click();
});
