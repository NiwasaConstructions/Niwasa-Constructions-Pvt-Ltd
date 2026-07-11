import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, writeBatch, doc, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
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

// --- AUTHENTICATION ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('dashboard-section').style.display = 'block';
        initDataLoad();
    } else {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('dashboard-section').style.display = 'none';
    }
});

document.getElementById('login-btn').addEventListener('click', () => {
    const e = document.getElementById('email').value;
    const p = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, e, p).catch(err => alert(err.message));
});
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// --- NAVIGATION LOGIC ---
const sections = ['vendors', 'sites', 'bills', 'payments'];
sections.forEach(sec => {
    document.getElementById(`nav-${sec}`).addEventListener('click', (e) => {
        // Update active menu
        document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
        if(sec !== 'payments') e.target.classList.add('active'); // Keep payments green
        
        // Show section
        document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`section-${sec}`).classList.add('active');
    });
});

// --- DATA LOGIC ---
let vendorsList = [];
let pendingBillsForPayment = [];

function initDataLoad() {
    // 1. Load Vendors
    onSnapshot(collection(db, "vendors"), (snap) => {
        const vTable = document.getElementById('v-table');
        const vDrops = document.querySelectorAll('.vendor-dropdown');
        vTable.innerHTML = '';
        vendorsList = [];
        let dropHtml = '<option value="">Select Vendor</option>';
        
        snap.forEach(doc => {
            let data = doc.data();
            vendorsList.push({ id: doc.id, ...data });
            vTable.innerHTML += `<tr><td>${data.name}</td><td>${data.contact}</td></tr>`;
            dropHtml += `<option value="${doc.id}">${data.name}</option>`;
        });
        vDrops.forEach(d => d.innerHTML = dropHtml);
    });

    // 2. Load Sites
    onSnapshot(collection(db, "sites"), (snap) => {
        const sTable = document.getElementById('s-table');
        const sDrop = document.querySelector('.site-dropdown');
        sTable.innerHTML = '';
        let dropHtml = '<option value="">Select Site</option>';
        
        snap.forEach(doc => {
            let data = doc.data();
            sTable.innerHTML += `<tr><td>${data.name}</td></tr>`;
            dropHtml += `<option value="${doc.id}">${data.name}</option>`;
        });
        sDrop.innerHTML = dropHtml;
    });

    // 3. Load Bills
    onSnapshot(collection(db, "bills"), (snap) => {
        const bTable = document.getElementById('b-table');
        bTable.innerHTML = '';
        snap.forEach(doc => {
            let d = doc.data();
            bTable.innerHTML += `<tr><td>${d.bill_number}</td><td>${d.total_amount}</td><td>${d.paid_amount}</td><td><span class="badge bg-${d.status === 'SETTLED' ? 'success' : 'warning'}">${d.status}</span></td></tr>`;
        });
    });
}

// Add Vendor
document.getElementById('vendor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "vendors"), {
        name: document.getElementById('v-name').value,
        contact: document.getElementById('v-contact').value
    });
    e.target.reset();
});

// Add Site
document.getElementById('site-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "sites"), { name: document.getElementById('s-name').value });
    e.target.reset();
});

// Add Bill
document.getElementById('bill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('b-type').value;
    const total = parseFloat(document.getElementById('b-amount').value);
    const paid = type === 'CASH' ? total : 0;
    
    await addDoc(collection(db, "bills"), {
        vendor_id: document.getElementById('b-vendor').value,
        site_id: document.getElementById('b-site').value,
        bill_number: document.getElementById('b-number').value,
        total_amount: total,
        paid_amount: paid,
        status: type === 'CASH' ? 'SETTLED' : 'PENDING',
        date: new Date().toISOString()
    });
    alert("Bill Added Successfully!");
    e.target.reset();
});

// --- PAYMENTS & SET-OFF LOGIC ---

// Vendor වෙනස් වෙද්දී අදාල Pending බිල් ටික අරන් එනවා
document.getElementById('p-vendor').addEventListener('change', async (e) => {
    const vId = e.target.value;
    const pContainer = document.getElementById('pending-bills-container');
    const pForm = document.getElementById('payment-form');
    const pbTable = document.getElementById('p-bills-table');
    
    if(!vId) {
        pContainer.style.display = 'none'; pForm.style.display = 'none';
        return;
    }

    // Get PENDING or PARTIAL bills
    const q = query(collection(db, "bills"), where("vendor_id", "==", vId), where("status", "!=", "SETTLED"));
    const snap = await getDocs(q);
    
    pendingBillsForPayment = [];
    pbTable.innerHTML = '';
    
    if(snap.empty) {
        pbTable.innerHTML = '<tr><td colspan="3" class="text-center">No pending bills</td></tr>';
        pContainer.style.display = 'block'; pForm.style.display = 'none';
        return;
    }

    snap.forEach(doc => {
        let d = doc.data();
        let due = d.total_amount - d.paid_amount;
        pendingBillsForPayment.push({ id: doc.id, due: due, original_paid: d.paid_amount, total: d.total_amount });
        
        pbTable.innerHTML += `
            <tr>
                <td>${d.bill_number}</td>
                <td>Rs. ${due}</td>
                <td>
                    <input type="number" class="form-control form-control-sm pay-input" data-id="${doc.id}" data-due="${due}" placeholder="Amount" max="${due}" min="0">
                </td>
            </tr>
        `;
    });

    pContainer.style.display = 'block';
    pForm.style.display = 'flex';

    // Calculate total as user types
    document.querySelectorAll('.pay-input').forEach(input => {
        input.addEventListener('input', () => {
            let tot = 0;
            document.querySelectorAll('.pay-input').forEach(i => tot += Number(i.value || 0));
            document.getElementById('p-total-calc').innerText = tot;
        });
    });
});

// Submit Payment (Batch Write)
document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const vendorId = document.getElementById('p-vendor').value;
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
        alert("Please enter amount to pay for at least one bill.");
        return;
    }

    // Firebase Batch Write Start (Payments save වෙන ගමන් Bills වල ගානත් අඩු වෙනවා)
    const batch = writeBatch(db);

    // 1. Update Bills
    allocations.forEach(alloc => {
        const billRef = doc(db, "bills", alloc.bill_id);
        const billData = pendingBillsForPayment.find(b => b.id === alloc.bill_id);
        
        const newPaid = billData.original_paid + alloc.amount;
        const newStatus = newPaid >= billData.total ? "SETTLED" : "PARTIAL";
        
        batch.update(billRef, { paid_amount: newPaid, status: newStatus });
    });

    // 2. Add Payment Record
    const newPaymentRef = doc(collection(db, "payments"));
    batch.set(newPaymentRef, {
        vendor_id: vendorId,
        total_amount: totalPayment,
        method: document.getElementById('p-method').value,
        reference: document.getElementById('p-ref').value,
        allocations: allocations, // set-off කරපු බිල් වල විස්තර මෙතන save වෙනවා
        date: new Date().toISOString()
    });

    // Commit changes
    try {
        await batch.commit();
        alert("Payment Successful & Bills Updated!");
        document.getElementById('p-vendor').value = "";
        document.getElementById('p-vendor').dispatchEvent(new Event('change')); // Reset UI
        document.getElementById('payment-form').reset();
        document.getElementById('p-total-calc').innerText = "0";
    } catch (err) {
        alert("Error saving payment: " + err.message);
    }
});
