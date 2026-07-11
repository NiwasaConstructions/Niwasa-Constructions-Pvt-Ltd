import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore, collection, setDoc, doc, onSnapshot, query, where, writeBatch, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
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

// --- UTILITY: Generate Custom IDs ---
const generateCustomID = (prefix) => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const timePart = Date.now().toString().slice(-4);
    return `${prefix}-${timePart}${randomNum}`;
};

// --- AUTHENTICATION ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        
        // Set today's date in date pickers
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

// --- NAVIGATION LOGIC (FIXED) ---
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        // 1. Remove active class from all links
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        // 2. Add active to clicked link
        e.currentTarget.classList.add('active');
        
        // 3. Hide all sections
        document.querySelectorAll('.app-section').forEach(sec => sec.classList.remove('active'));
        // 4. Show target section
        const targetId = e.currentTarget.getAttribute('data-target');
        document.getElementById(`section-${targetId}`).classList.add('active');
    });
});

// --- DATA LOGIC ---
let pendingBillsForPayment = [];

function initDataLoad() {
    // 1. Load Vendors
    onSnapshot(collection(db, "vendors"), (snap) => {
        const vTable = document.getElementById('v-table');
        const vDrops = document.querySelectorAll('.vendor-dropdown');
        vTable.innerHTML = '';
        let dropHtml = '<option value="">Select Vendor...</option>';
        
        snap.forEach(document => {
            let data = document.data();
            vTable.innerHTML += `<tr>
                <td><span class="badge bg-secondary">${data.custom_id}</span></td>
                <td class="fw-bold">${data.name}</td>
                <td>${data.contact}</td>
                <td>${data.address || '-'}</td>
            </tr>`;
            dropHtml += `<option value="${document.id}">${data.custom_id} - ${data.name}</option>`;
        });
        vDrops.forEach(d => d.innerHTML = dropHtml);
    });

    // 2. Load Sites
    onSnapshot(collection(db, "sites"), (snap) => {
        const sTable = document.getElementById('s-table');
        const sDrop = document.querySelector('.site-dropdown');
        sTable.innerHTML = '';
        let dropHtml = '<option value="">Select Site...</option>';
        
        snap.forEach(document => {
            let data = document.data();
            sTable.innerHTML += `<tr><td><i class="bi bi-geo-alt text-danger me-2"></i> ${data.name}</td></tr>`;
            dropHtml += `<option value="${document.id}">${data.name}</option>`;
        });
        sDrop.innerHTML = dropHtml;
    });

    // 3. Load Bills
    onSnapshot(collection(db, "bills"), (snap) => {
        const bTable = document.getElementById('b-table');
        bTable.innerHTML = '';
        snap.forEach(document => {
            let d = document.data();
            let statusColor = d.status === 'SETTLED' ? 'success' : (d.status === 'PARTIAL' ? 'info' : 'warning');
            bTable.innerHTML += `<tr>
                <td>${d.date}</td>
                <td class="fw-bold">${d.bill_number}</td>
                <td>Rs. ${d.total_amount}</td>
                <td class="text-success">Rs. ${d.paid_amount}</td>
                <td><span class="badge bg-${statusColor}">${d.status}</span></td>
            </tr>`;
        });
    });
}

// Add Vendor
document.getElementById('vendor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const customId = generateCustomID('VEN');
    
    // Create reference with auto ID, but save custom ID inside
    const newVendorRef = doc(collection(db, "vendors")); 
    await setDoc(newVendorRef, {
        custom_id: customId,
        name: document.getElementById('v-name').value,
        contact: document.getElementById('v-contact').value,
        address: document.getElementById('v-address').value
    });
    e.target.reset();
});

// Add Site
document.getElementById('site-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newSiteRef = doc(collection(db, "sites"));
    await setDoc(newSiteRef, { name: document.getElementById('s-name').value });
    e.target.reset();
});

// Add Bill
document.getElementById('bill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('b-type').value;
    const total = parseFloat(document.getElementById('b-amount').value);
    const paid = type === 'CASH' ? total : 0;
    
    const newBillRef = doc(collection(db, "bills"));
    await setDoc(newBillRef, {
        vendor_id: document.getElementById('b-vendor').value,
        site_id: document.getElementById('b-site').value,
        bill_number: document.getElementById('b-number').value,
        date: document.getElementById('b-date').value,
        total_amount: total,
        paid_amount: paid,
        status: type === 'CASH' ? 'SETTLED' : 'PENDING',
        created_at: new Date().toISOString()
    });
    alert("Bill Saved!");
    e.target.reset();
    document.getElementById('b-date').value = new Date().toISOString().split('T')[0];
});

