import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore, collection, setDoc, doc, onSnapshot, query, where, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
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

let allBillsList = []; // For reports

const generateCustomID = (prefix) => {
    return `${prefix}-${Date.now().toString().slice(-4)}${Math.floor(1000 + Math.random() * 9000)}`;
};

// --- AUTHENTICATION ---
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
    const e = document.getElementById('email').value;
    const p = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, e, p).catch(err => alert("Login Failed: " + err.message));
});
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// --- NAVIGATION LOGIC ---
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        document.querySelectorAll('.app-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(`section-${e.currentTarget.getAttribute('data-target')}`).classList.add('active');
    });
});

// --- DATA LOGIC ---
let pendingBillsForPayment = [];

function initDataLoad() {
    onSnapshot(collection(db, "vendors"), (snap) => {
        const vTable = document.getElementById('v-table');
        const vDrops = document.querySelectorAll('.vendor-dropdown');
        vTable.innerHTML = '';
        let dropHtml = '<option value="">Select Vendor...</option>';
        
        snap.forEach(docSnap => {
            let data = docSnap.data();
            vTable.innerHTML += `<tr><td><span class="badge bg-secondary">${data.custom_id}</span></td><td class="fw-bold">${data.name}</td><td>${data.contact}</td><td>${data.address || '-'}</td></tr>`;
            dropHtml += `<option value="${docSnap.id}">${data.custom_id} - ${data.name}</option>`;
        });
        vDrops.forEach(d => d.innerHTML = dropHtml);
    });

    onSnapshot(collection(db, "sites"), (snap) => {
        const sTable = document.getElementById('s-table');
        const sDrop = document.querySelectorAll('.site-dropdown');
        sTable.innerHTML = '';
        let dropHtml = '<option value="">Select Site...</option>';
        
        snap.forEach(docSnap => {
            let data = docSnap.data();
            sTable.innerHTML += `<tr><td><i class="bi bi-geo-alt text-danger me-2"></i> ${data.name}</td></tr>`;
            dropHtml += `<option value="${docSnap.id}">${data.name}</option>`;
        });
        sDrop.forEach(d => d.innerHTML = dropHtml);
    });

    // Load Bills & Calculate Dashboard Total Due
    onSnapshot(collection(db, "bills"), (snap) => {
        const bTable = document.getElementById('b-table');
        bTable.innerHTML = '';
        allBillsList = [];
        let totalDueAmount = 0;

        snap.forEach(docSnap => {
            let d = docSnap.data();
            allBillsList.push(d); // Save for reports
            totalDueAmount += (d.total_amount - d.paid_amount);

            let statusColor = d.status === 'SETTLED' ? 'success' : (d.status === 'PARTIAL' ? 'info' : 'warning');
            bTable.innerHTML += `<tr>
                <td>${d.date}</td>
                <td class="fw-bold">${d.bill_number}</td>
                <td><span class="badge bg-secondary">${d.category || '-'}</span></td>
                <td>Rs. ${d.total_amount}</td>
                <td><span class="badge bg-${statusColor}">${d.status}</span></td>
            </tr>`;
        });
        
        // Update Dashboard Outstanding
        document.getElementById('dash-due').innerText = totalDueAmount.toLocaleString(undefined, {minimumFractionDigits: 2});
        
        // Trigger report update if site is selected
        document.getElementById('report-site').dispatchEvent(new Event('change'));
    });

    // Load Payments & Calculate Dashboard Monthly Paid & Cheques
    onSnapshot(collection(db, "payments"), (snap) => {
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const todayStr = new Date().toISOString().split('T')[0];
        let monthlyPaid = 0;
        let cTable = document.getElementById('cheque-reminders');
        cTable.innerHTML = '';

        snap.forEach(docSnap => {
            let d = docSnap.data();
            
            // Monthly calc
            if(d.payment_date && d.payment_date.startsWith(currentMonth)) {
                monthlyPaid += d.total_amount;
            }

            // Cheque reminders (Pending cheques from today onwards)
            if(d.method.includes('CHEQUE') && d.cheque_date && d.cheque_date >= todayStr) {
                cTable.innerHTML += `<tr>
                    <td class="text-danger fw-bold">${d.cheque_date}</td>
                    <td>${d.cheque_number}</td>
                    <td>Rs. ${d.total_amount}</td>
                    <td><span class="badge bg-warning text-dark">Pending Clearance</span></td>
                </tr>`;
            }
        });
        
        if(cTable.innerHTML === '') cTable.innerHTML = '<tr><td colspan="4" class="text-center">No upcoming cheques.</td></tr>';
        
        // Update Dashboard Monthly Paid
        document.getElementById('dash-paid').innerText = monthlyPaid.toLocaleString(undefined, {minimumFractionDigits: 2});
    });
}

// --- FORMS LOGIC ---
document.getElementById('vendor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await setDoc(doc(collection(db, "vendors")), {
        custom_id: generateCustomID('VEN'),
        name: document.getElementById('v-name').value,
        contact: document.getElementById('v-contact').value,
        address: document.getElementById('v-address').value
    });
    e.target.reset();
});

document.getElementById('site-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await setDoc(doc(collection(db, "sites")), { name: document.getElementById('s-name').value });
    e.target.reset();
});

document.getElementById('bill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('b-type').value;
    const total = parseFloat(document.getElementById('b-amount').value);
    
    await setDoc(doc(collection(db, "bills")), {
        vendor_id: document.getElementById('b-vendor').value,
        site_id: document.getElementById('b-site').value,
        category: document.getElementById('b-category').value, // අලුත් ෆීචර් එක
        bill_number: document.getElementById('b-number').value,
        date: document.getElementById('b-date').value,
        total_amount: total,
        paid_amount: type === 'CASH' ? total : 0,
        status: type === 'CASH' ? 'SETTLED' : 'PENDING',
        created_at: new Date().toISOString()
    });
    alert("Bill Saved!");
    e.target.reset();
    document.getElementById('b-date').value = new Date().toISOString().split('T')[0];
});

// --- PAYMENTS LOGIC ---
document.getElementById('p-method').addEventListener('change', (e) => {
    const isCheque = e.target.value.includes('CHEQUE');
    document.getElementById('cheque-box').style.display = isCheque ? 'flex' : 'none';
    document.getElementById('p-cheque-no').required = isCheque;
    document.getElementById('p-cheque-date').required = isCheque;
});

document.getElementById('p-vendor').addEventListener('change', async (e) => {
    const vId = e.target.value;
    const pContainer = document.getElementById('pending-bills-container');
    const pForm = document.getElementById('payment-form');
    const pbTable = document.getElementById('p-bills-table');
    
    if(!vId) { pContainer.style.display = 'none'; pForm.style.display = 'none'; return; }

    const q = query(collection(db, "bills"), where("vendor_id", "==", vId), where("status", "!=", "SETTLED"));
    const snap = await getDocs(q);
    
    pendingBillsForPayment = [];
    pbTable.innerHTML = '';
    
    if(snap.empty) {
        pbTable.innerHTML = '<tr><td colspan="3" class="text-center text-danger py-3">No pending bills.</td></tr>';
        pContainer.style.display = 'block'; pForm.style.display = 'none'; return;
    }

    snap.forEach(docSnap => {
        let d = docSnap.data();
        let due = d.total_amount - d.paid_amount;
        pendingBillsForPayment.push({ id: docSnap.id, due: due, original_paid: d.paid_amount, total: d.total_amount });
        
        pbTable.innerHTML += `
            <tr>
                <td class="fw-bold">${d.bill_number} <br><span class="badge bg-secondary">${d.category || 'N/A'}</span></td>
                <td class="text-danger fw-bold">Rs. ${due}</td>
                <td><input type="number" class="form-control pay-input border-primary" data-id="${docSnap.id}" max="${due}" min="0"></td>
            </tr>
        `;
    });

    pContainer.style.display = 'block'; pForm.style.display = 'flex';

    document.querySelectorAll('.pay-input').forEach(input => {
        input.addEventListener('input', () => {
            let tot = 0; document.querySelectorAll('.pay-input').forEach(i => tot += Number(i.value || 0));
            document.getElementById('p-total-calc').innerText = tot.toLocaleString();
        });
    });
});

document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    let allocations = []; let totalPayment = 0;

    document.querySelectorAll('.pay-input').forEach(input => {
        const amount = Number(input.value);
        if(amount > 0) { allocations.push({ bill_id: input.dataset.id, amount: amount }); totalPayment += amount; }
    });

    if(totalPayment <= 0) { alert("Enter amount to pay!"); return; }

    const batch = writeBatch(db);

    allocations.forEach(alloc => {
        const billRef = doc(db, "bills", alloc.bill_id);
        const billData = pendingBillsForPayment.find(b => b.id === alloc.bill_id);
        const newPaid = billData.original_paid + alloc.amount;
        batch.update(billRef, { paid_amount: newPaid, status: newPaid >= billData.total ? "SETTLED" : "PARTIAL" });
    });

    const isCheque = document.getElementById('p-method').value.includes('CHEQUE');
    const newPaymentRef = doc(collection(db, "payments"));
    
    batch.set(newPaymentRef, {
        payment_id: generateCustomID('PAY'),
        vendor_id: document.getElementById('p-vendor').value,
        payment_date: document.getElementById('p-date').value,
        total_amount: totalPayment,
        method: document.getElementById('p-method').value,
        cheque_number: isCheque ? document.getElementById('p-cheque-no').value : null,
        cheque_date: isCheque ? document.getElementById('p-cheque-date').value : null,
        allocations: allocations,
        timestamp: new Date().toISOString()
    });

    await batch.commit().then(() => {
        alert("Payment Saved!");
        document.getElementById('p-vendor').value = "";
        document.getElementById('p-vendor').dispatchEvent(new Event('change'));
        document.getElementById('payment-form').reset();
    }).catch(err => alert("Error: " + err.message));
});

// --- REPORTS LOGIC ---
document.getElementById('report-site').addEventListener('change', (e) => {
    const sId = e.target.value;
    const repResults = document.getElementById('report-results');
    const repTable = document.getElementById('report-table');
    
    if(!sId) { repResults.style.display = 'none'; return; }
    
    repResults.style.display = 'block';
    repTable.innerHTML = '';
    
    let totalCost = 0;
    let totalPaid = 0;

    allBillsList.forEach(bill => {
        if(bill.site_id === sId) {
            totalCost += bill.total_amount;
            totalPaid += bill.paid_amount;
            repTable.innerHTML += `<tr>
                <td>${bill.date}</td>
                <td>${bill.bill_number}</td>
                <td>${bill.category || '-'}</td>
                <td>Rs. ${bill.total_amount}</td>
            </tr>`;
        }
    });
    
    if(repTable.innerHTML === '') repTable.innerHTML = '<tr><td colspan="4" class="text-center">No bills found for this site.</td></tr>';
    
    document.getElementById('rep-tot').innerText = totalCost.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('rep-paid').innerText = totalPaid.toLocaleString(undefined, {minimumFractionDigits: 2});
});