// --- PAYMENTS & SET-OFF LOGIC ---

// Cheque Box UI Toggle
document.getElementById('p-method').addEventListener('change', (e) => {
    const val = e.target.value;
    const chequeBox = document.getElementById('cheque-box');
    const chequeInput = document.getElementById('p-cheque-no');
    
    if (val.includes('CHEQUE')) {
        chequeBox.style.display = 'block';
        chequeInput.required = true;
    } else {
        chequeBox.style.display = 'none';
        chequeInput.required = false;
        chequeInput.value = '';
    }
});

// Load Pending Bills for Vendor
document.getElementById('p-vendor').addEventListener('change', async (e) => {
    const vId = e.target.value;
    const pContainer = document.getElementById('pending-bills-container');
    const pForm = document.getElementById('payment-form');
    const pbTable = document.getElementById('p-bills-table');
    
    if(!vId) {
        pContainer.style.display = 'none'; pForm.style.display = 'none';
        return;
    }

    const q = query(collection(db, "bills"), where("vendor_id", "==", vId), where("status", "!=", "SETTLED"));
    const snap = await getDocs(q);
    
    pendingBillsForPayment = [];
    pbTable.innerHTML = '';
    
    if(snap.empty) {
        pbTable.innerHTML = '<tr><td colspan="3" class="text-center text-danger py-3">No pending bills for this vendor.</td></tr>';
        pContainer.style.display = 'block'; pForm.style.display = 'none';
        return;
    }

    snap.forEach(document => {
        let d = document.data();
        let due = d.total_amount - d.paid_amount;
        pendingBillsForPayment.push({ id: document.id, due: due, original_paid: d.paid_amount, total: d.total_amount });
        
        pbTable.innerHTML += `
            <tr>
                <td class="fw-bold">${d.bill_number} <br><small class="text-muted">Date: ${d.date}</small></td>
                <td class="text-danger fw-bold">Rs. ${due}</td>
                <td>
                    <input type="number" class="form-control pay-input border-primary" data-id="${document.id}" placeholder="Enter amount" max="${due}" min="0">
                </td>
            </tr>
        `;
    });

    pContainer.style.display = 'block';
    pForm.style.display = 'flex';

    // Calculate total on typing
    document.querySelectorAll('.pay-input').forEach(input => {
        input.addEventListener('input', () => {
            let tot = 0;
            document.querySelectorAll('.pay-input').forEach(i => tot += Number(i.value || 0));
            document.getElementById('p-total-calc').innerText = tot.toLocaleString();
        });
    });
});

// Submit Payment
document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = document.querySelectorAll('.pay-input');
    
    let allocations = [];
    let totalPayment = 0;

    inputs.forEach(input => {
        const amount = Number(input.value);
        if(amount > 0) {
            allocations.push({ bill_id: input.dataset.id, amount: amount });
            totalPayment += amount;
        }
    });

    if(totalPayment <= 0) {
        alert("Please enter a payment amount for at least one bill.");
        return;
    }

    const batch = writeBatch(db);

    // 1. Update Bills
    allocations.forEach(alloc => {
        const billRef = doc(db, "bills", alloc.bill_id);
        const billData = pendingBillsForPayment.find(b => b.id === alloc.bill_id);
        
        const newPaid = billData.original_paid + alloc.amount;
        const newStatus = newPaid >= billData.total ? "SETTLED" : "PARTIAL";
        
        batch.update(billRef, { paid_amount: newPaid, status: newStatus });
    });

    // 2. Add Payment Record with Custom ID
    const payCustomId = generateCustomID('PAY');
    const newPaymentRef = doc(collection(db, "payments"));
    batch.set(newPaymentRef, {
        payment_id: payCustomId,
        vendor_id: document.getElementById('p-vendor').value,
        payment_date: document.getElementById('p-date').value,
        total_amount: totalPayment,
        method: document.getElementById('p-method').value,
        cheque_number: document.getElementById('p-cheque-no').value || null,
        allocations: allocations,
        timestamp: new Date().toISOString()
    });

    try {
        await batch.commit();
        alert(`Payment Saved Successfully!\nPayment ID: ${payCustomId}`);
        
        // Reset UI
        document.getElementById('p-vendor').value = "";
        document.getElementById('p-vendor').dispatchEvent(new Event('change'));
        document.getElementById('payment-form').reset();
        document.getElementById('p-total-calc').innerText = "0";
    } catch (err) {
        alert("Error saving payment: " + err.message);
    }
});
